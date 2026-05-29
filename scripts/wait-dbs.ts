import { createMssqlSequelize, createMysqlSequelize, waitFor } from './db';

async function main() {
  await Promise.all([
    waitFor('mysql', createMysqlSequelize),
    waitFor('mssql-master', () => createMssqlSequelize('master')),
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
