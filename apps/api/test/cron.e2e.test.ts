import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../src/common/env';
import { startApp, TestEnv } from './helpers';

const SECRET = 'secret-de-test-cron-0123456789';
let t: TestEnv;

beforeAll(async () => { t = await startApp({ CRON_SECRET: SECRET }); });
afterAll(async () => { delete process.env.CRON_SECRET; resetEnvCache(); await t?.close(); });

describe('Tâches planifiées (/api/internal/cron)', () => {
  it('refuse un appel sans jeton ou avec un mauvais jeton', async () => {
    await request(t.app.getHttpServer()).get('/api/internal/cron/orders').expect(401);
    await request(t.app.getHttpServer()).get('/api/internal/cron/ops').set('Authorization', 'Bearer mauvais').expect(401);
    await request(t.app.getHttpServer()).get('/api/internal/cron/orders').set('Authorization', `Bearer ${SECRET}x`).expect(401);
  });

  it('exécute les vérifications de délais avec le bon jeton', async () => {
    const a = await request(t.app.getHttpServer()).get('/api/internal/cron/orders').set('Authorization', `Bearer ${SECRET}`).expect(200);
    expect(a.body).toEqual({ ok: true });
    const b = await request(t.app.getHttpServer()).get('/api/internal/cron/ops').set('Authorization', `Bearer ${SECRET}`).expect(200);
    expect(b.body.ok).toBe(true);
  });

  it('est désactivé (503) tant que CRON_SECRET n’est pas configuré', async () => {
    delete process.env.CRON_SECRET;
    resetEnvCache();
    try {
      await request(t.app.getHttpServer()).get('/api/internal/cron/orders').set('Authorization', `Bearer ${SECRET}`).expect(503);
    } finally {
      process.env.CRON_SECRET = SECRET;
      resetEnvCache();
    }
  });
});
