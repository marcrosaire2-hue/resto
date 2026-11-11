import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { v2 as cloudinary } from 'cloudinary';
import { deliveryUrl, publicIdInFolder } from '../src/modules/media/cloudinary';
import { Client, platformUser, registeredClient, startApp, TestEnv } from './helpers';

// Identifiants factices : on vérifie la signature localement, sans appeler Cloudinary.
const SECRET = 'secret-de-test-non-reel';
let t: TestEnv;
let admin: Client;

beforeAll(async () => {
  t = await startApp({ CLOUDINARY_CLOUD_NAME: 'demo-test', CLOUDINARY_API_KEY: '123456', CLOUDINARY_API_SECRET: SECRET });
  admin = (await platformUser(t.app, 'super_admin')).client;
});
afterAll(async () => {
  await t?.close();
});

describe('Signature de téléversement Cloudinary', () => {
  it("signe un avatar dans le dossier de l'utilisateur, sans exposer le secret", async () => {
    const { client, userId } = await registeredClient(t.app);
    const r = await client.post('/api/media/signature', { purpose: 'avatar' });
    expect(r.status).toBe(201);
    expect(r.body.params.folder).toBe(`plateforme/test/users/${userId}/avatars`);
    expect(r.body.signature).toBe(cloudinary.utils.api_sign_request(r.body.params, SECRET));
    expect(JSON.stringify(r.body)).not.toContain(SECRET);
  });

  it("n'autorise le logo d'un restaurant qu'avec la permission sur CE restaurant", async () => {
    const owner = await registeredClient(t.app, 'Propriétaire média');
    const created = await admin.post('/api/admin/restaurants', { name: 'Resto Média', ownerPhone: owner.phone });
    const rid = String(created.body._id);
    const ok = await owner.client.post('/api/media/signature', { purpose: 'restaurant_logo', restaurantId: rid });
    expect(ok.status).toBe(201);
    expect(ok.body.params.folder).toBe(`plateforme/test/restaurants/${rid}/logo`);

    const stranger = await registeredClient(t.app);
    expect((await stranger.client.post('/api/media/signature', { purpose: 'restaurant_logo', restaurantId: rid })).status).toBe(404);
    expect((await owner.client.post('/api/media/signature', { purpose: 'restaurant_logo' })).status).toBe(404);
  });
});

describe('Utilitaires Cloudinary', () => {
  it('construit une URL optimisée et borne la largeur', () => {
    expect(deliveryUrl('c', 'a/b', 99999)).toBe('https://res.cloudinary.com/c/image/upload/f_auto,q_auto,c_limit,w_2000/a/b');
  });
  it("refuse un public_id hors du dossier signé", () => {
    expect(publicIdInFolder('plateforme/test/restaurants/1/logo/x', 'plateforme/test/restaurants/1/logo')).toBe(true);
    expect(publicIdInFolder('plateforme/test/restaurants/2/logo/x', 'plateforme/test/restaurants/1/logo')).toBe(false);
    expect(publicIdInFolder('plateforme/test/restaurants/1/logo/../../2/x', 'plateforme/test/restaurants/1/logo')).toBe(false);
  });
});
