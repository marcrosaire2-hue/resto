import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { Client, db, lastCode, nextPhone, PASSWORD, registeredClient, sentMails, startApp, TestEnv } from './helpers';

let t: TestEnv;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t?.close();
});

describe('Codes de vérification par e-mail', () => {
  it('exige un code valide avant de créer le compte ; 5 erreurs invalident le code', async () => {
    const c = await new Client(t.app).init();
    const email = 'koffi@test.local';
    const body = (code: string) => ({ fullName: 'Koffi Test', phone: nextPhone(), email, code, password: PASSWORD, passwordConfirm: PASSWORD });
    expect((await c.post('/api/auth/register', body('123456'))).body.error).toBe('CODE_EXPIRED'); // aucun code demandé
    await c.post('/api/auth/email-code', { email, purpose: 'REGISTER' }).expect(202);
    const mail = sentMails.at(-1)!;
    expect(mail.to).toBe(email);
    expect(mail.subject).toMatch(/^\d{6} est votre code/);
    const code = lastCode(email)!;
    const wrong = code === '000000' ? '111111' : '000000';
    const r1 = await c.post('/api/auth/register', body(wrong));
    expect(r1.status).toBe(400);
    expect(r1.body.message).toMatch(/Il reste 4 essais/);
    for (let i = 0; i < 3; i++) await c.post('/api/auth/register', body(wrong));
    expect((await c.post('/api/auth/register', body(wrong))).body.error).toBe('CODE_LOCKED');
    expect((await c.post('/api/auth/register', body(code))).body.error).toBe('CODE_EXPIRED'); // même le bon code ne passe plus
    const stored = await db(t).collection('email_codes').findOne({ email });
    expect(JSON.stringify(stored)).not.toContain(code); // jamais stocké en clair
  });

  it('impose un délai entre deux envois et refuse une adresse déjà inscrite', async () => {
    const c = await new Client(t.app).init();
    await c.post('/api/auth/email-code', { email: 'pressé@test.local'.replace('é', 'e'), purpose: 'REGISTER' }).expect(202);
    const again = await c.post('/api/auth/email-code', { email: 'presse@test.local', purpose: 'REGISTER' });
    expect(again.status).toBe(429);
    expect(again.body.error).toBe('CODE_TOO_SOON');
    const { email } = await registeredClient(t.app);
    expect((await c.post('/api/auth/email-code', { email, purpose: 'REGISTER' })).body.error).toBe('EMAIL_TAKEN');
  });

  it('un code expiré est refusé', async () => {
    const c = await new Client(t.app).init();
    const email = 'expire@test.local';
    await c.post('/api/auth/email-code', { email, purpose: 'REGISTER' }).expect(202);
    await db(t).collection('email_codes').updateMany({ email }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await c.post('/api/auth/register', { fullName: 'Expiré', phone: nextPhone(), email, code: lastCode(email), password: PASSWORD, passwordConfirm: PASSWORD });
    expect(r.body.error).toBe('CODE_EXPIRED');
  });

  it('mot de passe oublié : code par e-mail, nouveau mot de passe, sessions fermées, code à usage unique', async () => {
    const { client: old, phone, email } = await registeredClient(t.app);
    const c = await new Client(t.app).init();
    await c.post('/api/auth/email-code', { email, purpose: 'RESET' }).expect(202);
    const code = lastCode(email)!;
    const newPass = 'nouveaumdp456';
    expect((await c.post('/api/auth/password/reset-code', { email, code, password: newPass, passwordConfirm: newPass })).status).toBe(204);
    expect((await c.post('/api/auth/password/reset-code', { email, code, password: newPass, passwordConfirm: newPass })).status).toBe(400);
    expect((await old.get('/api/auth/me')).status).toBe(401);
    expect((await c.post('/api/auth/login', { identifier: email, password: newPass })).status).toBe(200);
    expect((await c.post('/api/auth/login', { identifier: phone, password: newPass })).status).toBe(200);
  });

  it('changement de mot de passe connecté par code reçu par e-mail ; l’adresse ne peut pas être modifiée sans vérification', async () => {
    const { client, email } = await registeredClient(t.app);
    const r = await client.post('/api/users/me/password/code');
    expect(r.status).toBe(202);
    expect(r.body.sentTo).toMatch(/^u•••@test\.local$/);
    const code = lastCode(email)!;
    expect((await client.post('/api/users/me/password', { code, password: 'changé12345a', passwordConfirm: 'changé12345a' })).status).toBe(204);
    expect((await client.patch('/api/users/me', { email: 'pirate@test.local' })).body.error).toBe('EMAIL_LOCKED');
  });

  it('sans Brevo configuré, l’envoi est refusé clairement (aucun faux envoi)', async () => {
    const t2 = await startApp({ BREVO_API_KEY: '' });
    try {
      const c = await new Client(t2.app).init();
      const r = await c.post('/api/auth/email-code', { email: 'sansmail@test.local', purpose: 'REGISTER' });
      expect(r.status).toBe(503);
      expect(r.body.error).toBe('MAIL_UNAVAILABLE');
    } finally {
      await t2.close();
      process.env.BREVO_API_KEY = 'test-brevo-key';
      (await import('../src/common/env')).resetEnvCache();
    }
  });
});

describe('Authentification', () => {
  it("inscrit un client, ouvre une session et renvoie son profil sans données sensibles", async () => {
    const c = await new Client(t.app).init();
    await c.post('/api/auth/email-code', { email: 'Ada@Example.com', purpose: 'REGISTER' }).expect(202);
    const r = await c.post('/api/auth/register', {
      fullName: 'Ada Houngbo', phone: '01 97 11 22 33', email: 'Ada@Example.com', code: lastCode('ada@example.com'), password: PASSWORD, passwordConfirm: PASSWORD,
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
    await c.post('/api/auth/email-code', { email: 'doublon@test.local', purpose: 'REGISTER' }).expect(202);
    const code = lastCode('doublon@test.local');
    const r = await c.post('/api/auth/register', { fullName: 'Doublon', phone, email: 'doublon@test.local', code, password: PASSWORD, passwordConfirm: PASSWORD });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('PHONE_TAKEN');
    // Le code n'a pas été consommé par l'échec : il reste utilisable avec un autre numéro.
    const ok = await c.post('/api/auth/register', { fullName: 'Doublon', phone: nextPhone(), email: 'doublon@test.local', code, password: PASSWORD, passwordConfirm: PASSWORD });
    expect(ok.status).toBe(201);
  });

  it('refuse des données invalides avec des messages par champ', async () => {
    const c = await new Client(t.app).init();
    const r = await c.post('/api/auth/register', { fullName: 'X', phone: '97000000', password: 'court', passwordConfirm: 'autre' });
    expect(r.status).toBe(400);
    const paths = r.body.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['fullName', 'phone', 'email', 'code', 'password']));
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

  it('réinitialise le mot de passe par jeton à usage unique (lien d’activation) et révoque les sessions existantes', async () => {
    const { client: old, phone } = await registeredClient(t.app);
    const c = await new Client(t.app).init();
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

  it('répond pareil à « mot de passe oublié » pour une adresse inconnue, sans envoyer d’e-mail', async () => {
    const c = await new Client(t.app).init();
    const before = sentMails.length;
    const r = await c.post('/api/auth/email-code', { email: 'inconnu@test.local', purpose: 'RESET' });
    expect(r.status).toBe(202);
    expect(sentMails.length).toBe(before);
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
