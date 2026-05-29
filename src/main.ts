import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { createAppModule } from './app.module';

async function bootstrap() {
  const AppModule = await createAppModule();
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  const port = Number(process.env.APP_PORT ?? 3100);
  await app.listen(port, '0.0.0.0');
  console.log(`E2E audit app listening on ${port}`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
