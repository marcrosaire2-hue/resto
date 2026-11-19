import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../src/common/env';
import { FinanceService } from '../src/modules/finance/finance.service';
import { delivery, marketplace, Market } from './fixtures';
import { db, platformUser, startApp, TestEnv } from './helpers';

/* Double de test de l'API FedaPay (transactions + versements) : uniquement dans les tests, jamais d'appel réel. */
const txs = new Map<number, { id: number; status: string; amount: number; merchant_reference: string }>();
const payoutsSeen = new Map<number, { id: number; status: string; amount: number; body: Record<string, unknown> }>();
const started: number[] = [];
let nextId = 5000;
let failCreate = false;
let fake: Server;

function startFake() {
  fake = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const send = (code: number, data: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      const url = req.url!;
      let m = url.match(/^\/transactions(?:\/(\d+))?(\/token)?$/);
      if (m) {
        if (req.method === 'POST' && !m[1]) {
          const b = JSON.parse(body);
          const tx = { id: ++nextId, status: 'pending', amount: b.amount, merchant_reference: b.merchant_reference };
          txs.set(tx.id, tx);
          return send(201, { 'v1/transaction': tx });
        }
        const tx = txs.get(Number(m[1]));
        if (!tx) return send(404, {});
        if (req.method === 'POST' && m[2]) return send(200, { token: `tok${tx.id}`, url: `https://checkout.test/pay/tok${tx.id}` });
        return send(200, { 'v1/transaction': tx });
      }
      if (url === '/payouts' && req.method === 'POST') {
        if (failCreate) return send(422, { message: 'Numéro invalide' });
        const b = JSON.parse(body);
        const p = { id: ++nextId, status: 'pending', amount: b.amount, body: b };
        payoutsSeen.set(p.id, p);
        return send(201, { 'v1/payout': { id: p.id, status: p.status, amount: p.amount } });
      }
      if (url === '/payouts/start' && req.method === 'PUT') {
        for (const { id } of JSON.parse(body).payouts as { id: number }[]) started.push(id);
        return send(200, {});
      }
      m = url.match(/^\/payouts\/(\d+)$/);
      if (m && req.method === 'GET') {
        const p = payoutsSeen.get(Number(m[1]));
        return p ? send(200, { 'v1/payout': { id: p.id, status: p.status, amount: p.amount } }) : send(404, {});
      }
      return send(404, {});
    });
  });
  return new Promise<string>((ok) => fake.listen(0, () => ok(`http://127.0.0.1:${(fake.address() as AddressInfo).port}`)));
}

let t: TestEnv;
let m: Market;
let D: Awaited<ReturnType<typeof delivery>>;
let finance: FinanceService;
let admin: Awaited<ReturnType<typeof platformUser>>;

beforeAll(async () => {
  const url = await startFake();
  t = await startApp({ FEDAPAY_SECRET_KEY: 'sk_sandbox_test', FEDAPAY_API_URL: url, AUTO_PAYOUTS: 'on' });
  m = await marketplace(t);
  D = await delivery(t, m);
  finance = t.app.get(FinanceService);
  admin = await platformUser(t.app, 'finance_agent');
});
afterAll(async () => {
  delete process.env.AUTO_PAYOUTS;
  resetEnvCache();
  await t?.close();
  fake?.close();
});

/** Commande Mobile Money payée (vérifiée côté serveur) puis livrée. */
async function deliveredMobileOrder(name: string) {
  const R = await m.restaurant(name);
  const c = await m.customer();
  await c.client.post('/api/cart/items', { item: { productId: R.productId, qty: 1 } }).expect(204);
  const q = await c.client.get(`/api/cart?addressId=${c.addressId}`);
  const r = await c.client.post('/api/orders', { addressId: c.addressId, paymentMethod: 'MOBILE_MONEY', expectedTotal: q.body.total, idempotencyKey: `cle-po-${Math.random().toString(36).slice(2)}` });
  expect(r.status).toBe(201);
  const orderId = r.body.orderId as string;
  await c.client.post(`/api/orders/${orderId}/payments`).expect(201);
  [...txs.values()].at(-1)!.status = 'approved';
  await c.client.post(`/api/orders/${orderId}/payments/refresh`).expect(201);
  const L = await D.courier(`Livreur ${name}`);
  await D.deliver(R, c, orderId, L);
  const order = await db(t).collection('orders').findOne({ _id: new Types.ObjectId(orderId) });
  return { R, c, orderId, net: order!.finance.restaurantNet as number };
}

const payoutOf = (orderId: string) => db(t).collection('payouts').findOne({ orderId: new Types.ObjectId(orderId), source: 'AUTO' });

describe('Numéro de réception des versements (espace restaurant)', () => {
  it('le propriétaire le définit, il est masqué, journalisé, et refusé aux autres', async () => {
    const R = await m.restaurant('Resto Numéro');
    const set = await R.owner.client.put(`/api/restaurants/${R.rid}/payout-account`, { provider: 'MTN_MOMO', number: '0197000123' });
    expect(set.status).toBe(200);
    expect(set.body.account.provider).toBe('MTN_MOMO');
    expect(JSON.stringify(set.body)).not.toContain('0197000123'); // jamais renvoyé en clair
    expect((await R.owner.client.get(`/api/restaurants/${R.rid}/payout-account`)).body.account.numberMasked).toMatch(/•/);
    const bad = await R.owner.client.put(`/api/restaurants/${R.rid}/payout-account`, { provider: 'MTN_MOMO', number: '12' });
    expect(bad.status).toBe(400);
    const stranger = await m.customer();
    expect([401, 403, 404]).toContain((await stranger.client.put(`/api/restaurants/${R.rid}/payout-account`, { provider: 'MOOV_MONEY', number: '0197000456' })).status);
    const log = await db(t).collection('audit_logs').findOne({ action: 'restaurant.payout_account_set', entityId: R.rid });
    expect(log).toBeTruthy();
    expect(JSON.stringify(log)).not.toContain('0197000123');
  });
});

describe('Virement automatique après livraison (FedaPay Payouts)', () => {
  it('vire la part du restaurant sur son numéro, une seule fois, et solde le grand livre', async () => {
    const o = await deliveredMobileOrder('Resto Virement');
    await o.R.owner.client.put(`/api/restaurants/${o.R.rid}/payout-account`, { provider: 'MTN_MOMO', number: '0197000789' }).expect(200);

    const first = await finance.autoPayoutSweep();
    expect(first).toMatchObject({ enabled: true, created: 1 });
    const p = await payoutOf(o.orderId);
    expect(p).toMatchObject({ status: 'PROCESSING', amount: o.net, source: 'AUTO' });
    expect(p!.providerPayoutId).toBeTruthy();
    const sent = payoutsSeen.get(p!.providerPayoutId as number)!;
    expect(sent.amount).toBe(o.net);
    expect(sent.body).toMatchObject({ mode: 'mtn_open', currency: { iso: 'XOF' } });
    expect(JSON.stringify(sent.body)).toContain('0197000789');
    expect(started).toContain(p!.providerPayoutId);

    // Tant que FedaPay n'a pas confirmé l'envoi : rien n'est comptabilisé.
    expect((await finance.autoPayoutSweep()).settled).toBe(0);
    expect(await db(t).collection('ledger_transactions').findOne({ type: 'payout.paid', reference: String(p!._id) })).toBeNull();

    sent.status = 'sent';
    expect((await finance.autoPayoutSweep()).settled).toBe(1);
    expect(await payoutOf(o.orderId)).toMatchObject({ status: 'PAID', reference: `fedapay:${p!.providerPayoutId}` });
    const entry = await db(t).collection('ledger_transactions').findOne({ type: 'payout.paid', reference: String(p!._id) });
    expect(entry!.entries).toEqual(expect.arrayContaining([expect.objectContaining({ account: `payable:restaurant:${o.R.rid}`, debit: o.net })]));
    expect(JSON.stringify((await o.R.owner.client.get('/api/notifications')).body)).toMatch(/Versement effectué/);

    // Idempotence : aucun second virement pour la même commande.
    expect((await finance.autoPayoutSweep()).created).toBe(0);
    expect(await db(t).collection('payouts').countDocuments({ orderId: new Types.ObjectId(o.orderId) })).toBe(1);
  });

  it('sans numéro défini, rien n’est viré ; dès qu’il est enregistré, le virement part', async () => {
    const o = await deliveredMobileOrder('Resto Sans Numéro');
    expect((await finance.autoPayoutSweep()).created).toBe(0);
    expect(await payoutOf(o.orderId)).toBeNull();
    await o.R.owner.client.put(`/api/restaurants/${o.R.rid}/payout-account`, { provider: 'MOOV_MONEY', number: '0197000321' }).expect(200);
    expect((await finance.autoPayoutSweep()).created).toBe(1);
    expect(payoutsSeen.get((await payoutOf(o.orderId))!.providerPayoutId as number)!.body).toMatchObject({ mode: 'moov' });
  });

  it('un échec chez FedaPay est visible, notifié, et le versement peut être relancé', async () => {
    const o = await deliveredMobileOrder('Resto Échec');
    await o.R.owner.client.put(`/api/restaurants/${o.R.rid}/payout-account`, { provider: 'MTN_MOMO', number: '0197000654' }).expect(200);
    failCreate = true;
    await finance.autoPayoutSweep();
    failCreate = false;
    const failed = await payoutOf(o.orderId);
    expect(failed).toMatchObject({ status: 'FAILED' });
    expect(failed!.lastError).toBeTruthy();
    // L'argent reste dû au restaurant (aucune écriture « payé »).
    expect(await db(t).collection('ledger_transactions').findOne({ type: 'payout.paid', reference: String(failed!._id) })).toBeNull();

    const retry = await admin.client.post(`/api/finance/payouts/${failed!._id}/retry`);
    expect(retry.status).toBe(201);
    expect(retry.body.status).toBe('PROCESSING');
    expect((await payoutOf(o.orderId))!.providerPayoutId).toBeTruthy();
  });

  it('désactivé tant que AUTO_PAYOUTS n’est pas « on »', async () => {
    const o = await deliveredMobileOrder('Resto Désactivé');
    await o.R.owner.client.put(`/api/restaurants/${o.R.rid}/payout-account`, { provider: 'MTN_MOMO', number: '0197000987' }).expect(200);
    process.env.AUTO_PAYOUTS = 'off';
    resetEnvCache();
    try {
      expect(await finance.autoPayoutSweep()).toMatchObject({ enabled: false, created: 0 });
      expect(await payoutOf(o.orderId)).toBeNull();
    } finally {
      process.env.AUTO_PAYOUTS = 'on';
      resetEnvCache();
    }
  });
});
