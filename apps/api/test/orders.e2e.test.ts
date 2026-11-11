import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io } from 'socket.io-client';
import { Types } from 'mongoose';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { OrdersScheduler } from '../src/modules/orders/orders.scheduler';
import { OrdersService } from '../src/modules/orders/orders.service';
import { Client, db, PASSWORD, platformUser, registeredClient, startApp, TestEnv } from './helpers';

/* Valeurs de TEST uniquement (aucune n'est une valeur par défaut du code). */
const TEST_FEE = { customerFee: 1000, courierPay: 700 };
const TEST_COMMISSION_BPS = 1500;
const TEST_SERVICE_FEE = 200;

let t: TestEnv;
let admin: Client;
let ops: Awaited<ReturnType<typeof platformUser>>;
const ids = { hoodA: '', hoodB: '', hoodOut: '', zone: '', zoneOut: '', cuisine: '' };
const HOURS = { openingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: '00:00', closes: '23:59' })), closures: [] };

async function restaurant(name: string, opts: { contract?: boolean } = {}) {
  const owner = await registeredClient(t.app, `Propriétaire ${name}`);
  const app = await owner.client.post('/api/restaurant-applications', { name, phone: owner.phone, neighborhoodId: ids.hoodA, address: 'Rue A', cuisineIds: [ids.cuisine] });
  const rid = app.body.id as string;
  await owner.client.put(`/api/restaurants/${rid}/hours`, HOURS).expect(200);
  await owner.client.post(`/api/restaurants/${rid}/profile/publish`).expect(201);
  await admin.post(`/api/admin/restaurants/${rid}/review`, { decision: 'approve' }).expect(201);
  await owner.client.put(`/api/restaurants/${rid}/zones`, { zoneIds: [ids.zone] }).expect(200);
  if (opts.contract !== false) await admin.put(`/api/admin/restaurants/${rid}/contract`, { commissionRateBps: TEST_COMMISSION_BPS }).expect(200);
  await owner.client.patch(`/api/restaurants/${rid}/accepting-orders`, { acceptingOrders: true }).expect(200);
  const cat = await owner.client.post(`/api/restaurants/${rid}/menu/categories`, { name: 'Plats' });
  const p = await owner.client.post(`/api/restaurants/${rid}/menu/products`, {
    menuCategoryId: cat.body.id, name: 'Poulet braisé', basePrice: 3000,
    variantGroups: [{ name: 'Taille', options: [{ name: 'Normale', priceDelta: 0 }, { name: 'Grande', priceDelta: 1000 }] }],
    addonGroups: [{ name: 'Suppléments', min: 0, max: 2, options: [{ name: 'Alloco', price: 500 }, { name: 'Œuf', price: 300 }] }],
  });
  await owner.client.post(`/api/restaurants/${rid}/menu/products/${p.body.id}/publish`).expect(201);
  return { rid, owner, product: p.body as { id: string; basePrice: number; variantGroups: { id: string; options: { id: string }[] }[]; addonGroups: { options: { id: string }[] }[] } };
}

async function customer(hood = ids.hoodB) {
  const c = await registeredClient(t.app, 'Client Test');
  const a = await c.client.post('/api/me/addresses', { label: 'Maison', neighborhoodId: hood, streetLandmark: 'Derrière la pharmacie' });
  expect(a.status).toBe(201);
  return { ...c, addressId: a.body.id as string };
}

/** Panier : 2 × (Grande + Alloco) = 2 × 4500 = 9000. */
async function fillCart(c: Client, R: Awaited<ReturnType<typeof restaurant>>, qty = 2) {
  const g = R.product.variantGroups[0];
  await c.post('/api/cart/items', { item: { productId: R.product.id, qty, variants: { [g.id]: g.options[1].id }, addons: [R.product.addonGroups[0].options[0].id] } }).expect(204);
}

const key = () => `cle-${new Types.ObjectId().toHexString()}`;

async function placeOrder(c: Awaited<ReturnType<typeof customer>>) {
  const q = await c.client.get(`/api/cart?addressId=${c.addressId}`);
  expect(q.body.blocking).toEqual([]);
  const r = await c.client.post('/api/orders', { addressId: c.addressId, paymentMethod: 'CASH', expectedTotal: q.body.total, idempotencyKey: key() });
  expect(r.status).toBe(201);
  return r.body.orderId as string;
}

beforeAll(async () => {
  t = await startApp();
  admin = (await platformUser(t.app, 'super_admin')).client;
  ops = await platformUser(t.app, 'operations_manager');
  const city = await admin.post('/api/admin/geo/cities', { name: 'Cotonou' });
  const commune = await admin.post('/api/admin/geo/communes', { parentId: city.body.id, name: 'Cotonou' });
  ids.hoodA = (await admin.post('/api/admin/geo/neighborhoods', { parentId: commune.body.id, name: 'Cadjèhoun' })).body.id;
  ids.hoodB = (await admin.post('/api/admin/geo/neighborhoods', { parentId: commune.body.id, name: 'Akpakpa' })).body.id;
  ids.hoodOut = (await admin.post('/api/admin/geo/neighborhoods', { parentId: commune.body.id, name: 'Godomey' })).body.id;
  ids.zone = (await admin.post('/api/admin/geo/zones', { name: 'Centre', neighborhoodIds: [ids.hoodA, ids.hoodB] })).body.id;
  ids.zoneOut = (await admin.post('/api/admin/geo/zones', { name: 'Périphérie', neighborhoodIds: [ids.hoodOut] })).body.id;
  await admin.post('/api/admin/geo/fee-rules', { fromZoneId: ids.zone, toZoneId: ids.zone, ...TEST_FEE }).expect(201);
  ids.cuisine = (await admin.post('/api/admin/cuisines', { name: 'Africaine' })).body.id;
});
afterAll(async () => {
  await t?.close();
});

describe('Configuration obligatoire (aucune valeur commerciale par défaut)', () => {
  it('refuse la commande tant que les paramètres de plateforme ne sont pas configurés', async () => {
    const R = await restaurant('Resto Config');
    const c = await customer();
    await fillCart(c.client, R);
    const q = await c.client.get(`/api/cart?addressId=${c.addressId}`);
    expect(q.body.blocking.map((b: { code: string }) => b.code)).toContain('PLATFORM_NOT_CONFIGURED');
    expect(q.body.total).toBeNull();
    await admin.put('/api/admin/settings/orders.service_fee_fcfa', { value: TEST_SERVICE_FEE }).expect(200);
    await admin.put('/api/admin/settings/orders.restaurant_response_minutes', { value: 10 }).expect(200);
    const q2 = await c.client.get(`/api/cart?addressId=${c.addressId}`);
    expect(q2.body.blocking).toEqual([]);
    expect(q2.body).toMatchObject({ itemsSubtotal: 9000, deliveryFee: 1000, serviceFee: 200, total: 10_200 });
  });

  it('refuse un restaurant sans contrat de commission', async () => {
    const R = await restaurant('Resto Sans Contrat', { contract: false });
    const c = await customer();
    await fillCart(c.client, R);
    const r = await c.client.post('/api/orders', { addressId: c.addressId, paymentMethod: 'CASH', expectedTotal: 0, idempotencyKey: key() });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('RESTAURANT_NOT_CONFIGURED');
  });

  it('refuse une adresse hors des zones desservies', async () => {
    const R = await restaurant('Resto Zone');
    const c = await customer(ids.hoodOut);
    await fillCart(c.client, R);
    const q = await c.client.get(`/api/cart?addressId=${c.addressId}`);
    expect(q.body.blocking[0].code).toBe('OUT_OF_ZONE');
  });
});

describe('Scénario 1 — commande complète jusqu’à la livraison et écritures financières', () => {
  it('du panier au statut livré, avec historique, notifications et grand livre équilibré', async () => {
    const R = await restaurant('Le Maquis Complet');
    const c = await customer();
    await fillCart(c.client, R);
    const orderId = await placeOrder(c);

    // Le panier est vidé, le client voit sa commande et son code de livraison
    expect((await c.client.get('/api/cart')).body.lines).toEqual([]);
    const mine = await c.client.get(`/api/orders/${orderId}`);
    expect(mine.body).toMatchObject({ status: 'PENDING', total: 10_200, itemsSubtotal: 9000 });
    expect(mine.body.items[0]).toMatchObject({ name: 'Poulet braisé', qty: 2, unitPrice: 4500, optionLabels: ['Grande', '+ Alloco'] });
    expect(mine.body.deliveryCode).toMatch(/^\d{4}$/);

    // Le restaurant est notifié et voit la commande, sans le code de livraison
    const notif = await R.owner.client.get('/api/notifications');
    expect(notif.body.items[0].title).toMatch(/Nouvelle commande CT-/);
    const view = await R.owner.client.get(`/api/restaurants/${R.rid}/orders/${orderId}`);
    expect(view.body.deliveryCode).toBeUndefined();
    expect(view.body.customer.phone).toMatch(/^\+229/);

    for (const step of ['accept', 'prepare', 'ready', 'request-courier']) {
      expect((await R.owner.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/${step}`)).status).toBe(201);
    }
    const after = await c.client.get(`/api/orders/${orderId}`);
    expect(after.body.status).toBe('WAITING_FOR_COURIER');
    expect(after.body.history.map((h: { status: string }) => h.status)).toEqual(['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'WAITING_FOR_COURIER']);
    const cn = await c.client.get('/api/notifications');
    expect(cn.body.items.map((n: { title: string }) => n.title).join(' | ')).toMatch(/Acceptée.*|.*Prête/);

    // Étapes livreur (module livreur en phase 4) : appel direct du service, comme le fera l'API livreur.
    const svc = t.app.get(OrdersService);
    const courierId = new Types.ObjectId();
    let o = await svc.findAny(new Types.ObjectId(orderId));
    await svc.transition(o, 'COURIER_ASSIGNED', { kind: 'ops', userId: ops.userId }, null, { courierId });
    for (const s of ['PICKED_UP', 'IN_DELIVERY', 'DELIVERED'] as const) {
      o = await svc.findAny(new Types.ObjectId(orderId));
      await svc.transition(o, s, { kind: 'courier', userId: null });
    }
    const delivered = await c.client.get(`/api/orders/${orderId}`);
    expect(delivered.body).toMatchObject({ status: 'DELIVERED', paymentStatus: 'SUCCEEDED' });

    // Grand livre : une transaction équilibrée, montants issus des valeurs figées sur la commande
    const tx = await db(t).collection('ledger_transactions').find({ reference: orderId }).toArray();
    expect(tx).toHaveLength(1);
    const e = Object.fromEntries(tx[0].entries.map((x: { account: string; debit: number; credit: number }) => [x.account.split(':').slice(0, 2).join(':'), x.debit || -x.credit]));
    expect(e['clearing:cash']).toBe(10_200);
    expect(e['payable:restaurant']).toBe(-7650); // 9000 − 15 % (taux de test)
    expect(e['revenue:commission']).toBe(-1350);
    expect(e['payable:courier']).toBe(-700);
    expect(e['revenue:delivery']).toBe(-300);
    expect(e['revenue:service']).toBe(-200);
    // Idempotence : une deuxième comptabilisation n'ajoute rien
    await t.app.get(LedgerService).postOrderDelivered((await db(t).collection('orders').findOne({ _id: new Types.ObjectId(orderId) })) as never);
    expect(await db(t).collection('ledger_transactions').countDocuments({ reference: orderId })).toBe(1);
    // Le grand livre est en ajout seul
    await expect(db(t).model('LedgerTransaction').updateOne({ reference: orderId }, { description: 'x' }).exec()).rejects.toThrow(/APPEND_ONLY/);
  });

  it('un restaurant ne peut jamais marquer une commande livrée', async () => {
    const R = await restaurant('Resto Triche');
    const c = await customer();
    await fillCart(c.client, R);
    const orderId = await placeOrder(c);
    const svc = t.app.get(OrdersService);
    await expect(svc.transition(await svc.findAny(new Types.ObjectId(orderId)), 'DELIVERED', { kind: 'restaurant', userId: R.owner.userId })).rejects.toThrow();
    expect((await R.owner.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/ready`)).status).toBe(422); // pas d'étape sautée
  });
});

describe('Scénario 2 — refus d’une commande', () => {
  it('motif obligatoire, enregistré et communiqué au client ; plus aucune action ensuite', async () => {
    const R = await restaurant('Resto Refus');
    const c = await customer();
    await fillCart(c.client, R);
    const orderId = await placeOrder(c);
    expect((await R.owner.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/reject`, {})).status).toBe(400);
    expect((await R.owner.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/reject`, { reason: 'Rupture de poulet' })).status).toBe(201);
    const v = await c.client.get(`/api/orders/${orderId}`);
    expect(v.body).toMatchObject({ status: 'REJECTED', rejectReason: 'Rupture de poulet', paymentStatus: 'NOT_DUE' });
    const n = await c.client.get('/api/notifications');
    expect(n.body.items[0].body).toMatch(/Motif : Rupture de poulet/);
    expect((await R.owner.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/accept`)).status).toBe(422);
    expect(await db(t).collection('ledger_transactions').countDocuments({ reference: orderId })).toBe(0);
  });
});

describe('Robustesse de la création de commande', () => {
  it('double soumission simultanée : une seule commande', async () => {
    const R = await restaurant('Resto Double Clic');
    const c = await customer();
    await fillCart(c.client, R);
    const q = await c.client.get(`/api/cart?addressId=${c.addressId}`);
    const body = { addressId: c.addressId, paymentMethod: 'CASH', expectedTotal: q.body.total, idempotencyKey: key() };
    const [a, b] = await Promise.all([c.client.post('/api/orders', body), c.client.post('/api/orders', body)]);
    expect([a.status, b.status].sort()).toEqual([201, 201]);
    expect(a.body.orderId).toBe(b.body.orderId);
    expect(await db(t).collection('orders').countDocuments({ customerId: new Types.ObjectId(c.userId) })).toBe(1);
  });

  it('prix modifié entre consultation et validation : 409 avec le nouveau devis', async () => {
    const R = await restaurant('Resto Prix');
    const c = await customer();
    await fillCart(c.client, R);
    const q = await c.client.get(`/api/cart?addressId=${c.addressId}`);
    const menu = await R.owner.client.get(`/api/restaurants/${R.rid}/menu`);
    const p = menu.body.products[0];
    await R.owner.client.put(`/api/restaurants/${R.rid}/menu/products/${p.id}`, { ...p, basePrice: 3500, images: [] }).expect(200);
    const r = await c.client.post('/api/orders', { addressId: c.addressId, paymentMethod: 'CASH', expectedTotal: q.body.total, idempotencyKey: key() });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('PRICE_CHANGED');
    expect(r.body.quote.total).toBe(q.body.total + 1000);
  });

  it('ne fait jamais confiance au prix du navigateur et refuse un plat devenu indisponible', async () => {
    const R = await restaurant('Resto Dispo');
    const c = await customer();
    await fillCart(c.client, R);
    const lowball = await c.client.post('/api/orders', { addressId: c.addressId, paymentMethod: 'CASH', expectedTotal: 100, idempotencyKey: key() });
    expect(lowball.status).toBe(409);
    await R.owner.client.patch(`/api/restaurants/${R.rid}/menu/products/${R.product.id}/availability`, { available: false }).expect(200);
    const r = await c.client.post('/api/orders', { addressId: c.addressId, paymentMethod: 'CASH', expectedTotal: 10_200, idempotencyKey: key() });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('ITEMS_UNAVAILABLE');
  });

  it('refuse quand le restaurant est fermé ou suspend ses commandes', async () => {
    const R = await restaurant('Resto Fermé');
    const c = await customer();
    await fillCart(c.client, R);
    await R.owner.client.patch(`/api/restaurants/${R.rid}/accepting-orders`, { acceptingOrders: false }).expect(200);
    const q = await c.client.get(`/api/cart?addressId=${c.addressId}`);
    expect(q.body.blocking.map((b: { code: string }) => b.code)).toContain('NOT_ACCEPTING');
  });

  it('un panier ne mélange jamais deux restaurants', async () => {
    const A = await restaurant('Panier A');
    const B = await restaurant('Panier B');
    const c = await customer();
    await fillCart(c.client, A, 1);
    const r = await c.client.post('/api/cart/items', { item: { productId: B.product.id, qty: 1, variants: { [B.product.variantGroups[0].id]: B.product.variantGroups[0].options[0].id } } });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('OTHER_RESTAURANT');
    await c.client.post('/api/cart/items', { replace: true, item: { productId: B.product.id, qty: 1, variants: { [B.product.variantGroups[0].id]: B.product.variantGroups[0].options[0].id } } }).expect(204);
    expect((await c.client.get('/api/cart')).body.restaurant.name).toBe('Panier B');
  });
});

describe('Isolation et permissions sur les commandes (API)', () => {
  it('ni un autre restaurant ni un autre client ne voient la commande', async () => {
    const A = await restaurant('Iso Cmd A');
    const B = await restaurant('Iso Cmd B');
    const c = await customer();
    await fillCart(c.client, A);
    const orderId = await placeOrder(c);
    expect((await B.owner.client.get(`/api/restaurants/${A.rid}/orders/${orderId}`)).status).toBe(404);
    expect((await B.owner.client.get(`/api/restaurants/${B.rid}/orders/${orderId}`)).status).toBe(404);
    expect((await B.owner.client.post(`/api/restaurants/${B.rid}/orders/${orderId}/accept`)).status).toBe(404);
    const other = await customer();
    expect((await other.client.get(`/api/orders/${orderId}`)).status).toBe(404);
    expect((await other.client.post(`/api/orders/${orderId}/cancel`, { reason: 'Pas à moi' })).status).toBe(404);
  });

  it('le cuisinier prépare mais n’accepte pas et ne voit pas le téléphone du client', async () => {
    const R = await restaurant('Iso Cuisinier');
    const cook = await registeredClient(t.app, 'Cuisinier');
    await R.owner.client.post(`/api/restaurants/${R.rid}/staff`, { phone: cook.phone, roleCode: 'cook' }).expect(201);
    const c = await customer();
    await fillCart(c.client, R);
    const orderId = await placeOrder(c);
    expect((await cook.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/accept`)).status).toBe(403);
    const view = await cook.client.get(`/api/restaurants/${R.rid}/orders/${orderId}`);
    expect(view.body.customer.phone).toBeNull();
    expect(view.body.address.streetLandmark).toBe('');
    await R.owner.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/accept`).expect(201);
    expect((await cook.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/prepare`)).status).toBe(201);
  });

  it('le client annule une commande en attente mais plus après acceptation', async () => {
    const R = await restaurant('Resto Annulation');
    const c = await customer();
    await fillCart(c.client, R);
    const o1 = await placeOrder(c);
    expect((await c.client.post(`/api/orders/${o1}/cancel`, { reason: 'Je me suis trompé' })).status).toBe(201);
    await fillCart(c.client, R);
    const o2 = await placeOrder(c);
    await R.owner.client.post(`/api/restaurants/${R.rid}/orders/${o2}/accept`).expect(201);
    expect((await c.client.post(`/api/orders/${o2}/cancel`, { reason: 'Trop tard' })).status).toBe(422);
    expect((await ops.client.post(`/api/ops/orders/${o2}/cancel`, { reason: 'Client injoignable' })).status).toBe(201);
  });
});

describe('Délai de réponse du restaurant', () => {
  it('alerte une seule fois les opérations et le restaurant', async () => {
    const R = await restaurant('Resto Lent');
    const c = await customer();
    await fillCart(c.client, R);
    const orderId = await placeOrder(c);
    await db(t).collection('orders').updateOne({ _id: new Types.ObjectId(orderId) }, { $set: { acceptDeadlineAt: new Date(Date.now() - 60_000) } });
    const sched = t.app.get(OrdersScheduler);
    await sched.runOnce();
    await sched.runOnce();
    const opsN = await ops.client.get('/api/notifications');
    expect(opsN.body.items.filter((n: { title: string }) => n.title.includes('sans réponse')).length).toBe(1);
    const resto = await R.owner.client.get('/api/notifications');
    expect(resto.body.items.some((n: { title: string }) => n.title.includes('sans réponse'))).toBe(true);
  });
});

describe('Temps réel', () => {
  async function sidFor(phone: string) {
    const c = await new Client(t.app).init();
    const r = await c.post('/api/auth/login', { identifier: phone, password: PASSWORD });
    const raw = (r.headers['set-cookie'] as unknown as string[]).find((x) => x.startsWith('sid='))!;
    return raw.split(';')[0];
  }
  const connect = (port: number, cookie: string) =>
    io(`http://127.0.0.1:${port}`, { path: '/socket.io', transports: ['websocket'], extraHeaders: { cookie }, reconnection: false });
  const subscribe = (s: ReturnType<typeof io>, id: string) =>
    new Promise<{ ok: boolean }>((res) => {
      const go = () => s.emit('subscribe', { type: 'restaurant', id }, res);
      if (s.connected) go(); else s.once('connect', go);
      s.once('disconnect', () => res({ ok: false }));
    });

  it('le restaurant reçoit la nouvelle commande en direct ; un inconnu ne peut pas s’abonner', async () => {
    const server = await t.app.listen(0);
    const port = (server.address() as { port: number }).port;
    const R = await restaurant('Resto Direct');
    const socket = connect(port, await sidFor(R.owner.phone));
    expect((await subscribe(socket, R.rid)).ok).toBe(true);
    const intruder = await registeredClient(t.app, 'Intrus');
    const s2 = connect(port, await sidFor(intruder.phone));
    expect((await subscribe(s2, R.rid)).ok).toBe(false);
    const anon = connect(port, 'sid=invalide-000000000000000000000000');
    expect((await subscribe(anon, R.rid)).ok).toBe(false);

    const received = new Promise<{ number: string }>((res) => socket.on('order.created', res));
    const c = await customer();
    await fillCart(c.client, R);
    await placeOrder(c);
    expect((await received).number).toMatch(/^CT-/);
    socket.close(); s2.close(); anon.close();
  });
});
