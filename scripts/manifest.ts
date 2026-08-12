import fs from 'node:fs';
import path from 'node:path';

import { childPerTick, parentPerTick } from './config';

export type Manifest = {
  startedAt: string;
  updatedAt: string;
  ticks: number;
  expected: {
    total: number;
    byType: Record<string, number>;
    childTables: Record<string, number>;
  };
  runs: Array<{ label: string; ticks: number; at: string }>;
};

const artifactsDir = path.resolve(process.cwd(), 'artifacts');
export const manifestPath = path.join(artifactsDir, 'manifest.json');

function emptyManifest(): Manifest {
  return {
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ticks: 0,
    expected: {
      total: 0,
      byType: Object.fromEntries(
        Object.keys(parentPerTick).map((type) => [type, 0]),
      ),
      childTables: Object.fromEntries(
        Object.keys(childPerTick).map((table) => [table, 0]),
      ),
    },
    runs: [],
  };
}

export function resetManifest() {
  fs.mkdirSync(artifactsDir, { recursive: true });
  const manifest = emptyManifest();
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function readManifest() {
  if (!fs.existsSync(manifestPath)) {
    return resetManifest();
  }

  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
}

/**
 * Soma logs avulsos (fora do tick padrão) às contagens esperadas.
 */
export function addExpectedLogs(
  label: string,
  byType: Record<string, number>,
  childTables: Record<string, number>,
) {
  const manifest = readManifest();

  for (const [type, count] of Object.entries(byType)) {
    manifest.expected.byType[type] =
      (manifest.expected.byType[type] ?? 0) + count;
    manifest.expected.total += count;
  }

  for (const [table, count] of Object.entries(childTables)) {
    manifest.expected.childTables[table] =
      (manifest.expected.childTables[table] ?? 0) + count;
  }

  manifest.updatedAt = new Date().toISOString();
  manifest.runs.push({ label, ticks: 0, at: manifest.updatedAt });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function addExpectedTicks(label: string, ticks: number) {
  const manifest = readManifest();
  manifest.ticks += ticks;
  manifest.expected.total +=
    Object.values(parentPerTick).reduce((total, value) => total + value, 0) *
    ticks;

  for (const [type, count] of Object.entries(parentPerTick)) {
    manifest.expected.byType[type] =
      (manifest.expected.byType[type] ?? 0) + count * ticks;
  }

  for (const [table, count] of Object.entries(childPerTick)) {
    manifest.expected.childTables[table] =
      (manifest.expected.childTables[table] ?? 0) + count * ticks;
  }

  manifest.updatedAt = new Date().toISOString();
  manifest.runs.push({ label, ticks, at: manifest.updatedAt });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
