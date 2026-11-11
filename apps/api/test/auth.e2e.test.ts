import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { Client, db, nextPhone, PASSWORD, registeredClient, startApp, TestEnv } from './helpers';

let t: TestEnv;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t?.close();
});

describe('Authentification', () => {
  it("inscrit un client, ouvre une session et renvoie son profil sans données sensibles", async () => {
    const c = await new Client(t.app).init();
    const r = await c.post('/api/auth/register', {
      fullName: 'Ada Houngbo', phone: '01 97 11 22 33', email: 'Ada@Example.com', password: PASSWORD, passwordConfirm: PASSWORD,
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ fullName: 'Ada Houngbo', phone: '+2290197112233', email: 'ada@example.com', platformRoles: [], restaurants: [] });
    expect(JSON.stringify(r.body)).not.toMatch(/password/i);
    const cookie = r.headers['set-cookie'] as unknown as string[];
    expect(cookie.find((x) => x.startsWith('sid='))).toMatch(/HttpOnly/);
    expect((await c.get('/api/auth/me')).status).toBe(200);
  });

  it('refuse un numéro déjà utilisé', async () => {
    const { phone } = await registeredClient(t.app);
    const c = await new Client(t.app).init();
    const r = await c.post('/api/auth/register', { fullName: 'Doublon', phone, password: PASSWORD, passwordConfirm: PASSWORD });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('PHONE_TAKEN');
  });

  it('refuse des données invalides avec des messages par champ', async () => {
    const c = await new Client(t.app).init();
    const r = await c.post('/api/auth/register', { fullName: 'X', phone: '97000000', password: 'court', passwordConfirm: 'autre' });
    expect(r.status).toBe(400);
    const paths = r.body.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['fullName', 'phone', 'password']));
  });

  it('stocke le mot de passe haché en Argon2id', async () => {
    const { phone } = await registeredClient(t.app);
    const doc = await db(t).collection('users').findOne({ phone: `+229${phone}` });
    expect(doc?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('connecte par téléphone (toute forme) et déconnecte en révoquant la session', async () => {
    const { phone } = await registeredClient(t.app);
    const c = await new Client(t.app).init();
    const login = await c.post('/api/auth/login', { identifier: `+229 ${phone}`, password: PASSWORD });
    expect(login.status).toBe(200);
    expect((await c.post('/api/auth/logout')).status).toBe(204);
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });

  it("renvoie la même erreur pour un compte inconnu et un mauvais mot de passe", async () => {
    const { phone } = await registeredClient(t.app);
    const c = await new Client(t.app).init();
    const a = await c.post('/api/auth/login', { identifier: phone, password: 'mauvais12345' });
    const b = await c.post('/api/auth/login', { identifier: nextPhone(), password: 'mauvais12345' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it('verrouille le compte après trop d’échecs, même avec le bon mot de passe ensuite', async () => {
    const { phone } = await registeredClient(t.app);
    const c = await new Client(t.app).init();
    for (let i = 0; i < 5; i++) await c.post('/api/auth/login', { identifier: phone, password: 'mauvais12345' });
    const r = await c.post('/api/auth/login', { identifier: phone, password: PASSWORD });
    expect(r.status).toBe(423);
    expect(r.body.error).toBe('ACCOUNT_LOCKED');
  });

  it('refuse toute requête modifiante sans jeton CSRF', async () => {
    const { client } = await registeredClient(t.app);
    const r = await client.agent.post('/api/auth/logout');
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('CSRF_INVALID');
    const r2 = await client.agent.post('/api/auth/logout').set('x-csrf-token', 'x'.repeat(43));
    expect(r2.status).toBe(403);
  });

  it('exige une session sur les routes protégées', async () => {
    const c = await new Client(t.app).init();
    expect((await c.get('/api/auth/me')).status).toBe(401);
    expect((await c.get('/api/admin/settings')).status).toBe(401);
  });

  it('réinitialise le mot de passe par jeton à usage unique et révoque les sessions existantes', async () => {
    const { client: old, phone } = await registeredClient(t.app);
    const c = await new Client(t.app).init();
    const r = await c.post('/api/auth/password/forgot', { identifier: phone });
    expect(r.status).toBe(202);
    // Le jeton n'est jamais renvoyé par l'API : on en crée un connu directement pour le test.
    const { sha256 } = await import('../src/common/crypto');
    const user = await db(t).collection('users').findOne({ phone: `+229${phone}` });
    const token = 'jeton-de-test-'.padEnd(40, 'x');
    await db(t).collection('password_reset_tokens').insertOne({
      tokenHash: sha256(token), userId: user!._id, expiresAt: new Date(Date.now() + 60_000), usedAt: null, createdAt: new Date(),
    });
    const newPass = 'nouveaumdp456';
    expect((await c.post('/api/auth/password/reset', { token, password: newPass, passwordConfirm: newPass })).status).toBe(204);
    expect((await c.post('/api/auth/password/reset', { token, password: newPass, passwordConfirm: newPass })).status).toBe(400);
    expect((await old.get('/api/auth/me')).status).toBe(401);
    expect((await c.post('/api/auth/login', { identifier: phone, password: newPass })).status).toBe(200);
  });

  it('répond pareil à « mot de passe oublié » pour un compte inconnu', async () => {
    const c = await new Client(t.app).init();
    const r = await c.post('/api/auth/password/forgot', { identifier: nextPhone() });
    expect(r.status).toBe(202);
  });

  it('change le mot de passe en conservant la session courante et en révoquant les autres', async () => {
    const { client, phone } = await registeredClient(t.app);
    const other = await new Client(t.app).init();
    await other.post('/api/auth/login', { identifier: phone, password: PASSWORD }).expect(200);
    const bad = await client.post('/api/users/me/password', { currentPassword: 'faux12345678', password: 'autre1234567', passwordConfirm: 'autre1234567' });
    expect(bad.status).toBe(400);
    const ok = await client.post('/api/users/me/password', { currentPassword: PASSWORD, password: 'autre1234567', passwordConfirm: 'autre1234567' });
    expect(ok.status).toBe(204);
    expect((await client.get('/api/auth/me')).status).toBe(200);
    expect((await other.get('/api/auth/me')).status).toBe(401);
  });

  it('bloque immédiatement un compte suspendu', async () => {
    const { client, userId } = await registeredClient(t.app);
    await db(t).collection('users').updateOne({ _id: new Types.ObjectId(userId) }, { $set: { status: 'SUSPENDED' } });
    expect((await client.get('/api/auth/me')).status).toBe(401);
  });

  it('expose un contrôle de santé', async () => {
    const c = await new Client(t.app).init();
    const r = await c.get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', mongo: 'up', media: 'not_configured' });
  });
});
