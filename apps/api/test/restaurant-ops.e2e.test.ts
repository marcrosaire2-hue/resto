import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { OrdersService } from '../src/modules/orders/orders.service';
import { marketplace, Market } from './fixtures';
import { Client, db, platformUser, registeredClient, startApp, TestEnv } from './helpers';

let t: TestEnv;
let m: Market;
const now = Date.now();
const promo = (over: object = {}) => ({ name: 'Semaine du poulet', type: 'PERCENT', value: 20, productIds: [], startsAt: new Date(now - 3600_000).toISOString(), endsAt: new Date(now + 7 * 86_400_000).toISOString(), ...over });

beforeAll(async () => {
  t = await startApp();
  m = await marketplace(t);
});
afterAll(async () => {
  await t?.close();
});

describe('Scénario 6 — permissions des employés et des salariés', () => {
  it('le cuisinier : cuisine oui ; finances, promotions et personnel non', async () => {
    const R = await m.restaurant('Perm Cuisinier');
    const cook = await m.employee(R, 'cook');
    const kitchen = await cook.client.get(`/api/restaurants/${R.rid}/kitchen`);
    expect(kitchen.status).toBe(200);
    const dash = await cook.client.get(`/api/restaurants/${R.rid}/dashboard`);
    expect(dash.status).toBe(200);
    expect(dash.body.canSeeMoney).toBe(false);
    expect(dash.body.today.grossSales).toBeNull();
    expect((await cook.client.post(`/api/restaurants/${R.rid}/promotions`, promo())).status).toBe(403);
    expect((await cook.client.get(`/api/restaurants/${R.rid}/promotions`)).status).toBe(403);
    expect((await cook.client.post(`/api/restaurants/${R.rid}/staff/invite`, { fullName: 'X Y', phone: '0161999001', roleCode: 'cook' })).status).toBe(403);
    expect((await cook.client.put(`/api/restaurants/${R.rid}/profile/draft`, {})).status).toBe(403);
  });

  it('le caissier : voit les montants ; ne gère ni menu, ni personnel, ni l’administration', async () => {
    const R = await m.restaurant('Perm Caissier');
    const cashier = await m.employee(R, 'cashier');
    const dash = await cashier.client.get(`/api/restaurants/${R.rid}/dashboard`);
    expect(dash.body.canSeeMoney).toBe(true);
    expect((await cashier.client.post(`/api/restaurants/${R.rid}/menu/categories`, { name: 'X' })).status).toBe(403);
    expect((await cashier.client.post(`/api/restaurants/${R.rid}/staff`, { phone: '0161999002', roleCode: 'cook' })).status).toBe(403);
    expect((await cashier.client.get('/api/admin/restaurants')).status).toBe(403);
    expect((await cashier.client.get(`/api/restaurants/${R.rid}/kitchen`)).status).toBe(403);
  });

  it("l'agent financier de la plateforme ne modifie pas les menus des restaurants", async () => {
    const R = await m.restaurant('Perm Finance');
    const fin = await platformUser(t.app, 'finance_agent');
    expect((await fin.client.post(`/api/restaurants/${R.rid}/menu/categories`, { name: 'X' })).status).toBe(404);
    expect((await fin.client.put(`/api/restaurants/${R.rid}/menu/products/${R.productId}`, {})).status).toBe(404);
  });

  it('un restaurant ne voit ni la cuisine, ni le tableau de bord, ni les promotions d’un autre', async () => {
    const A = await m.restaurant('Iso Ops A');
    const B = await m.restaurant('Iso Ops B');
    for (const path of ['kitchen', 'dashboard', 'promotions']) {
      expect((await B.owner.client.get(`/api/restaurants/${A.rid}/${path}`)).status).toBe(404);
    }
    // Une promotion de B ne peut pas viser un plat de A
    const r = await B.owner.client.post(`/api/restaurants/${B.rid}/promotions`, promo({ productIds: [A.productId] }));
    expect(r.status).toBe(422);
  });
});

describe('Promotions calculées côté serveur', () => {
  it('s’appliquent au catalogue, au devis, à la commande et au net du restaurant', async () => {
    const R = await m.restaurant('Resto Promo');
    expect((await R.owner.client.post(`/api/restaurants/${R.rid}/promotions`, promo({ productIds: [R.productId] }))).status).toBe(201);
    const pub = await new Client(t.app).init();
    const p = await pub.get(`/api/catalog/products/${R.productId}`);
    expect(p.body.product.promotion).toMatchObject({ name: 'Semaine du poulet', discountedBasePrice: 2400 });
    const c = await m.customer();
    const { orderId, quote } = await m.order(c, R.productId, 2);
    expect(quote).toMatchObject({ itemsSubtotal: 6000, restaurantDiscount: 1200, total: 6000 - 1200 + 1000 + 200 });
    expect(quote.lines[0]).toMatchObject({ unitDiscount: 600, promotionName: 'Semaine du poulet' });
    const o = await db(t).collection('orders').findOne({ _id: new Types.ObjectId(orderId) });
    expect(o?.amounts.restaurantDiscount).toBe(1200);
    expect(o?.finance.commissionAmount).toBe(720); // 15 % (taux de test) de 4800
    expect(o?.finance.restaurantNet).toBe(4080);
  });

  it('une promotion expirée, inactive ou sous le minimum ne s’applique pas', async () => {
    const R = await m.restaurant('Resto Promo Règles');
    await R.owner.client.post(`/api/restaurants/${R.rid}/promotions`, promo({ startsAt: new Date(now - 10 * 86_400_000).toISOString(), endsAt: new Date(now - 86_400_000).toISOString() })).expect(201);
    await R.owner.client.post(`/api/restaurants/${R.rid}/promotions`, promo({ active: false })).expect(201);
    await R.owner.client.post(`/api/restaurants/${R.rid}/promotions`, promo({ minItemsSubtotal: 50_000 })).expect(201);
    const c = await m.customer();
    const { quote } = await m.order(c, R.productId);
    expect(quote.restaurantDiscount).toBe(0);
    expect((await R.owner.client.post(`/api/restaurants/${R.rid}/promotions`, promo({ type: 'PERCENT', value: 95 }))).status).toBe(400);
  });
});

describe('Écran cuisine, retards et signalements', () => {
  it('la cuisine ne voit aucune donnée du client ; un retard est annoncé au client', async () => {
    const R = await m.restaurant('Resto Cuisine');
    const cook = await m.employee(R, 'cook');
    const c = await m.customer();
    const { orderId } = await m.order(c, R.productId);
    const k = await cook.client.get(`/api/restaurants/${R.rid}/kitchen`);
    expect(k.body).toHaveLength(1);
    expect(JSON.stringify(k.body)).not.toMatch(/\+229|Près du marché|customerSnapshot|addressSnapshot|"phone"/);
    expect((await cook.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/delay`, { minutes: 10 })).status).toBe(422); // pas encore acceptée
    await R.owner.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/accept`).expect(201);
    expect((await cook.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/delay`, { minutes: 10, reason: 'Four en panne' })).status).toBe(201);
    const view = await c.client.get(`/api/orders/${orderId}`);
    expect(view.body.delayMinutes).toBe(10);
    const n = await c.client.get('/api/notifications');
    expect(n.body.items[0].title).toMatch(/retard/);
  });

  it('un problème signalé est transmis aux opérations', async () => {
    const ops = await platformUser(t.app, 'operations_manager');
    const R = await m.restaurant('Resto Problème');
    const c = await m.customer();
    const { orderId } = await m.order(c, R.productId);
    expect((await R.owner.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/issues`, { type: 'MISSING_ITEM', description: 'Plus de poulet' })).status).toBe(201);
    const n = await ops.client.get('/api/notifications');
    expect(n.body.items.some((x: { title: string }) => x.title.startsWith('Produit manquant'))).toBe(true);
    const cook = await m.employee(R, 'cook');
    expect((await cook.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/issues`, { type: 'OTHER', description: 'Test' })).status).toBe(403);
  });
});

describe('Tableau de bord du restaurant (données réelles)', () => {
  it('compte les commandes du jour et calcule ventes, net et plats populaires', async () => {
    const R = await m.restaurant('Resto Dashboard');
    const c = await m.customer();
    const { orderId } = await m.order(c, R.productId, 3);
    const svc = t.app.get(OrdersService);
    for (const s of ['ACCEPTED', 'PREPARING', 'READY'] as const) {
      await svc.transition(await svc.findAny(new Types.ObjectId(orderId)), s, { kind: 'restaurant', userId: R.owner.userId });
    }
    await svc.transition(await svc.findAny(new Types.ObjectId(orderId)), 'COURIER_ASSIGNED', { kind: 'ops', userId: null }, null, { courierId: new Types.ObjectId() });
    for (const s of ['PICKED_UP', 'IN_DELIVERY', 'DELIVERED'] as const) {
      await svc.transition(await svc.findAny(new Types.ObjectId(orderId)), s, { kind: 'courier', userId: null });
    }
    const other = await m.order(await m.customer(), R.productId, 1); // reste en attente
    void other;
    const d = await R.owner.client.get(`/api/restaurants/${R.rid}/dashboard?days=7`);
    expect(d.body.today).toMatchObject({ orders: 2, pending: 1, delivered: 1, grossSales: 9000, netEstimate: 7650 });
    expect(d.body.periodTotals).toMatchObject({ orders: 2, delivered: 1, grossSales: 9000, averageBasket: 9000 });
    expect(d.body.series).toHaveLength(7);
    expect(d.body.series[6].orders).toBe(2);
    expect(d.body.topProducts[0]).toEqual({ name: 'Poulet braisé', qty: 4 });
  });
});

describe('Comptes salariés', () => {
  it('le propriétaire crée le compte d’un salarié qui l’active avec son lien', async () => {
    const R = await m.restaurant('Resto Invitation');
    const r = await R.owner.client.post(`/api/restaurants/${R.rid}/staff/invite`, { fullName: 'Awa Cuisinière', phone: '0161555001', roleCode: 'cook' });
    expect(r.status).toBe(201);
    const token = new URL(r.body.activationLink).searchParams.get('token')!;
    const pub = await new Client(t.app).init();
    await pub.post('/api/auth/password/reset', { token, password: 'motdepasse987', passwordConfirm: 'motdepasse987' }).expect(204);
    const login = await pub.post('/api/auth/login', { identifier: '0161555001', password: 'motdepasse987' });
    expect(login.status).toBe(200);
    expect(login.body.restaurants[0]).toMatchObject({ restaurantId: R.rid, role: 'cook' });
    // Le lien est à usage unique
    expect((await pub.post('/api/auth/password/reset', { token, password: 'autre12345678', passwordConfirm: 'autre12345678' })).status).toBe(400);
    // Inviter un numéro déjà inscrit est refusé
    const existing = await registeredClient(t.app, 'Déjà inscrit');
    const dup = await R.owner.client.post(`/api/restaurants/${R.rid}/staff/invite`, { fullName: 'Xavier Test', phone: existing.phone, roleCode: 'cook' });
    expect(dup.status).toBe(409);
  });

  it("réinitialise l'accès d'un compte créé par le restaurant, jamais celui d'un client indépendant", async () => {
    const R = await m.restaurant('Resto Reset');
    const inv = await R.owner.client.post(`/api/restaurants/${R.rid}/staff/invite`, { fullName: 'Koffi Caissier', phone: '0161555002', roleCode: 'cashier' });
    const reset = await R.owner.client.post(`/api/restaurants/${R.rid}/staff/${inv.body.id}/reset-access`);
    expect(reset.status).toBe(201);
    expect(reset.body.activationLink).toMatch(/bienvenue=1/);
    // L'ancien lien n'est plus valable
    const oldToken = new URL(inv.body.activationLink).searchParams.get('token')!;
    const pub = await new Client(t.app).init();
    expect((await pub.post('/api/auth/password/reset', { token: oldToken, password: 'motdepasse987', passwordConfirm: 'motdepasse987' })).status).toBe(400);

    const independent = await registeredClient(t.app, 'Client indépendant');
    const add = await R.owner.client.post(`/api/restaurants/${R.rid}/staff`, { phone: independent.phone, roleCode: 'cook' });
    const refused = await R.owner.client.post(`/api/restaurants/${R.rid}/staff/${add.body.id}/reset-access`);
    expect(refused.status).toBe(422);
    expect(refused.body.error).toBe('NOT_MANAGED_ACCOUNT');
  });
});
