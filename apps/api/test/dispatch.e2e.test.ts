import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { OpsService } from '../src/modules/dispatch/ops.service';
import { marketplace, Market, TEST } from './fixtures';
import { db, platformUser, registeredClient, startApp, TestEnv } from './helpers';

let t: TestEnv;
let m: Market;
let ops: Awaited<ReturnType<typeof platformUser>>;

async function courier(name: string, opts: { approve?: boolean; online?: boolean } = {}) {
  const u = await registeredClient(t.app, name);
  const folder = `plateforme/test/users/${u.userId}/courier`;
  const r = await u.client.post('/api/courier/application', {
    vehicleType: 'MOTO', plate: 'AB 1234', payout: { provider: 'MTN_MOMO', number: u.phone },
    documents: [{ type: 'ID_CARD', publicId: `${folder}/cni` }, { type: 'DRIVING_LICENSE', publicId: `${folder}/permis` }],
  });
  expect(r.status).toBe(201);
  if (opts.approve !== false) await m.admin.post(`/api/admin/couriers/${r.body.id}/review`, { decision: 'approve' }).expect(201);
  if (opts.approve !== false && opts.online !== false) await u.client.post('/api/courier/online', { online: true }).expect(201);
  return { ...u, courierId: r.body.id as string };
}

/** Commande prête (restaurant : accepter → préparer → prête → demander un livreur). */
async function readyOrder(name: string) {
  const R = await m.restaurant(name);
  const c = await m.customer();
  const { orderId } = await m.order(c, R.productId, 2);
  for (const s of ['accept', 'prepare', 'ready', 'request-courier']) await R.owner.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/${s}`).expect(201);
  return { R, c, orderId };
}

beforeAll(async () => {
  t = await startApp();
  m = await marketplace(t);
  ops = await platformUser(t.app, 'operations_manager');
});
afterAll(async () => {
  await t?.close();
});

describe('Inscription et validation des livreurs', () => {
  it('le dossier reste en attente ; le livreur ne peut pas passer en ligne avant validation', async () => {
    const c = await courier('Livreur en attente', { approve: false });
    const me = await c.client.get('/api/courier/me');
    expect(me.body).toMatchObject({ status: 'PENDING_REVIEW', isOnline: false });
    expect(me.body.payout.number).toMatch(/•/); // masqué
    expect((await c.client.post('/api/courier/online', { online: true })).status).toBe(403);
    expect((await m.admin.post(`/api/admin/couriers/${c.courierId}/review`, { decision: 'reject' })).status).toBe(400); // motif obligatoire
  });

  it('refuse un document téléversé hors du dossier du livreur', async () => {
    const u = await registeredClient(t.app, 'Fraudeur');
    const r = await u.client.post('/api/courier/application', { vehicleType: 'BIKE', payout: { provider: 'MOOV_MONEY', number: u.phone }, documents: [{ type: 'ID_CARD', publicId: 'plateforme/test/users/autre/courier/cni' }] });
    expect(r.status).toBe(422);
  });

  it("seuls les salariés habilités valident les livreurs ; l'agent support non", async () => {
    const c = await courier('Livreur à valider', { approve: false });
    const support = await platformUser(t.app, 'support_agent');
    expect((await support.client.post(`/api/admin/couriers/${c.courierId}/review`, { decision: 'approve' })).status).toBe(403);
    expect((await ops.client.post(`/api/admin/couriers/${c.courierId}/review`, { decision: 'approve' })).status).toBe(201);
  });
});

describe('Configuration obligatoire du dispatch', () => {
  it('refuse toute affectation tant que le plafond d’espèces n’est pas configuré', async () => {
    const { orderId } = await readyOrder('Resto Config Dispatch');
    const c = await courier('Livreur config');
    const r = await ops.client.post(`/api/ops/orders/${orderId}/assign`, { courierId: c.courierId });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('PLATFORM_NOT_CONFIGURED');
    await m.admin.put('/api/admin/settings/couriers.cash_limit_fcfa', { value: 50_000 }).expect(200); // valeur de test
    await m.admin.put('/api/admin/settings/couriers.offer_expiry_seconds', { value: 120 }).expect(200);
    await m.admin.put('/api/admin/settings/orders.ready_without_courier_alert_minutes', { value: 5 }).expect(200);
  });
});

describe('Scénario 1 complet — de la commande à la remise avec code', () => {
  it('offre, acceptation, retrait, remise avec code, écritures et gains du livreur', async () => {
    const { R, c, orderId } = await readyOrder('Le Maquis Livré');
    const L = await courier('Livreur Koffi');

    const unassigned = await ops.client.get('/api/ops/orders?scope=unassigned');
    expect(unassigned.body.map((o: { id: string }) => o.id)).toContain(orderId);
    expect((await ops.client.post(`/api/ops/orders/${orderId}/offer`, { courierIds: [L.courierId] })).status).toBe(201);

    const offers = await L.client.get('/api/courier/offers');
    expect(offers.body).toHaveLength(1);
    expect(offers.body[0]).toMatchObject({ restaurantName: 'Le Maquis Livré', courierPay: TEST.courierPay });
    expect(JSON.stringify(offers.body)).not.toMatch(/\+229|Près du marché/); // aucune donnée client avant acceptation
    const deliveryId = offers.body[0].deliveryId;

    expect((await L.client.post(`/api/courier/offers/${deliveryId}/accept`)).status).toBe(201);
    expect((await c.client.get(`/api/orders/${orderId}`)).body.status).toBe('COURIER_ASSIGNED');
    const active = await L.client.get('/api/courier/active');
    expect(active.body.customer.phone).toMatch(/^\+229/);
    expect(active.body.cashToCollect).toBe((await c.client.get(`/api/orders/${orderId}`)).body.total);

    expect((await L.client.post(`/api/courier/deliveries/${deliveryId}/picked-up`)).status).toBe(422); // arrivée d'abord
    await L.client.post(`/api/courier/deliveries/${deliveryId}/arrived-pickup`).expect(201);
    await L.client.post(`/api/courier/deliveries/${deliveryId}/picked-up`).expect(201);
    expect((await c.client.get(`/api/orders/${orderId}`)).body.status).toBe('IN_DELIVERY');
    await L.client.post(`/api/courier/deliveries/${deliveryId}/arrived-dropoff`).expect(201);

    const code = (await c.client.get(`/api/orders/${orderId}`)).body.deliveryCode as string;
    const wrong = code === '0000' ? '1111' : '0000';
    const bad = await L.client.post(`/api/courier/deliveries/${deliveryId}/deliver`, { code: wrong });
    expect(bad.status).toBe(422);
    expect(bad.body.message).toMatch(/Il reste 4 essai/);
    const ok = await L.client.post(`/api/courier/deliveries/${deliveryId}/deliver`, { code });
    expect(ok.status).toBe(201);
    expect((await L.client.post(`/api/courier/deliveries/${deliveryId}/deliver`, { code })).status).toBe(404); // pas de double validation

    const final = await c.client.get(`/api/orders/${orderId}`);
    expect(final.body).toMatchObject({ status: 'DELIVERED', paymentStatus: 'SUCCEEDED' });
    const tx = await db(t).collection('ledger_transactions').findOne({ reference: orderId });
    const accounts = tx!.entries.map((e: { account: string }) => e.account);
    expect(accounts).toContain(`clearing:cash:${L.courierId}`);
    expect(accounts).toContain(`payable:courier:${L.courierId}`);
    const earnings = await L.client.get('/api/courier/earnings');
    expect(earnings.body.today).toEqual({ total: TEST.courierPay, count: 1 });
    expect(earnings.body.cashHeld).toBe(final.body.total);
    expect((await L.client.get('/api/courier/active')).body).toEqual({});
    void R;
  });
});

describe('Scénario 3 — aucun livreur disponible', () => {
  it('la commande reste cohérente, les opérations sont alertées une fois, puis l’affectation fonctionne', async () => {
    const { c, orderId } = await readyOrder('Resto Sans Livreur');
    const L = await courier('Livreur hors ligne', { online: false });
    const r = await ops.client.post(`/api/ops/orders/${orderId}/assign`, { courierId: L.courierId });
    expect(r.status).toBe(422);
    expect(r.body.message).toMatch(/hors ligne/);
    expect((await c.client.get(`/api/orders/${orderId}`)).body.status).toBe('WAITING_FOR_COURIER');

    await db(t).collection('orders').updateOne({ _id: new Types.ObjectId(orderId) }, { $set: { statusChangedAt: new Date(Date.now() - 10 * 60_000) } });
    const svc = t.app.get(OpsService);
    expect(await svc.runAlerts()).toBeGreaterThanOrEqual(1);
    await svc.runAlerts();
    const n = await ops.client.get('/api/notifications');
    const number = (await c.client.get(`/api/orders/${orderId}`)).body.number;
    expect(n.body.items.filter((x: { title: string }) => x.title === `Sans livreur : ${number}`)).toHaveLength(1);
    expect((await ops.client.get('/api/ops/overview')).body.lateCourier).toBeGreaterThanOrEqual(1);

    await L.client.post('/api/courier/online', { online: true }).expect(201);
    expect((await ops.client.post(`/api/ops/orders/${orderId}/assign`, { courierId: L.courierId })).status).toBe(201);
    expect((await c.client.get(`/api/orders/${orderId}`)).body.status).toBe('COURIER_ASSIGNED');
  });
});

describe('Garanties du dispatch', () => {
  it('une course proposée à deux livreurs n’est attribuée qu’à un seul', async () => {
    const { orderId } = await readyOrder('Resto Course Disputée');
    const A = await courier('Livreur rapide A');
    const B = await courier('Livreur rapide B');
    await ops.client.post(`/api/ops/orders/${orderId}/offer`, { courierIds: [A.courierId, B.courierId] }).expect(201);
    const did = (await A.client.get('/api/courier/offers')).body[0].deliveryId;
    const [ra, rb] = await Promise.all([A.client.post(`/api/courier/offers/${did}/accept`), B.client.post(`/api/courier/offers/${did}/accept`)]);
    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    const d = await db(t).collection('deliveries').findOne({ _id: new Types.ObjectId(did) });
    expect(d?.courierId).toBeTruthy();
    expect((await (ra.status === 201 ? B : A).client.get('/api/courier/offers')).body).toEqual([]);
  });

  it('un livreur ne voit ni ne modifie la course d’un autre, ni une offre qui ne lui est pas adressée', async () => {
    const { orderId } = await readyOrder('Resto Iso Livreur');
    const A = await courier('Livreur Iso A');
    const B = await courier('Livreur Iso B');
    await ops.client.post(`/api/ops/orders/${orderId}/offer`, { courierIds: [A.courierId] }).expect(201);
    const did = (await A.client.get('/api/courier/offers')).body[0].deliveryId;
    expect((await B.client.post(`/api/courier/offers/${did}/accept`)).status).toBe(404);
    await A.client.post(`/api/courier/offers/${did}/accept`).expect(201);
    expect((await B.client.get('/api/courier/active')).body).toEqual({});
    for (const step of ['arrived-pickup', 'picked-up', 'arrived-dropoff']) expect((await B.client.post(`/api/courier/deliveries/${did}/${step}`)).status).toBe(404);
    expect((await B.client.post(`/api/courier/deliveries/${did}/deliver`, { code: '1234' })).status).toBe(404);
    expect((await B.client.get('/api/courier/history')).body).toEqual([]);
    // Un client ordinaire n'a pas d'espace livreur ni d'accès aux opérations
    const plain = await registeredClient(t.app, 'Simple client');
    expect((await plain.client.get('/api/courier/offers')).status).toBe(403);
    expect((await plain.client.get('/api/ops/orders')).status).toBe(403);
  });

  it('un livreur au-dessus du plafond d’espèces n’est plus proposé', async () => {
    const { orderId } = await readyOrder('Resto Plafond');
    const L = await courier('Livreur chargé');
    await db(t).collection('ledger_transactions').insertOne({ type: 'test.cash', reference: new Types.ObjectId().toHexString(), restaurantId: null, entries: [{ account: `clearing:cash:${L.courierId}`, debit: 60_000, credit: 0 }, { account: 'test:contrepartie', debit: 0, credit: 60_000 }], createdAt: new Date() });
    const r = await ops.client.post(`/api/ops/orders/${orderId}/assign`, { courierId: L.courierId });
    expect(r.status).toBe(422);
    expect(r.body.message).toMatch(/Plafond/);
    const list = await ops.client.get('/api/ops/couriers');
    expect(list.body.find((x: { id: string }) => x.id === L.courierId).overLimit).toBe(true);
  });

  it('réattribution par les opérations et désistement du livreur', async () => {
    const { c, orderId } = await readyOrder('Resto Réattribution');
    const A = await courier('Livreur A désisté');
    const B = await courier('Livreur B remplaçant');
    await ops.client.post(`/api/ops/orders/${orderId}/assign`, { courierId: A.courierId }).expect(201);
    const did = (await A.client.get('/api/courier/active')).body.id;
    expect((await A.client.post(`/api/courier/deliveries/${did}/withdraw`, { reason: 'Crevaison' })).status).toBe(201);
    expect((await c.client.get(`/api/orders/${orderId}`)).body.status).toBe('WAITING_FOR_COURIER');
    expect((await A.client.get('/api/courier/me')).body.hasActiveDelivery).toBe(false);
    await ops.client.post(`/api/ops/orders/${orderId}/assign`, { courierId: B.courierId }).expect(201);
    expect((await ops.client.post(`/api/ops/orders/${orderId}/unassign`, { reason: 'Livreur injoignable' })).status).toBe(201);
    expect(await db(t).collection('deliveries').countDocuments({ orderId: new Types.ObjectId(orderId) })).toBe(2);
    const hist = (await c.client.get(`/api/orders/${orderId}`)).body.history.map((h: { status: string }) => h.status);
    expect(hist.filter((s: string) => s === 'COURIER_ASSIGNED')).toHaveLength(2);
  });

  it('livraison échouée : incident créé, puis nouvelle tentative par les opérations', async () => {
    const { c, orderId } = await readyOrder('Resto Échec');
    const L = await courier('Livreur échec');
    await ops.client.post(`/api/ops/orders/${orderId}/assign`, { courierId: L.courierId }).expect(201);
    const did = (await L.client.get('/api/courier/active')).body.id;
    await L.client.post(`/api/courier/deliveries/${did}/arrived-pickup`).expect(201);
    await L.client.post(`/api/courier/deliveries/${did}/picked-up`).expect(201);
    expect((await L.client.post(`/api/courier/deliveries/${did}/fail`, { reason: 'Client injoignable après 15 min' })).status).toBe(201);
    expect((await c.client.get(`/api/orders/${orderId}`)).body.status).toBe('DELIVERY_FAILED');
    const inc = await ops.client.get('/api/ops/incidents?status=open');
    expect(inc.body.some((i: { type: string; orderId: string }) => i.type === 'DELIVERY_FAILED' && i.orderId === orderId)).toBe(true);
    expect((await ops.client.post(`/api/ops/orders/${orderId}/retry`)).status).toBe(201);
    expect((await c.client.get(`/api/orders/${orderId}`)).body.status).toBe('WAITING_FOR_COURIER');
  });

  it('5 codes erronés bloquent la validation et ouvrent un incident', async () => {
    const { c, orderId } = await readyOrder('Resto Code Bloqué');
    const L = await courier('Livreur code');
    await ops.client.post(`/api/ops/orders/${orderId}/assign`, { courierId: L.courierId }).expect(201);
    const did = (await L.client.get('/api/courier/active')).body.id;
    await L.client.post(`/api/courier/deliveries/${did}/arrived-pickup`).expect(201);
    await L.client.post(`/api/courier/deliveries/${did}/picked-up`).expect(201);
    const code = (await c.client.get(`/api/orders/${orderId}`)).body.deliveryCode as string;
    const wrong = code === '9999' ? '8888' : '9999';
    for (let i = 0; i < 5; i++) await L.client.post(`/api/courier/deliveries/${did}/deliver`, { code: wrong });
    const locked = await L.client.post(`/api/courier/deliveries/${did}/deliver`, { code });
    expect(locked.status).toBe(423);
    const inc = await ops.client.get('/api/ops/incidents?status=open');
    expect(inc.body.some((i: { description: string }) => i.description.includes('erroné'))).toBe(true);
  });
});

describe('Incidents', () => {
  it('un problème signalé par le restaurant devient un incident ; la clôture exige une résolution', async () => {
    const R = await m.restaurant('Resto Incident');
    const c = await m.customer();
    const { orderId } = await m.order(c, R.productId);
    await R.owner.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/issues`, { type: 'MISSING_ITEM', description: 'Plus de poulet' }).expect(201);
    const list = await ops.client.get('/api/ops/incidents?status=open');
    const inc = list.body.find((i: { orderId: string }) => i.orderId === orderId);
    expect(inc).toMatchObject({ type: 'MISSING_ITEM', status: 'OPEN', source: 'restaurant' });
    expect((await ops.client.patch(`/api/ops/incidents/${inc.id}`, { status: 'RESOLVED' })).status).toBe(400);
    const taken = await ops.client.patch(`/api/ops/incidents/${inc.id}`, { assignToMe: true, note: 'J’appelle le restaurant' });
    expect(taken.body).toMatchObject({ status: 'IN_PROGRESS', ownerId: ops.userId });
    const done = await ops.client.patch(`/api/ops/incidents/${inc.id}`, { status: 'RESOLVED', resolution: 'Plat remplacé avec accord du client' });
    expect(done.body.status).toBe('RESOLVED');
    expect(done.body.events.map((e: { action: string }) => e.action)).toEqual(['Ouverture', 'Prise en charge', 'Note', 'Statut : RESOLVED', 'Résolution']);
  });
});

