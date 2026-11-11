import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { env } from './common/env';

async function main() {
  const e = env();
  const app = configureApp(await NestFactory.create(AppModule, { bufferLogs: false }));
  if (e.NODE_ENV !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('API Marketplace').setVersion('0.1.0').addCookieAuth('sid').build(),
    );
    SwaggerModule.setup('api/docs', app, doc);
  }
  await app.listen(e.PORT);
  Logger.log(`API prête sur http://localhost:${e.PORT}/api (docs : /api/docs)`, 'Bootstrap');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
