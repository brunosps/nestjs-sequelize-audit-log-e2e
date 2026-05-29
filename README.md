# nestjs-sequelize-audit-log E2E

Aplicacao NestJS de teste para validar a lib `nestjs-sequelize-audit-log` com:

- Sequelize no banco principal MySQL.
- Archive em SQL Server.
- Docker Compose para subir os bancos.
- Carga com todos os tipos principais de log: `ENTITY`, `EVENT`, `INTEGRATION`, `REQUEST`, `LOGIN` e `ERROR`.
- Verificacao de totais, tabelas filhas, duplicidade, orfaos e limpeza da origem apos archive.

## Requisitos

- Node.js 22 LTS.
- Docker com Docker Compose.
- Bash.

## Como rodar

```bash
npm install
npm run test:e2e:quick
```

Para a massa completa de 10 minutos:

```bash
npm run test:e2e:full
```

O script sobe MySQL e SQL Server, compila a aplicacao, executa carga, aguarda o flush/archive e valida o resultado final.

## Massa validada

No teste completo local, a massa gerou `6010` logs arquivados:

| Tipo | Total |
| --- | ---: |
| ENTITY | 1202 |
| EVENT | 1202 |
| INTEGRATION | 1202 |
| REQUEST | 1202 |
| LOGIN | 601 |
| ERROR | 601 |

Tambem foram validados:

- MySQL origem com `0` logs apos archive.
- SQL Server archive com `0` duplicados.
- Tabelas filhas sem orfaos.
- `audit_logs_request` com `1803` registros, pois o login tambem registra request vinculado.

## Variaveis uteis

```bash
LOAD_RATE=10 LOAD_DURATION=600 ARCHIVE_SETTLE_SECONDS=20 npm run test:e2e
KEEP_STACK=1 npm run test:e2e:quick
```

Com `KEEP_STACK=1`, os containers permanecem ativos ao final do teste para inspecao manual.

## Pacote testado

Este repo usa o tarball versionado em `vendor/nestjs-sequelize-audit-log-1.3.0.tgz` para deixar a execucao reproduzivel sem depender de publicacao no npm.
