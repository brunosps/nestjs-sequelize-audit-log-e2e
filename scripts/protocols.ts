import fs from 'node:fs';
import path from 'node:path';

const artifactsDir = path.resolve(process.cwd(), 'artifacts');
export const protocolsPath = path.join(artifactsDir, 'protocols.jsonl');

export type ProtocolRecord = { logType: string; protocol: string };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProtocol(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

export function resetProtocols() {
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(protocolsPath, '');
}

/**
 * Grava em append para não reescrever o arquivo inteiro a cada tick da carga.
 */
export function appendProtocols(protocols: Record<string, string[]>) {
  fs.mkdirSync(artifactsDir, { recursive: true });

  const lines = Object.entries(protocols).flatMap(([logType, ids]) =>
    ids.map((protocol) => {
      if (!isProtocol(protocol)) {
        throw new Error(
          `invalid ${logType} protocol returned by the lib: ${String(protocol)}`,
        );
      }
      return JSON.stringify({ logType, protocol } satisfies ProtocolRecord);
    }),
  );

  if (lines.length === 0) return;
  fs.appendFileSync(protocolsPath, `${lines.join('\n')}\n`);
}

export function readProtocols(): ProtocolRecord[] {
  if (!fs.existsSync(protocolsPath)) return [];

  return fs
    .readFileSync(protocolsPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ProtocolRecord);
}
