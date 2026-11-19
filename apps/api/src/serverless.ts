/**
 * Point d'entrée « sans serveur » (Vercel Functions). Même application que main.ts, sans app.listen() :
 * l'application Nest est créée une seule fois par instance puis réutilisée entre les requêtes
 * (connexion MongoDB conservée tant que l'instance reste chaude).
 * Le temps réel (Socket.IO) n'est pas disponible dans ce mode : le site se rabat sur le rechargement périodique.
 */
import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let ready: Promise<Handler> | null = null;

async function create(): Promise<Handler> {
  const app = configureApp(await NestFactory.create(AppModule, { rawBody: true, logger: ['error', 'warn'] }));
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!ready) ready = create().catch((e) => { ready = null; throw e; }); // nouvel essai à la requête suivante si le démarrage échoue
  const app = await ready;
  app(req, res);
}
