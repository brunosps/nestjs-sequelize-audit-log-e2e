import fs from 'node:fs';
import path from 'node:path';

import { QueryTypes, Sequelize } from 'sequelize';

import { auditTables } from './config';
import { createMssqlSequelize, createMysqlSequelize } from './db';
import { readManifest } from './manifest';
import { readProtocols } from './protocols';

type CountRow = { count: number | string };
type TypeCountRow = { logType?: string; log_type?: string; count: number | string };

const childTables = auditTables.filter((table) => table !== 'audit_logs');
const reportPath = path.resolve(process.cwd(), 'artifacts', 'verify-report.json');

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

async function scalar(sequelize: Sequelize, sql: string) {
  const rows = await sequelize.query<CountRow>(sql, { type: QueryTypes.SELECT });
  return toNumber(rows[0]?.count);
}

async function tableCount(sequelize: Sequelize, table: string) {
  return scalar(sequelize, `SELECT COUNT(*) AS count FROM ${table}`);
}

async function parentCountsByType(sequelize: Sequelize) {
  const rows = await sequelize.query<TypeCountRow>(
    'SELECT log_type AS logType, COUNT(*) AS count FROM audit_logs GROUP BY log_type',
    { type: QueryTypes.SELECT },
  );

  return Object.fromEntries(
    rows.map((row) => [String(row.logType ?? row.log_type), toNumber(row.count)]),
  );
}

async function childCounts(sequelize: Sequelize) {
  const counts: Record<string, number> = {};
  for (const table of childTables) {
    counts[table] = await tableCount(sequelize, table);
  }
  return counts;
}

async function orphanCounts(sequelize: Sequelize) {
  const counts: Record<string, number> = {};
  for (const table of childTables) {
    counts[table] = await scalar(
      sequelize,
      `SELECT COUNT(*) AS count FROM ${table} c LEFT JOIN audit_logs p ON p.id = c.log_id WHERE p.id IS NULL`,
    );
  }
  return counts;
}

async function duplicateParentCount(sequelize: Sequelize) {
  return scalar(
    sequelize,
    'SELECT COUNT(*) - COUNT(DISTINCT id) AS count FROM audit_logs',
  );
}

/**
 * Todo protocolo devolvido pela lib tem de resolver para uma linha real em
 * audit_logs, com o mesmo log_type que o chamador registrou.
 */
async function protocolResolution(sequelize: Sequelize) {
  const expectedTypeById = new Map(
    readProtocols().map((record) => [record.protocol, record.logType]),
  );
  const ids = [...expectedTypeById.keys()];
  const foundTypeById = new Map<string, string>();

  for (let start = 0; start < ids.length; start += 500) {
    const chunk = ids.slice(start, start + 500);
    const rows = await sequelize.query<{ id: string; logType: string }>(
      'SELECT id, log_type AS logType FROM audit_logs WHERE id IN (:ids)',
      { type: QueryTypes.SELECT, replacements: { ids: chunk } },
    );

    for (const row of rows) {
      foundTypeById.set(row.id, String(row.logType));
    }
  }

  const missing = ids.filter((id) => !foundTypeById.has(id));
  const mismatched = ids.filter(
    (id) =>
      foundTypeById.has(id) && foundTypeById.get(id) !== expectedTypeById.get(id),
  );

  return {
    total: ids.length,
    missingCount: missing.length,
    mismatchedCount: mismatched.length,
    missingSample: missing.slice(0, 20),
    mismatchedSample: mismatched.slice(0, 20),
  };
}

async function collectSnapshot(mysql: Sequelize, mssql: Sequelize) {
  const [sourceParentTotal, archiveParentTotal] = await Promise.all([
    tableCount(mysql, 'audit_logs'),
    tableCount(mssql, 'audit_logs'),
  ]);

  return {
    source: {
      total: sourceParentTotal,
      childTables: await childCounts(mysql),
    },
    archive: {
      total: archiveParentTotal,
      byType: await parentCountsByType(mssql),
      childTables: await childCounts(mssql),
      orphanTables: await orphanCounts(mssql),
      duplicateParents: await duplicateParentCount(mssql),
      protocols: await protocolResolution(mssql),
    },
  };
}

function validate(snapshot: Awaited<ReturnType<typeof collectSnapshot>>) {
  const manifest = readManifest();
  const failures: string[] = [];

  if (snapshot.source.total !== 0) {
    failures.push(`source audit_logs expected 0, got ${snapshot.source.total}`);
  }

  for (const [table, count] of Object.entries(snapshot.source.childTables)) {
    if (count !== 0) {
      failures.push(`source ${table} expected 0, got ${count}`);
    }
  }

  if (snapshot.archive.total !== manifest.expected.total) {
    failures.push(
      `archive audit_logs expected ${manifest.expected.total}, got ${snapshot.archive.total}`,
    );
  }

  for (const [type, expected] of Object.entries(manifest.expected.byType)) {
    const actual = snapshot.archive.byType[type] ?? 0;
    if (actual !== expected) {
      failures.push(`archive ${type} expected ${expected}, got ${actual}`);
    }
  }

  for (const [table, expected] of Object.entries(
    manifest.expected.childTables,
  )) {
    const actual = snapshot.archive.childTables[table] ?? 0;
    if (actual !== expected) {
      failures.push(`archive ${table} expected ${expected}, got ${actual}`);
    }
  }

  for (const [table, count] of Object.entries(snapshot.archive.orphanTables)) {
    if (count !== 0) {
      failures.push(`archive ${table} has ${count} orphan rows`);
    }
  }

  if (snapshot.archive.duplicateParents !== 0) {
    failures.push(
      `archive audit_logs has ${snapshot.archive.duplicateParents} duplicate IDs`,
    );
  }

  const protocols = snapshot.archive.protocols;

  if (protocols.total !== manifest.expected.total) {
    failures.push(
      `collected protocols expected ${manifest.expected.total}, got ${protocols.total}`,
    );
  }

  if (protocols.missingCount !== 0) {
    failures.push(
      `${protocols.missingCount} protocols do not resolve to an audit_logs row (e.g. ${protocols.missingSample.join(', ')})`,
    );
  }

  if (protocols.mismatchedCount !== 0) {
    failures.push(
      `${protocols.mismatchedCount} protocols resolve to a different log_type (e.g. ${protocols.mismatchedSample.join(', ')})`,
    );
  }

  return { manifest, failures };
}

async function main() {
  const mysql = createMysqlSequelize();
  const mssql = createMssqlSequelize();
  const timeoutMs = Number(process.env.VERIFY_TIMEOUT_MS ?? 180000);
  const startedAt = Date.now();
  let lastSnapshot: Awaited<ReturnType<typeof collectSnapshot>> | undefined;
  let lastFailures: string[] = [];

  try {
    await mysql.authenticate();
    await mssql.authenticate();

    while (Date.now() - startedAt <= timeoutMs) {
      lastSnapshot = await collectSnapshot(mysql, mssql);
      const { failures } = validate(lastSnapshot);
      lastFailures = failures;

      if (failures.length === 0) {
        const report = {
          ok: true,
          checkedAt: new Date().toISOString(),
          manifest: readManifest(),
          snapshot: lastSnapshot,
        };
        fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
        console.log(`verify ok; report written to ${reportPath}`);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    const report = {
      ok: false,
      checkedAt: new Date().toISOString(),
      manifest: readManifest(),
      failures: lastFailures,
      snapshot: lastSnapshot,
    };
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    throw new Error(`verify failed:\n${lastFailures.join('\n')}`);
  } finally {
    await Promise.all([mysql.close(), mssql.close()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
