export const appBaseUrl = `http://127.0.0.1:${process.env.APP_PORT ?? 3100}`;

export const mysqlConfig = {
  host: process.env.MYSQL_HOST ?? '127.0.0.1',
  port: Number(process.env.MYSQL_PORT ?? 3307),
  database: process.env.MYSQL_DATABASE ?? 'audit_app',
  username: process.env.MYSQL_USER ?? 'audit',
  password: process.env.MYSQL_PASSWORD ?? 'audit',
};

export const mssqlConfig = {
  host: process.env.MSSQL_HOST ?? '127.0.0.1',
  port: Number(process.env.MSSQL_PORT ?? 1434),
  database: process.env.MSSQL_DATABASE ?? 'audit_archive',
  username: process.env.MSSQL_USER ?? 'sa',
  password: process.env.MSSQL_PASSWORD ?? 'Str0ngAudit!2026',
};

export const parentPerTick: Record<string, number> = {
  ENTITY: 2,
  EVENT: 2,
  INTEGRATION: 2,
  REQUEST: 2,
  LOGIN: 1,
  ERROR: 1,
};

export const childPerTick: Record<string, number> = {
  audit_logs_entity: 2,
  audit_logs_event: 2,
  audit_logs_integration: 2,
  audit_logs_request: 3,
  audit_logs_login: 1,
  audit_logs_error: 1,
  audit_logs_details: 0,
};

export const auditTables = [
  'audit_logs',
  'audit_logs_entity',
  'audit_logs_event',
  'audit_logs_integration',
  'audit_logs_request',
  'audit_logs_login',
  'audit_logs_error',
  'audit_logs_details',
];
