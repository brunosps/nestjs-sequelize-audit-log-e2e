import { Sequelize } from 'sequelize';

import { mssqlConfig, mysqlConfig } from './config';

export function createMysqlSequelize() {
  return new Sequelize({
    dialect: 'mysql',
    host: mysqlConfig.host,
    port: mysqlConfig.port,
    database: mysqlConfig.database,
    username: mysqlConfig.username,
    password: mysqlConfig.password,
    logging: false,
  });
}

export function createMssqlSequelize(database = mssqlConfig.database) {
  return new Sequelize({
    dialect: 'mssql',
    host: mssqlConfig.host,
    port: mssqlConfig.port,
    database,
    username: mssqlConfig.username,
    password: mssqlConfig.password,
    logging: false,
    dialectOptions: {
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    },
  });
}

export async function waitFor(
  name: string,
  factory: () => Sequelize,
  attempts = 90,
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const sequelize = factory();
    try {
      await sequelize.authenticate();
      await sequelize.close();
      console.log(`${name} is ready`);
      return;
    } catch (error) {
      lastError = error;
      await sequelize.close().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${name} did not become ready`);
}
