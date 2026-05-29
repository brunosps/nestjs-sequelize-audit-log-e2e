import axios from 'axios';

import { appBaseUrl } from './config';
import { addExpectedTicks } from './manifest';

function readNumberArg(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  if (!value) return fallback;
  return Number(value.slice(prefix.length));
}

async function runOneTick(seq: number) {
  const headers = { 'x-user-id': `load-${seq}` };

  const tick = await axios.post(`${appBaseUrl}/load/tick`, { seq }, { headers });

  if (tick.status !== 201) {
    throw new Error(`unexpected /load/tick status ${tick.status}`);
  }
}

async function main() {
  const rate = readNumberArg('rate', Number(process.env.LOAD_RATE ?? 10));
  const duration = readNumberArg(
    'duration',
    Number(process.env.LOAD_DURATION ?? 600),
  );

  if (rate <= 0 || duration <= 0) {
    throw new Error('rate and duration must be positive numbers');
  }

  const logsPerTick = 10;
  const totalTicks = Math.round((duration * rate) / logsPerTick);
  const intervalMs = Math.max(1, Math.round((logsPerTick / rate) * 1000));

  console.log(
    `load starting: rate=${rate} logs/s duration=${duration}s ticks=${totalTicks}`,
  );

  for (let tick = 1; tick <= totalTicks; tick += 1) {
    const startedAt = Date.now();
    await runOneTick(tick);
    const manifest = addExpectedTicks('load', 1);

    if (tick % Math.max(1, Math.round(30000 / intervalMs)) === 0) {
      console.log(
        `load progress: tick=${tick}/${totalTicks} expected=${manifest.expected.total}`,
      );
    }

    const elapsed = Date.now() - startedAt;
    const delay = intervalMs - elapsed;
    if (delay > 0 && tick < totalTicks) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  console.log('load completed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
