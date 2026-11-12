import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { delivery, marketplace, Market, TEST } from './fixtures';
import { db, platformUser, startApp, TestEnv } from './helpers';

let t: TestEnv;
let m: Market;
let D: Awaited<ReturnType<typeof delivery>>;
let fin1: Awaited<ReturnType<typeof platformUser>>;
let fin2: Awaited<ReturnType<typeof platformUser>>;
let R: Awaited<ReturnType<Market['restaurant']>>;
let L: Awaited<ReturnType<typeof D.courier>>;
let orderId: string;
let total: number;

const binary = (res: import('superagent').Response, cb: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

beforeAll(async () => {
  t = await startApp();
  m = await marketplace(t);
  D = await delivery(t, m);
  fin1 = await platformUser(t.app, 'finance_agent');
  fin2 = await platformUser(t.app, 'finance_agent');
  R = await m.restaurant('Resto Finances');
  L = await D.courier('Livreur Finances');
  const c = await m.customer();
  ({ orderId } = await m.order(c, R.productId, 2));
  total = (await D.deliver(R, c, orderId, L)).total;
});
afterAll(async () => {
  await t?.close();
});

describe('Vue financière (grand livre)', () => {
  it('les soldes proviennent des écritures de la commande livrée', async () => {
    const ov = await fin1.client.get('/api/finance/overview');
    expect(ov.status).toBe(200);
    const commission = Math.round((6000 * TEST.commissionBps) / 10_000);
    expect(ov.body.revenue.commission).toBe(commission);
    expect(ov.body.cashHeldByCouriers).toBe(total);
    expect(ov.body.owedToRestaurants).toBe(6000 - commission);
    expect(ov.body.owedToCouriers).toBe(TEST.courierPay);
    const bal = await fin1.client.get('/api/finance/balances');
    expect(bal.body.restaurants.find((r: { id: string }) => r.id === R.rid)).toMatchObject({ name: 'Resto Finances', balance: 6000 - commission });
    expect(bal.body.couriers.find((c: { id: string }) => c.id === L.courierId)).toMatchObject({ cashHeld: total, balance: TEST.courierPay });
  });

  it('un client ou un agent support ne voit pas les finances', async () => {
    const support = await platformUser(t.app, 'support_agent');
    expect((await support.client.get('/api/finance/overview')).status).toBe(403);
    expect((await R.owner.client.get('/api/finance/overview')).status).toBe(403);
  });
});

describe('Reversement des espèces par le livreur', () => {
  it('refuse un montant supérieur aux espèces détenues, puis émet un reçu', async () => {
    expect((await fin1.client.post(`/api/finance/couriers/${L.courierId}/remittances`, { amount: total + 1 })).status).toBe(422);
    const r = await fin1.client.post(`/api/finance/couriers/${L.courierId}/remittances`, { amount: total - 500, note: 'Dépôt agence' });
    expect(r.status).toBe(201);
    expect(r.body.receiptNumber).toMatch(/^REC-\d{6}-/);
    const bal = await fin1.client.get('/api/finance/balances');
    expect(bal.body.couriers.find((c: { id: string }) => c.id === L.courierId).cashHeld).toBe(500);
    expect((await L.client.get('/api/courier/earnings')).body.cashHeld).toBe(500);
    expect((await fin1.client.get(`/api/finance/remittances?courierId=${L.courierId}`)).body).toHaveLength(1);
  });
});

describe('Versements avec double validation', () => {
  it('demande ≤ solde disponible ; le demandeur ne peut pas approuver ; exécution avec référence', async () => {
    const owed = (await fin1.client.get('/api/finance/balances')).body.restaurants.find((r: { id: string }) => r.id === R.rid).balance as number;
    expect((await fin1.client.post('/api/finance/payouts', { beneficiaryType: 'RESTAURANT', beneficiaryId: R.rid, amount: owed + 1, method: 'MTN_MOMO' })).status).toBe(422);
    const p = await fin1.client.post('/api/finance/payouts', { beneficiaryType: 'RESTAURANT', beneficiaryId: R.rid, amount: owed - 100, method: 'MTN_MOMO' });
    expect(p.status).toBe(201);
    // Le montant est réservé : une seconde demande dépassant le reste est refusée.
    expect((await fin1.client.post('/api/finance/payouts', { beneficiaryType: 'RESTAURANT', beneficiaryId: R.rid, amount: 200, method: 'MTN_MOMO' })).status).toBe(422);

    expect((await fin1.client.post(`/api/finance/payouts/${p.body.id}/execute`, { reference: 'MOMO-123' })).status).toBe(422); // pas encore approuvé
    const self = await fin1.client.post(`/api/finance/payouts/${p.body.id}/approve`);
    expect(self.status).toBe(403);
    expect(self.body.error).toBe('SAME_PERSON');
    await fin2.client.post(`/api/finance/payouts/${p.body.id}/approve`).expect(201);
    await fin1.client.post(`/api/finance/payouts/${p.body.id}/execute`, { reference: 'MOMO-123' }).expect(201);
    expect((await fin1.client.post(`/api/finance/payouts/${p.body.id}/execute`, { reference: 'MOMO-123' })).status).toBe(422); // pas de double paiement

    const bal = (await fin1.client.get('/api/finance/balances')).body.restaurants.find((r: { id: string }) => r.id === R.rid);
    expect(bal).toMatchObject({ balance: 100, paid: owed - 100, pendingPayouts: 0 });
    const tx = await db(t).collection('ledger_transactions').findOne({ type: 'payout.paid', reference: p.body.id });
    expect(tx!.entries).toEqual(expect.arrayContaining([expect.objectContaining({ account: `payable:restaurant:${R.rid}`, debit: owed - 100 })]));
  });

  it('les écritures du grand livre ne peuvent pas être modifiées', async () => {
    const col = db(t).model('LedgerTransaction');
    await expect(col.updateOne({ type: 'payout.paid' }, { $set: { description: 'x' } })).rejects.toThrow();
  });
});

describe('Remboursements', () => {
  it('vérifie le paiement initial, plafonne le montant et exige deux approbateurs sans seuil configuré', async () => {
    const c = await m.customer();
    const { orderId: pending } = await m.order(c, R.productId);
    const r0 = await fin1.client.post('/api/finance/refunds', { orderId: pending, amount: 500, reason: 'Test non payé', borneBy: 'PLATFORM' });
    expect(r0.status).toBe(422); // commande non payée
    expect((await fin1.client.post('/api/finance/refunds', { orderId, amount: total + 1, reason: 'Trop', borneBy: 'PLATFORM' })).status).toBe(422);

    const r = await fin1.client.post('/api/finance/refunds', { orderId, amount: 1000, reason: 'Plat manquant', borneBy: 'RESTAURANT' });
    expect(r.status).toBe(201);
    expect(r.body.requiredApprovals).toBe(2);
    expect((await fin1.client.post(`/api/finance/refunds/${r.body.id}/approve`)).status).toBe(403); // demandeur
    await fin2.client.post(`/api/finance/refunds/${r.body.id}/approve`).expect(201);
    expect((await fin2.client.post(`/api/finance/refunds/${r.body.id}/approve`)).status).toBe(409); // pas deux fois
    expect((await fin1.client.post(`/api/finance/refunds/${r.body.id}/pay`, { method: 'MTN_MOMO', reference: 'RB-1' })).status).toBe(422); // une approbation manque
    const fin3 = await platformUser(t.app, 'finance_agent');
    await fin3.client.post(`/api/finance/refunds/${r.body.id}/approve`).expect(201);
    await fin1.client.post(`/api/finance/refunds/${r.body.id}/pay`, { method: 'MTN_MOMO', reference: 'RB-1' }).expect(201);
    const tx = await db(t).collection('ledger_transactions').findOne({ type: 'refund.paid', reference: r.body.id });
    expect(tx!.entries).toEqual(expect.arrayContaining([expect.objectContaining({ account: `payable:restaurant:${R.rid}`, debit: 1000 })]));
  });

  it('sous le seuil configuré, une seule approbation suffit', async () => {
    await m.admin.put('/api/admin/settings/finance.refund_double_approval_threshold_fcfa', { value: 5000 }).expect(200);
    const r = await fin1.client.post('/api/finance/refunds', { orderId, amount: 300, reason: 'Geste commercial', borneBy: 'PLATFORM' });
    expect(r.body.requiredApprovals).toBe(1);
    await fin2.client.post(`/api/finance/refunds/${r.body.id}/approve`).expect(201);
    await fin2.client.post(`/api/finance/refunds/${r.body.id}/pay`, { method: 'CASH', reference: 'RB-2' }).expect(201);
    expect((await m.admin.get('/api/finance/overview')).body.expenses.refunds).toBe(300);
  });
});

describe('Rapports et relevé du restaurant', () => {
  it('exporte le rapport en Excel et en PDF', async () => {
    const x = await fin1.client.get('/api/finance/reports?format=xlsx').buffer(true).parse(binary);
    expect(x.status).toBe(200);
    expect(x.headers['content-type']).toMatch(/spreadsheetml/);
    expect((x.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const p = await fin1.client.get('/api/finance/reports?format=pdf').buffer(true).parse(binary);
    expect((p.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const j = await fin1.client.get('/api/finance/reports');
    expect(j.body.totals).toMatchObject({ orders: 1, gross: 6000 });
  });

  it('le restaurant voit son propre relevé, jamais celui d’un autre', async () => {
    const s = await R.owner.client.get(`/api/restaurants/${R.rid}/finance`);
    expect(s.status).toBe(200);
    expect(s.body).toMatchObject({ orders: 1, grossSales: 6000 });
    const other = await m.restaurant('Autre Resto Finances');
    expect((await other.owner.client.get(`/api/restaurants/${R.rid}/finance`)).status).toBe(404);
    const ex = await R.owner.client.get(`/api/restaurants/${R.rid}/finance/export?format=xlsx`).buffer(true).parse(binary);
    expect(ex.status).toBe(200);
  });
});
