import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose, { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { resetEnvCache } from '../src/common/env';
import { PlatformStaffService } from '../src/modules/platform-staff/platform-staff.service';
import { UsersService } from '../src/modules/users/users.service';

export interface TestEnv {
  app: INestApplication;
  replSet: MongoMemoryReplSet;
  close: () => Promise<void>;
}

/** Démarre un vrai MongoDB (replica set en mémoire) et l'application complète. */
export async function startApp(extraEnv: Record<string, string> = {}): Promise<TestEnv> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: replSet.getUri('plateforme_test'),
    THROTTLE_LIMIT_PER_MIN: '10000',
    THROTTLE_AUTH_LIMIT_PER_MIN: '10000',
    CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: '',
    // Jamais de clé de paiement réelle en test : FedaPay désactivé sauf serveur de test explicite.
    FEDAPAY_ENV: 'sandbox',
    FEDAPAY_SECRET_KEY: '',
    FEDAPAY_PUBLIC_KEY: '',
    FEDAPAY_WEBHOOK_SECRET: '',
    ...extraEnv,
  });
  if (!extraEnv.FEDAPAY_API_URL) delete process.env.FEDAPAY_API_URL;
  resetEnvCache();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication({ rawBody: true }));
  await app.init();
  // Les index uniques doivent exister avant les tests de doublons.
  await Promise.all(Object.values(mongoose.connections.flatMap((c) => Object.values(c.models))).map((m) => m.syncIndexes()));
  return {
    app,
    replSet,
    close: async () => {
      await app.close();
      await replSet.stop();
    },
  };
}

export const PASSWORD = 'motdepasse123';
let phoneSeq = 0;
/** Numéro béninois unique pour chaque test. */
export const nextPhone = () => `01${String(97000000 + ++phoneSeq).padStart(8, '0')}`;

/** Client HTTP avec cookies et jeton CSRF, comme un navigateur. */
export class Client {
  readonly agent: ReturnType<typeof request.agent>;
  csrf = '';
  constructor(app: INestApplication) {
    this.agent = request.agent(app.getHttpServer());
  }
  async init() {
    const r = await this.agent.get('/api/auth/csrf').expect(200);
    this.csrf = r.body.csrfToken;
    return this;
  }
  get(url: string) {
    return this.agent.get(url);
  }
  post(url: string, body?: object) {
    return this.agent.post(url).set('x-csrf-token', this.csrf).send(body ?? {});
  }
  patch(url: string, body?: object) {
    return this.agent.patch(url).set('x-csrf-token', this.csrf).send(body ?? {});
  }
  put(url: string, body?: object) {
    return this.agent.put(url).set('x-csrf-token', this.csrf).send(body ?? {});
  }
}

/** Inscrit un utilisateur et renvoie un client connecté. */
export async function registeredClient(app: INestApplication, name = 'Test Utilisateur') {
  const phone = nextPhone();
  const c = await new Client(app).init();
  const r = await c.post('/api/auth/register', { fullName: name, phone, password: PASSWORD, passwordConfirm: PASSWORD });
  if (r.status !== 201) throw new Error(`Inscription échouée : ${r.status} ${JSON.stringify(r.body)}`);
  return { client: c, phone, userId: r.body.id as string };
}

export async function platformUser(app: INestApplication, roleCode: string) {
  const u = await registeredClient(app, `Salarié ${roleCode}`);
  const users = app.get(UsersService);
  const user = await users.findByPhone(`+229${u.phone}`);
  await app.get(PlatformStaffService).assign(user!._id, roleCode, null, { ip: null, userAgent: 'test' });
  return u;
}

/** Connexion MongoDB utilisée par l'application (pour les vérifications directes en base). */
export const db = (t: TestEnv) => t.app.get<Connection>(getConnectionToken());
