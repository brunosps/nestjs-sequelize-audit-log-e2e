import axios from 'axios';

import { appBaseUrl } from './config';
import { addExpectedTicks, resetManifest } from './manifest';

async function runOneTick(seq: number) {
  const headers = { 'x-user-id': `smoke-${seq}` };

  const tick = await axios.post(`${appBaseUrl}/load/tick`, { seq }, { headers });

  if (tick.status !== 201) {
    throw new Error(`unexpected /load/tick status ${tick.status}`);
  }
}

async function main() {
  resetManifest();
  await runOneTick(0);
  const manifest = addExpectedTicks('smoke', 1);
  console.log(
    `smoke ok; expected parent logs so far: ${manifest.expected.total}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
