import { QueryTypes } from 'sequelize';

import { mssqlConfig } from './config';
import { createMssqlSequelize } from './db';

async function main() {
  const sequelize = createMssqlSequelize('master');

  try {
    await sequelize.authenticate();
    await sequelize.query(
      `IF DB_ID(N'${mssqlConfig.database}') IS NULL CREATE DATABASE [${mssqlConfig.database}]`,
      { type: QueryTypes.RAW },
    );
    console.log(`mssql database ${mssqlConfig.database} is ready`);
  } finally {
    await sequelize.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
