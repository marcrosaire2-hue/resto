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
