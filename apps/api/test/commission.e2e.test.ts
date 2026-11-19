import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FinanceService } from '../src/modules/finance/finance.service';
import { delivery, marketplace, Market } from './fixtures';
import { db, startApp, TestEnv } from './helpers';

let t: TestEnv;
let m: Market;
let D: Awaited<ReturnType<typeof delivery>>;

beforeAll(async () => {
  t = await startApp();
  m = await marketplace(t);
  D = await delivery(t, m);
});
afterAll(async () => { await t?.close(); });

const contractsOf = async (rid: string) => (await m.admin.get(`/api/admin/restaurants/${rid}/contract`)).body as { commissionRateBps: number; validFrom: string; validTo: string | null; reference: string }[];
const notifTexts = async (owner: { client: { get: (u: string) => Promise<{ body: unknown }> } }) => JSON.stringify((await owner.client.get('/api/notifications')).body);

describe('Mois gratuit puis commission standard', () => {
  it('sans réglage configuré, aucun contrat automatique : le restaurant est bloqué tant qu’un contrat n’est pas saisi', async () => {
    const R = await m.restaurant('Resto Sans Réglage', { manualContract: false });
    expect(await contractsOf(R.rid)).toEqual([]);
    const c = await m.customer();
    await c.client.post('/api/cart/items', { item: { productId: R.productId, qty: 1 } }).expect(204);
    const q = await c.client.get(`/api/cart?addressId=${c.addressId}`);
    expect(q.body.blocking.map((b: { code: string }) => b.code)).toContain('RESTAURANT_NOT_CONFIGURED');
  });

  it('à la validation : 0 % pendant le mois gratuit, puis 15 % ; le propriétaire est prévenu ; la commission suit le calendrier', async () => {
    await m.admin.put('/api/admin/settings/commission.standard_bps', { value: 1500 }).expect(200);
    await m.admin.put('/api/admin/settings/commission.free_months', { value: 1 }).expect(200);
    const R = await m.restaurant('Resto Mois Gratuit', { manualContract: false });

    const list = await contractsOf(R.rid);
    expect(list).toHaveLength(2);
    const free = list.find((c) => c.commissionRateBps === 0)!;
    const std = list.find((c) => c.commissionRateBps === 1500)!;
    expect(new Date(std.validFrom).getTime()).toBe(new Date(free.validTo!).getTime()); // le taux standard démarre à la fin du mois gratuit
    expect(std.validTo).toBeNull();
    expect(await notifTexts(R.owner)).toMatch(/premier mois est gratuit/);

    // Pendant le mois gratuit : aucune commission, le restaurant reçoit tout.
    const c1 = await m.customer();
    const o1 = await m.order(c1, R.productId);
    const free1 = (await db(t).collection('orders').findOne({ _id: new Types.ObjectId(o1.orderId) }))!.finance;
    expect(free1).toMatchObject({ commissionRateBps: 0, commissionAmount: 0 });
    const L = await D.courier('Livreur Mois Gratuit');
    await D.deliver(R, c1, o1.orderId, L);
    expect(await notifTexts(R.owner)).toMatch(/aucune commission \(période gratuite\)/);

    // Le mois gratuit est écoulé (on recule les dates de 31 jours) : 15 % retenus, le reste est dû au restaurant.
    const back = (d: string) => new Date(new Date(d).getTime() - 31 * 86_400_000);
    await db(t).collection('restaurant_contracts').updateOne({ restaurantId: new Types.ObjectId(R.rid), commissionRateBps: 0 }, { $set: { validFrom: back(free.validFrom), validTo: back(free.validTo!) } });
    await db(t).collection('restaurant_contracts').updateOne({ restaurantId: new Types.ObjectId(R.rid), commissionRateBps: 1500 }, { $set: { validFrom: back(std.validFrom) } });
    const c2 = await m.customer();
    const o2 = await m.order(c2, R.productId);
    const std2 = (await db(t).collection('orders').findOne({ _id: new Types.ObjectId(o2.orderId) }))!.finance;
    expect(std2.commissionRateBps).toBe(1500);
    expect(std2.commissionAmount).toBeGreaterThan(0);
    expect(std2.restaurantNet).toBeLessThan(free1.restaurantNet + 1); // moins que sans commission
    const L2 = await D.courier('Livreur Après Gratuit');
    await D.deliver(R, c2, o2.orderId, L2);
    expect(await notifTexts(R.owner)).toMatch(/commission \d+ FCFA \(15 %\)/);

    // Rappel de fin de mois gratuit (passé) : prévenu une seule fois, avec le taux qui s'applique.
    const finance = t.app.get(FinanceService);
    expect((await finance.contractNotices()).ended).toBeGreaterThanOrEqual(1);
    expect(await notifTexts(R.owner)).toMatch(/mois gratuit est terminé/);
    await finance.contractNotices();
    const count = (await notifTexts(R.owner)).match(/Votre mois gratuit est terminé/g)?.length ?? 0;
    expect(count).toBe(1);
  });

  it('rappel 7 jours avant la fin du mois gratuit', async () => {
    const R = await m.restaurant('Resto Bientôt Fini', { manualContract: false });
    const soon = new Date(Date.now() + 3 * 86_400_000);
    await db(t).collection('restaurant_contracts').updateOne({ restaurantId: new Types.ObjectId(R.rid), commissionRateBps: 0 }, { $set: { validTo: soon } });
    await db(t).collection('restaurant_contracts').updateOne({ restaurantId: new Types.ObjectId(R.rid), commissionRateBps: 1500 }, { $set: { validFrom: soon } });
    await t.app.get(FinanceService).contractNotices();
    expect(await notifTexts(R.owner)).toMatch(/Votre mois gratuit se termine bientôt/);
  });

  it('un contrat saisi à la main remplace le plan automatique (le mois gratuit ne s’applique plus)', async () => {
    const R = await m.restaurant('Resto Contrat Manuel', { manualContract: false });
    await m.admin.put(`/api/admin/restaurants/${R.rid}/contract`, { commissionRateBps: 1000 }).expect(200);
    const c = await m.customer();
    const o = await m.order(c, R.productId);
    expect((await db(t).collection('orders').findOne({ _id: new Types.ObjectId(o.orderId) }))!.finance).toMatchObject({ commissionRateBps: 1000 });
    const notices = await t.app.get(FinanceService).contractNotices();
    expect(JSON.stringify(notices)).toBeTruthy(); // aucun faux rappel « mois gratuit terminé » pour ce restaurant
    expect(await notifTexts(R.owner)).not.toMatch(/mois gratuit est terminé/);
  });
});
