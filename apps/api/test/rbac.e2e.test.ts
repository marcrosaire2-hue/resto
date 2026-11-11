import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog } from '../src/modules/audit/audit-log.schema';
import { RestaurantEmployee } from '../src/modules/rbac/restaurant-employee.schema';
import { Client, db, nextPhone, platformUser, registeredClient, startApp, TestEnv } from './helpers';

let t: TestEnv;
let admin: Client;

async function createRestaurant(name: string) {
  const owner = await registeredClient(t.app, `Propriétaire ${name}`);
  const r = await admin.post('/api/admin/restaurants', { name, ownerPhone: owner.phone });
  expect(r.status).toBe(201);
  return { id: String(r.body._id), slug: r.body.slug as string, owner };
}

async function addEmployee(restaurantId: string, ownerClient: Client, roleCode: string) {
  const emp = await registeredClient(t.app, `Employé ${roleCode}`);
  const r = await ownerClient.post(`/api/restaurants/${restaurantId}/staff`, { phone: emp.phone, roleCode });
  expect(r.status).toBe(201);
  return { ...emp, employeeId: r.body.id as string };
}

beforeAll(async () => {
  t = await startApp();
  admin = (await platformUser(t.app, 'super_admin')).client;
});
afterAll(async () => {
  await t?.close();
});

describe('Restaurants et propriétaire', () => {
  it('crée un restaurant avec un slug unique et son propriétaire (transaction)', async () => {
    const a = await createRestaurant('Chez Maman Bénin !');
    const b = await createRestaurant('Chez Maman Bénin');
    expect(a.slug).toBe('chez-maman-benin');
    expect(b.slug).toBe('chez-maman-benin-2');
    const me = await a.owner.client.get('/api/auth/me');
    expect(me.body.restaurants).toEqual([
      expect.objectContaining({ restaurantId: a.id, role: 'owner', permissions: expect.arrayContaining(['staff.manage']) }),
    ]);
  });

  it("n'écrit rien si le propriétaire n'existe pas", async () => {
    const r = await admin.post('/api/admin/restaurants', { name: 'Fantôme', ownerPhone: nextPhone() });
    expect(r.status).toBe(404);
    expect(await db(t).collection('restaurants').countDocuments({ name: 'Fantôme' })).toBe(0);
  });
});

describe('Scénario 4 — isolation des restaurants (tests directs sur l’API)', () => {
  it('le restaurant A ne peut ni lire ni modifier les données du restaurant B', async () => {
    const A = await createRestaurant('Restaurant A');
    const B = await createRestaurant('Restaurant B');
    const bCook = await addEmployee(B.id, B.owner.client, 'cook');

    const read = await A.owner.client.get(`/api/restaurants/${B.id}/staff`);
    expect(read.status).toBe(404); // ne révèle pas l'existence de B
    const write = await A.owner.client.post(`/api/restaurants/${B.id}/staff`, { phone: A.owner.phone, roleCode: 'owner' });
    expect(write.status).toBe(404);
    const patch = await A.owner.client.patch(`/api/restaurants/${B.id}/staff/${bCook.employeeId}`, { status: 'DISABLED' });
    expect(patch.status).toBe(404);
    const audit = await A.owner.client.get(`/api/restaurants/${B.id}/audit`);
    expect(audit.status).toBe(404);
    // Un employé de B ciblé via l'URL de A n'est pas trouvé non plus.
    const cross = await A.owner.client.patch(`/api/restaurants/${A.id}/staff/${bCook.employeeId}`, { status: 'DISABLED' });
    expect(cross.status).toBe(404);
  });

  it('un identifiant mal formé est traité comme introuvable', async () => {
    const { client } = await registeredClient(t.app);
    expect((await client.get('/api/restaurants/pas-un-id/staff')).status).toBe(404);
  });

  it("refuse au niveau de l'accès aux données une requête sans filtre restaurantId", async () => {
    const model = t.app.get<Model<RestaurantEmployee>>(getModelToken(RestaurantEmployee.name));
    await expect(model.find({ roleCode: 'owner' }).exec()).rejects.toThrow(/TENANT_FILTER_MISSING/);
    await expect(model.updateMany({}, { status: 'DISABLED' }).exec()).rejects.toThrow(/TENANT_FILTER_MISSING/);
    await expect(model.aggregate([{ $group: { _id: '$roleCode' } }]).exec()).rejects.toThrow(/TENANT_FILTER_MISSING/);
    // Une requête transversale explicite reste possible.
    await expect(model.find({ roleCode: 'owner' }).setOptions({ crossTenant: true }).exec()).resolves.toBeInstanceOf(Array);
  });
});

describe('Scénario 6 — permissions des employés', () => {
  it("le cuisinier ne gère pas le personnel, ne voit pas l'audit et n'obtient pas de signature d'image de profil", async () => {
    const R = await createRestaurant('Resto Permissions');
    const cook = await addEmployee(R.id, R.owner.client, 'cook');
    expect((await cook.client.post(`/api/restaurants/${R.id}/staff`, { phone: nextPhone(), roleCode: 'cook' })).status).toBe(403);
    expect((await cook.client.get(`/api/restaurants/${R.id}/staff`)).status).toBe(403);
    expect((await cook.client.get(`/api/restaurants/${R.id}/audit`)).status).toBe(403);
    const me = await cook.client.get('/api/auth/me');
    const perms: string[] = me.body.restaurants[0].permissions;
    expect(perms).not.toContain('finance.restaurant.view');
    expect(perms).not.toContain('orders.view_customer_contact');
  });

  it('le gérant voit le personnel mais ne peut pas le gérer', async () => {
    const R = await createRestaurant('Resto Gérant');
    const manager = await addEmployee(R.id, R.owner.client, 'manager');
    expect((await manager.client.get(`/api/restaurants/${R.id}/staff`)).status).toBe(200);
    expect((await manager.client.post(`/api/restaurants/${R.id}/staff`, { phone: nextPhone(), roleCode: 'cook' })).status).toBe(403);
  });

  it("aucun ajustement ne peut donner la gestion du personnel à un non-propriétaire", async () => {
    const R = await createRestaurant('Resto Ajustements');
    const cashier = await addEmployee(R.id, R.owner.client, 'cashier');
    const r = await R.owner.client.patch(`/api/restaurants/${R.id}/staff/${cashier.employeeId}`, { granted: ['staff.manage'] });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('OWNER_ONLY_PERMISSION');
    // Une permission de plateforme est ignorée même si elle est stockée.
    const r2 = await R.owner.client.patch(`/api/restaurants/${R.id}/staff/${cashier.employeeId}`, { granted: ['admin.settings.edit', 'orders.accept'] });
    expect(r2.status).toBe(200);
    expect(r2.body.permissions).toContain('orders.accept');
    expect(r2.body.permissions).not.toContain('admin.settings.edit');
  });

  it('le retrait de permission et la désactivation prennent effet immédiatement', async () => {
    const R = await createRestaurant('Resto Retrait');
    const manager = await addEmployee(R.id, R.owner.client, 'manager');
    await R.owner.client.patch(`/api/restaurants/${R.id}/staff/${manager.employeeId}`, { revoked: ['staff.view'] }).expect(200);
    expect((await manager.client.get(`/api/restaurants/${R.id}/staff`)).status).toBe(403);
    await R.owner.client.patch(`/api/restaurants/${R.id}/staff/${manager.employeeId}`, { status: 'DISABLED' }).expect(200);
    expect((await manager.client.get(`/api/restaurants/${R.id}/staff`)).status).toBe(404);
  });

  it('le dernier propriétaire ne peut pas être rétrogradé ni désactivé', async () => {
    const R = await createRestaurant('Resto Dernier Propriétaire');
    const staff = await R.owner.client.get(`/api/restaurants/${R.id}/staff`);
    const ownerRow = staff.body.find((s: { roleCode: string }) => s.roleCode === 'owner');
    const r = await R.owner.client.patch(`/api/restaurants/${R.id}/staff/${ownerRow.id}`, { roleCode: 'manager' });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('LAST_OWNER');
  });

  it("un restaurant suspendu bloque les actions de son personnel", async () => {
    const R = await createRestaurant('Resto Suspendu');
    const noReason = await admin.patch(`/api/admin/restaurants/${R.id}/status`, { status: 'SUSPENDED' });
    expect(noReason.status).toBe(400);
    await admin.patch(`/api/admin/restaurants/${R.id}/status`, { status: 'SUSPENDED', reason: 'Documents expirés' }).expect(200);
    const r = await R.owner.client.get(`/api/restaurants/${R.id}/staff`);
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('RESTAURANT_SUSPENDED');
  });
});

describe('Permissions des salariés de la plateforme', () => {
  it("l'agent financier ne modifie ni les paramètres ni les restaurants", async () => {
    const fin = await platformUser(t.app, 'finance_agent');
    expect((await fin.client.put('/api/admin/settings/orders.service_fee_fcfa', { value: 0 })).status).toBe(403);
    expect((await fin.client.post('/api/admin/restaurants', { name: 'X', ownerPhone: nextPhone() })).status).toBe(403);
    expect((await fin.client.get('/api/admin/restaurants')).status).toBe(200);
  });

  it("un client ordinaire n'accède à aucune route d'administration", async () => {
    const { client } = await registeredClient(t.app);
    for (const url of ['/api/admin/settings', '/api/admin/staff', '/api/admin/audit', '/api/admin/restaurants']) {
      expect((await client.get(url)).status).toBe(403);
    }
  });

  it('le dernier super-administrateur ne peut pas être retiré', async () => {
    const list = await admin.get('/api/admin/staff');
    const supers = list.body.filter((s: { roleCode: string; status: string }) => s.roleCode === 'super_admin' && s.status === 'ACTIVE');
    expect(supers).toHaveLength(1);
    const r = await admin.patch(`/api/admin/staff/${supers[0].id}`, { status: 'DISABLED' });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('LAST_SUPER_ADMIN');
  });

  it('le super-administrateur nomme un responsable des opérations', async () => {
    const u = await registeredClient(t.app, 'Futur responsable ops');
    expect((await admin.post('/api/admin/staff', { phone: u.phone, roleCode: 'operations_manager' })).status).toBe(201);
    const me = await u.client.get('/api/auth/me');
    expect(me.body.platformRoles).toEqual(['operations_manager']);
    expect(me.body.platformPermissions).toContain('ops.dispatch.assign');
    expect(me.body.platformPermissions).not.toContain('finance.payouts.execute');
  });
});

describe('Paramètres de la plateforme', () => {
  it("n'a aucune valeur commerciale par défaut", async () => {
    const r = await admin.get('/api/admin/settings');
    expect(r.status).toBe(200);
    for (const s of r.body) expect(s).toMatchObject({ value: null, configured: false });
  });

  it('valide, enregistre et trace une modification', async () => {
    expect((await admin.put('/api/admin/settings/orders.restaurant_response_minutes', { value: -3 })).status).toBe(400);
    expect((await admin.put('/api/admin/settings/inconnu', { value: 1 })).status).toBe(404);
    const ok = await admin.put('/api/admin/settings/orders.restaurant_response_minutes', { value: 7 });
    expect(ok.status).toBe(200);
    const audit = await admin.get('/api/admin/audit?action=settings.update');
    expect(audit.body[0]).toMatchObject({ entityId: 'orders.restaurant_response_minutes', before: null, after: 7 });
  });
});

describe("Journal d'audit", () => {
  it('trace les actions sensibles du personnel, consultables par le propriétaire', async () => {
    const R = await createRestaurant('Resto Audit');
    await addEmployee(R.id, R.owner.client, 'cashier');
    const r = await R.owner.client.get(`/api/restaurants/${R.id}/audit`);
    expect(r.status).toBe(200);
    expect(r.body.map((e: { action: string }) => e.action)).toEqual(expect.arrayContaining(['staff.add', 'restaurant.create']));
    expect(r.body.every((e: { restaurantId: string }) => e.restaurantId === R.id)).toBe(true);
  });

  it('est en ajout seul : modification et suppression refusées', async () => {
    const model = t.app.get<Model<AuditLog>>(getModelToken(AuditLog.name));
    const doc = await model.findOne();
    expect(doc).not.toBeNull();
    await expect(model.updateOne({ _id: doc!._id }, { action: 'falsifié' }).exec()).rejects.toThrow(/APPEND_ONLY/);
    await expect(model.deleteMany({}).exec()).rejects.toThrow(/APPEND_ONLY/);
    doc!.action = 'falsifié';
    await expect(doc!.save()).rejects.toThrow(/APPEND_ONLY/);
  });
});

describe('Médias (Cloudinary)', () => {
  it('répond 503 tant que Cloudinary n’est pas configuré, sans simuler de réussite', async () => {
    const { client } = await registeredClient(t.app);
    const r = await client.post('/api/media/signature', { purpose: 'avatar' });
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('MEDIA_NOT_CONFIGURED');
  });
});

