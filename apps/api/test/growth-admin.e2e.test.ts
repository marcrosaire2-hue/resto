import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { delivery, marketplace, Market, TEST } from './fixtures';
import { platformUser, registeredClient, startApp, TestEnv } from './helpers';

let t: TestEnv;
let m: Market;
let D: Awaited<ReturnType<typeof delivery>>;
let com: Awaited<ReturnType<typeof platformUser>>;
const day = 86_400_000;
const window = () => ({ startsAt: new Date(Date.now() - day).toISOString(), endsAt: new Date(Date.now() + day).toISOString() });
type Card = { id: string; name: string; slug: string; sponsored?: boolean };

beforeAll(async () => {
  t = await startApp();
  m = await marketplace(t);
  D = await delivery(t, m);
  com = await platformUser(t.app, 'commercial_manager');
});
afterAll(async () => {
  await t?.close();
});

describe('Coupons de la plateforme', () => {
  it('appliqué côté serveur, financé par la plateforme, usage limité de façon atomique', async () => {
    const R = await m.restaurant('Resto Coupon');
    const r = await com.client.post('/api/admin/coupons', { code: 'bienvenue', type: 'PERCENT', value: 10, maxUses: 1, ...window() });
    expect(r.status).toBe(201);
    expect((await com.client.post('/api/admin/coupons', { code: 'BIENVENUE', type: 'FIXED', value: 500, ...window() })).status).toBe(409);

    const c1 = await m.customer();
    await c1.client.post('/api/cart/items', { item: { productId: R.productId, qty: 1 } }).expect(204);
    await c1.client.put('/api/cart/coupon', { code: 'bienvenue' }).expect(204);
    const q = await c1.client.get(`/api/cart?addressId=${c1.addressId}`);
    expect(q.body.coupon).toMatchObject({ code: 'BIENVENUE', applied: true });
    expect(q.body.platformDiscount).toBe(300);
    expect(q.body.total).toBe(3000 - 300 + TEST.customerFee + TEST.serviceFee);

    // Un second client prépare son panier avec le même code avant que le premier ne commande.
    const c2 = await m.customer();
    await c2.client.post('/api/cart/items', { item: { productId: R.productId, qty: 1 } }).expect(204);
    await c2.client.put('/api/cart/coupon', { code: 'BIENVENUE' }).expect(204);
    const q2 = await c2.client.get(`/api/cart?addressId=${c2.addressId}`);

    const o = await c1.client.post('/api/orders', { addressId: c1.addressId, paymentMethod: 'CASH', expectedTotal: q.body.total, idempotencyKey: 'cle-coupon-1-xxxx' });
    expect(o.status).toBe(201);
    const view = await c1.client.get(`/api/orders/${o.body.orderId}`);
    expect(view.body).toMatchObject({ platformDiscount: 300, total: q.body.total });
    // La commission reste calculée sur le sous-total : la réduction est à la charge de la plateforme.
    const o2 = await c2.client.post('/api/orders', { addressId: c2.addressId, paymentMethod: 'CASH', expectedTotal: q2.body.total, idempotencyKey: 'cle-coupon-2-xxxx' });
    expect(o2.status).toBe(409); // le total a changé (coupon épuisé) ou COUPON_EXHAUSTED
    const q3 = await c2.client.get(`/api/cart?addressId=${c2.addressId}`);
    expect(q3.body.coupon).toMatchObject({ applied: false });
    expect(q3.body.coupon.message).toMatch(/nombre maximal/);
  });

  it('un code inconnu ou réservé à un autre restaurant n’applique aucune réduction', async () => {
    const R = await m.restaurant('Resto Sans Coupon');
    const other = await m.restaurant('Resto Ciblé');
    await com.client.post('/api/admin/coupons', { code: 'CIBLE', type: 'FIXED', value: 500, restaurantIds: [other.rid], ...window() }).expect(201);
    const c = await m.customer();
    await c.client.post('/api/cart/items', { item: { productId: R.productId, qty: 1 } }).expect(204);
    await c.client.put('/api/cart/coupon', { code: 'CIBLE' }).expect(204);
    const q = await c.client.get(`/api/cart?addressId=${c.addressId}`);
    expect(q.body.platformDiscount).toBe(0);
    expect(q.body.coupon.message).toMatch(/pas valable pour ce restaurant/);
  });

  it('seul le personnel habilité gère les coupons', async () => {
    const support = await platformUser(t.app, 'support_agent');
    expect((await support.client.post('/api/admin/coupons', { code: 'PIRATE', type: 'FIXED', value: 500, ...window() })).status).toBe(403);
  });
});

describe('Abonnements, publicités et accueil administrable', () => {
  it('la limite de plats du plan est appliquée', async () => {
    const R = await m.restaurant('Resto Abonné');
    const plan = await com.client.post('/api/admin/plans', { code: 'essentiel', name: 'Essentiel', monthlyPrice: 0, maxProducts: 1 });
    expect(plan.status).toBe(201);
    await com.client.post(`/api/admin/restaurants/${R.rid}/subscription`, { planId: plan.body.id }).expect(201);
    const r = await R.owner.client.post(`/api/restaurants/${R.rid}/menu/products`, { menuCategoryId: R.categoryId, name: 'Deuxième plat', basePrice: 2000 });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('PLAN_LIMIT');
  });

  it('un restaurant sponsorisé apparaît en tête avec l’étiquette « Sponsorisé »', async () => {
    const R = await m.restaurant('Resto Sponsorisé');
    await com.client.post('/api/admin/ads', { restaurantId: R.rid, placement: 'TOP_LIST', price: 0, ...window() }).expect(201);
    const list = (await m.admin.get('/api/catalog/restaurants')).body as Card[];
    expect(list[0]).toMatchObject({ id: R.rid, sponsored: true });
    expect(list.filter((r) => r.sponsored)).toHaveLength(1);
    expect((await com.client.post('/api/admin/ads', { restaurantId: R.rid, placement: 'FEATURED_PRODUCT', productId: '0'.repeat(24), price: 0, ...window() })).status).toBe(422);
  });

  it('l’accueil suit les sections configurées', async () => {
    const before = await registeredClient(t.app, 'Visiteur');
    const h0 = await before.client.get('/api/catalog/home');
    expect(h0.body.configured).toBe(false);
    const s = await com.client.post('/api/admin/home-sections', { type: 'NEW_RESTAURANTS', title: 'Nouveautés', sort: 1 });
    expect(s.status).toBe(201);
    const h1 = await before.client.get('/api/catalog/home');
    expect(h1.body.configured).toBe(true);
    expect(h1.body.sections.map((x: { type: string }) => x.type)).toEqual(['NEW_RESTAURANTS']);
    await com.client.agent.delete(`/api/admin/home-sections/${s.body.id}`).set('x-csrf-token', com.client.csrf).expect(204);
    expect((await before.client.get('/api/catalog/home')).body.configured).toBe(false);
  });
});

describe('Avis clients', () => {
  it('seul l’acheteur d’une commande livrée note, une fois ; réponse du restaurant ; modération', async () => {
    const R = await m.restaurant('Resto Avis');
    const L = await D.courier('Livreur Avis');
    const c = await m.customer();
    const { orderId } = await m.order(c, R.productId);
    expect((await c.client.post(`/api/orders/${orderId}/review`, { rating: 5 })).status).toBe(422); // pas encore livrée
    await D.deliver(R, c, orderId, L);
    const stranger = await m.customer();
    expect((await stranger.client.post(`/api/orders/${orderId}/review`, { rating: 1, comment: 'Faux avis' })).status).toBe(404);
    const rv = await c.client.post(`/api/orders/${orderId}/review`, { rating: 4, comment: 'Très bon poulet' });
    expect(rv.status).toBe(201);
    expect((await c.client.post(`/api/orders/${orderId}/review`, { rating: 5 })).status).toBe(409);

    const slug = ((await c.client.get('/api/catalog/restaurants')).body as Card[]).find((r) => r.id === R.rid)!.slug;
    const pub = await c.client.get(`/api/catalog/restaurants/${slug}/reviews`);
    expect(pub.body).toHaveLength(1);
    expect(pub.body[0]).toMatchObject({ rating: 4, authorName: 'Client' });
    expect((await c.client.get(`/api/catalog/restaurants/${slug}`)).body).toMatchObject({ rating: 4, ratingCount: 1 });

    await R.owner.client.post(`/api/restaurants/${R.rid}/reviews/${rv.body.id}/reply`, { reply: 'Merci beaucoup !' }).expect(201);
    const other = await m.restaurant('Resto Concurrent');
    expect((await other.owner.client.post(`/api/restaurants/${other.rid}/reviews/${rv.body.id}/reply`, { reply: 'Intrusion' })).status).toBe(404);

    expect((await m.admin.post(`/api/admin/reviews/${rv.body.id}/moderate`, { status: 'HIDDEN' })).status).toBe(400); // motif obligatoire
    await m.admin.post(`/api/admin/reviews/${rv.body.id}/moderate`, { status: 'HIDDEN', reason: 'Contenu hors sujet' }).expect(201);
    expect((await c.client.get(`/api/catalog/restaurants/${slug}/reviews`)).body).toHaveLength(0);
    expect((await c.client.get(`/api/catalog/restaurants/${slug}`)).body).toMatchObject({ ratingCount: 0 });
  });
});

describe('Assistance', () => {
  it('le client ouvre un ticket, le support répond, le client ne voit que ses tickets', async () => {
    const c = await m.customer();
    const tk = await c.client.post('/api/support/tickets', { subject: 'Livraison en retard', message: 'Ma commande n’est pas arrivée.' });
    expect(tk.status).toBe(201);
    const other = await m.customer();
    expect((await other.client.get(`/api/support/tickets/${tk.body.id}`)).status).toBe(404);
    expect((await c.client.get('/api/support/tickets')).body).toHaveLength(1);

    expect((await c.client.get('/api/admin/tickets')).status).toBe(403);
    const support = await platformUser(t.app, 'support_agent');
    const list = await support.client.get('/api/admin/tickets?status=open');
    expect(list.body.find((x: { id: string }) => x.id === tk.body.id)).toMatchObject({ customer: { name: 'Client' } });
    await support.client.post(`/api/admin/tickets/${tk.body.id}/messages`, { body: 'Nous contactons le livreur.' }).expect(201);
    const mine = await c.client.get(`/api/support/tickets/${tk.body.id}`);
    expect(mine.body).toMatchObject({ status: 'PENDING_CUSTOMER' });
    expect(mine.body.messages).toHaveLength(2);
    await support.client.patch(`/api/admin/tickets/${tk.body.id}`, { status: 'CLOSED' }).expect(200);
    expect((await c.client.post(`/api/support/tickets/${tk.body.id}/messages`, { body: 'Encore là ?' })).status).toBe(422);
  });

  it('refuse de lier un ticket à la commande d’un autre client', async () => {
    const R = await m.restaurant('Resto Ticket');
    const c = await m.customer();
    const { orderId } = await m.order(c, R.productId);
    const intruder = await m.customer();
    expect((await intruder.client.post('/api/support/tickets', { subject: 'Test', message: 'Commande d’un autre', orderId })).status).toBe(404);
  });
});

describe('Console d’administration', () => {
  it('le tableau de bord agrège les données réelles', async () => {
    const d = await m.admin.get('/api/admin/dashboard?days=30');
    expect(d.status).toBe(200);
    expect(d.body.orders.delivered).toBeGreaterThanOrEqual(1);
    expect(d.body.money.gmv).toBeGreaterThan(0);
    expect(d.body.daily.length).toBeGreaterThanOrEqual(1);
    const support = await platformUser(t.app, 'support_agent');
    expect((await support.client.get('/api/admin/dashboard')).status).toBe(403);
  });

  it('suspendre un client révoque ses sessions immédiatement', async () => {
    const c = await m.customer();
    const found = await m.admin.get(`/api/admin/customers?q=${encodeURIComponent(c.phone.slice(-6))}`);
    const target = found.body.find((u: { phone: string }) => u.phone.endsWith(c.phone.slice(-8)));
    expect(target).toBeTruthy();
    const support = await platformUser(t.app, 'support_agent');
    expect((await support.client.get(`/api/admin/customers/${target.id}`)).status).toBe(200);
    expect((await support.client.post(`/api/admin/customers/${target.id}/status`, { status: 'SUSPENDED', reason: 'Fraude' })).status).toBe(403);
    expect((await m.admin.post(`/api/admin/customers/${target.id}/status`, { status: 'SUSPENDED' })).status).toBe(400);
    await m.admin.post(`/api/admin/customers/${target.id}/status`, { status: 'SUSPENDED', reason: 'Fraude au paiement' }).expect(201);
    expect((await c.client.get('/api/me/addresses')).status).toBe(401);
    await m.admin.post(`/api/admin/customers/${target.id}/status`, { status: 'ACTIVE', reason: 'Vérification faite' }).expect(201);
  });

  it('la performance des livreurs reflète leurs courses', async () => {
    const p = await m.admin.get('/api/admin/couriers/performance');
    expect(p.status).toBe(200);
    const best = p.body.find((c: { name: string }) => c.name === 'Livreur Avis');
    expect(best).toMatchObject({ delivered: 1, successRate: 100, earned: TEST.courierPay });
  });
});
