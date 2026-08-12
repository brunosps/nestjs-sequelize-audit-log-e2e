import axios from 'axios';
import { QueryTypes } from 'sequelize';

import { appBaseUrl } from './config';
import { createMysqlSequelize } from './db';
import { addExpectedLogs, addExpectedTicks, resetManifest } from './manifest';
import { appendProtocols, isProtocol, resetProtocols } from './protocols';

async function runOneTick(seq: number) {
  const headers = { 'x-user-id': `smoke-${seq}` };

  const tick = await axios.post(`${appBaseUrl}/load/tick`, { seq }, { headers });

  if (tick.status !== 201) {
    throw new Error(`unexpected /load/tick status ${tick.status}`);
  }

  appendProtocols(tick.data.protocols);
}

/**
 * EVENT grava de forma síncrona, então o protocolo devolvido pela rota tem de
 * existir no MySQL de origem imediatamente — sem esperar o flush do buffer.
 */
async function assertEventProtocolIsPersistedSynchronously() {
  const response = await axios.post(`${appBaseUrl}/events`, {
    type: 'SMOKE_SYNC',
    description: 'protocol must be readable right away',
    details: { smoke: true },
  });

  const protocol = response.data?.protocol;
  if (!isProtocol(protocol)) {
    throw new Error(`/events returned an invalid protocol: ${protocol}`);
  }

  const mysql = createMysqlSequelize();
  try {
    const [parent, child] = await Promise.all([
      mysql.query<{ count: number | string }>(
        'SELECT COUNT(*) AS count FROM audit_logs WHERE id = :protocol AND log_type = :logType',
        {
          type: QueryTypes.SELECT,
          replacements: { protocol, logType: 'EVENT' },
        },
      ),
      mysql.query<{ count: number | string }>(
        'SELECT COUNT(*) AS count FROM audit_logs_event WHERE log_id = :protocol',
        { type: QueryTypes.SELECT, replacements: { protocol } },
      ),
    ]);

    if (Number(parent[0]?.count ?? 0) !== 1) {
      throw new Error(
        `protocol ${protocol} not found in audit_logs right after /events returned`,
      );
    }

    if (Number(child[0]?.count ?? 0) !== 1) {
      throw new Error(
        `protocol ${protocol} has no audit_logs_event row right after /events returned`,
      );
    }
  } finally {
    await mysql.close();
  }

  appendProtocols({ EVENT: [protocol] });
  console.log(`smoke sync protocol ok: ${protocol}`);
  return protocol;
}

async function main() {
  resetManifest();
  resetProtocols();
  await runOneTick(0);
  addExpectedTicks('smoke', 1);

  await assertEventProtocolIsPersistedSynchronously();
  const manifest = addExpectedLogs(
    'smoke-sync-event',
    { EVENT: 1 },
    { audit_logs_event: 1 },
  );

  console.log(
    `smoke ok; expected parent logs so far: ${manifest.expected.total}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
