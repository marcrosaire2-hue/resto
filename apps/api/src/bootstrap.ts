import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './common/env';

/** Configuration HTTP commune à l'exécution et aux tests. */
export function configureApp(app: INestApplication) {
  const e = env();
  const http = app as NestExpressApplication;
  http.set('trust proxy', e.TRUST_PROXY);
  http.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: e.WEB_ORIGIN, credentials: true });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  return app;
}
