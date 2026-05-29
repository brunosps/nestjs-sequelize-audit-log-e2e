import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuditLogArchiveModule } from 'nestjs-sequelize-audit-log/dist/audit-log-archive/audit-log-archive.module';
import { AuditLogCoreModule } from 'nestjs-sequelize-audit-log/dist/audit-log-core/audit-log-core.module';
import { AuditLogModelModule } from 'nestjs-sequelize-audit-log/dist/audit-log-model/audit-log-model.module';

import { AppController } from './app.controller';
import { ItemModel } from './item.model';

const mysqlConfig = {
  host: process.env.MYSQL_HOST ?? '127.0.0.1',
  port: Number(process.env.MYSQL_PORT ?? 3307),
  database: process.env.MYSQL_DATABASE ?? 'audit_app',
  username: process.env.MYSQL_USER ?? 'audit',
  password: process.env.MYSQL_PASSWORD ?? 'audit',
};

const mssqlConfig = {
  host: process.env.MSSQL_HOST ?? '127.0.0.1',
  port: Number(process.env.MSSQL_PORT ?? 1434),
  database: process.env.MSSQL_DATABASE ?? 'audit_archive',
  username: process.env.MSSQL_USER ?? 'sa',
  password: process.env.MSSQL_PASSWORD ?? 'Str0ngAudit!2026',
};

export async function createAppModule() {
  const auditLogCoreModule = AuditLogCoreModule.register({
    modelModule: AuditLogModelModule,
    logRetentionDays: 0,
    enableBuffer: true,
    bufferConfig: {
      bufferSize: 10,
      flushIntervalMs: 1000,
      maxBufferSize: 10000,
      maxFlushRetries: 5,
    },
    auditSequelize:
      process.env.ENABLE_AUDIT_POOL === '0'
        ? undefined
        : {
            dialect: 'mysql',
            host: mysqlConfig.host,
            port: mysqlConfig.port,
            database: mysqlConfig.database,
            username: mysqlConfig.username,
            password: mysqlConfig.password,
            pool: { max: 10, min: 1, idle: 10000, acquire: 30000 },
          },
  });

  const auditLogArchiveModule = AuditLogArchiveModule.register({
    archiveCutoffDays: 0,
    archiveRetentionDays: 3650,
    batchSize: 100,
    archiveCronSchedule: '*/10 * * * * *',
    archiveDatabase: {
      dialect: 'mssql',
      host: mssqlConfig.host,
      port: mssqlConfig.port,
      database: mssqlConfig.database,
      username: mssqlConfig.username,
      password: mssqlConfig.password,
      dialectOptions: {
        options: {
          encrypt: false,
          trustServerCertificate: true,
        },
      },
    },
  });

  const imports = [
    ScheduleModule.forRoot(),
    SequelizeModule.forRoot({
      dialect: 'mysql',
      host: mysqlConfig.host,
      port: mysqlConfig.port,
      database: mysqlConfig.database,
      username: mysqlConfig.username,
      password: mysqlConfig.password,
      models: [ItemModel],
      autoLoadModels: true,
      synchronize: true,
      logging: false,
      pool: { max: 10, min: 1, idle: 10000, acquire: 30000 },
    }),
    SequelizeModule.forFeature([ItemModel]),
    auditLogCoreModule,
  ];

  if (process.env.ENABLE_ARCHIVE !== '0') {
    imports.push(auditLogArchiveModule);
  }

  @Module({
    imports,
    controllers: [AppController],
  })
  class RuntimeAppModule {}

  return RuntimeAppModule;
}
