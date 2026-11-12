import { Types } from 'mongoose';
import { expect } from 'vitest';
import { Client, platformUser, registeredClient, TestEnv } from './helpers';

/* Valeurs de TEST uniquement. */
export const TEST = { customerFee: 1000, courierPay: 700, commissionBps: 1500, serviceFee: 200 };
const HOURS = { openingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: '00:00', closes: '23:59' })), closures: [] };

/** Prépare une plateforme configurée (géographie, frais, paramètres) et des fabriques de restaurants / clients. */
export async function marketplace(t: TestEnv) {
  const admin = (await platformUser(t.app, 'super_admin')).client;
  const city = await admin.post('/api/admin/geo/cities', { name: 'Cotonou' });
  const commune = await admin.post('/api/admin/geo/communes', { parentId: city.body.id, name: 'Cotonou' });
  const hood = (await admin.post('/api/admin/geo/neighborhoods', { parentId: commune.body.id, name: 'Cadjèhoun' })).body.id as string;
  const zone = (await admin.post('/api/admin/geo/zones', { name: 'Centre', neighborhoodIds: [hood] })).body.id as string;
  await admin.post('/api/admin/geo/fee-rules', { fromZoneId: zone, toZoneId: zone, customerFee: TEST.customerFee, courierPay: TEST.courierPay }).expect(201);
  const cuisine = (await admin.post('/api/admin/cuisines', { name: 'Africaine' })).body.id as string;
  await admin.put('/api/admin/settings/orders.service_fee_fcfa', { value: TEST.serviceFee }).expect(200);
  await admin.put('/api/admin/settings/orders.restaurant_response_minutes', { value: 10 }).expect(200);

  async function restaurant(name: string) {
    const owner = await registeredClient(t.app, `Propriétaire ${name}`);
    const rid = (await owner.client.post('/api/restaurant-applications', { name, phone: owner.phone, neighborhoodId: hood, address: 'Rue A', cuisineIds: [cuisine] })).body.id as string;
    await owner.client.put(`/api/restaurants/${rid}/hours`, HOURS).expect(200);
    await owner.client.post(`/api/restaurants/${rid}/profile/publish`).expect(201);
    await admin.post(`/api/admin/restaurants/${rid}/review`, { decision: 'approve' }).expect(201);
    await owner.client.put(`/api/restaurants/${rid}/zones`, { zoneIds: [zone] }).expect(200);
    await admin.put(`/api/admin/restaurants/${rid}/contract`, { commissionRateBps: TEST.commissionBps }).expect(200);
    await owner.client.patch(`/api/restaurants/${rid}/accepting-orders`, { acceptingOrders: true }).expect(200);
    const cat = await owner.client.post(`/api/restaurants/${rid}/menu/categories`, { name: 'Plats' });
    const p = await owner.client.post(`/api/restaurants/${rid}/menu/products`, { menuCategoryId: cat.body.id, name: 'Poulet braisé', basePrice: 3000 });
    await owner.client.post(`/api/restaurants/${rid}/menu/products/${p.body.id}/publish`).expect(201);
    return { rid, owner, productId: p.body.id as string, categoryId: cat.body.id as string };
  }

  async function employee(R: Awaited<ReturnType<typeof restaurant>>, roleCode: string) {
    const e = await registeredClient(t.app, `Employé ${roleCode}`);
    await R.owner.client.post(`/api/restaurants/${R.rid}/staff`, { phone: e.phone, roleCode }).expect(201);
    return e;
  }

  async function customer() {
    const c = await registeredClient(t.app, 'Client');
    const a = await c.client.post('/api/me/addresses', { label: 'Maison', neighborhoodId: hood, streetLandmark: 'Près du marché' });
    return { ...c, addressId: a.body.id as string };
  }

  async function order(c: Awaited<ReturnType<typeof customer>>, productId: string, qty = 1) {
    await c.client.post('/api/cart/items', { item: { productId, qty } }).expect(204);
    const q = await c.client.get(`/api/cart?addressId=${c.addressId}`);
    expect(q.body.blocking).toEqual([]);
    const r = await c.client.post('/api/orders', { addressId: c.addressId, paymentMethod: 'CASH', expectedTotal: q.body.total, idempotencyKey: `cle-${new Types.ObjectId().toHexString()}` });
    expect(r.status).toBe(201);
    return { orderId: r.body.orderId as string, quote: q.body };
  }

  return { admin, restaurant, employee, customer, order };
}

export type Market = Awaited<ReturnType<typeof marketplace>>;
export type { Client };

/** Livreur validé et en ligne, plus livraison complète d'une commande (scénario réel, sans raccourci). */
export async function delivery(t: TestEnv, m: Market) {
  const admin = m.admin;
  await admin.put('/api/admin/settings/couriers.cash_limit_fcfa', { value: 500_000 }).expect(200); // valeurs de test
  await admin.put('/api/admin/settings/couriers.offer_expiry_seconds', { value: 120 }).expect(200);
  const ops = await platformUser(t.app, 'operations_manager');

  async function courier(name: string) {
    const u = await registeredClient(t.app, name);
    const folder = `plateforme/test/users/${u.userId}/courier`;
    const r = await u.client.post('/api/courier/application', {
      vehicleType: 'MOTO', plate: 'AB 1234', payout: { provider: 'MTN_MOMO', number: u.phone },
      documents: [{ type: 'ID_CARD', publicId: `${folder}/cni` }, { type: 'DRIVING_LICENSE', publicId: `${folder}/permis` }],
    });
    expect(r.status).toBe(201);
    await admin.post(`/api/admin/couriers/${r.body.id}/review`, { decision: 'approve' }).expect(201);
    await u.client.post('/api/courier/online', { online: true }).expect(201);
    return { ...u, courierId: r.body.id as string };
  }

  async function deliver(R: { rid: string; owner: { client: Client } }, c: Awaited<ReturnType<Market['customer']>>, orderId: string, L: Awaited<ReturnType<typeof courier>>) {
    for (const s of ['accept', 'prepare', 'ready', 'request-courier']) await R.owner.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/${s}`).expect(201);
    await ops.client.post(`/api/ops/orders/${orderId}/assign`, { courierId: L.courierId }).expect(201);
    const active = await L.client.get('/api/courier/active');
    const did = active.body.id as string;
    for (const s of ['arrived-pickup', 'picked-up', 'arrived-dropoff']) await L.client.post(`/api/courier/deliveries/${did}/${s}`).expect(201);
    const code = (await c.client.get(`/api/orders/${orderId}`)).body.deliveryCode as string;
    await L.client.post(`/api/courier/deliveries/${did}/deliver`, { code }).expect(201);
    return (await c.client.get(`/api/orders/${orderId}`)).body as { total: number; status: string };
  }

  return { ops, courier, deliver };
}
