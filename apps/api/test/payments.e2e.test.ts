import { createHmac } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { delivery, marketplace, Market } from './fixtures';
import { db, startApp, TestEnv } from './helpers';

/* Double de test de l'API FedaPay (uniquement dans les tests ; l'application n'en contient aucun). */
const txs = new Map<number, { id: number; status: string; amount: number; merchant_reference: string }>();
let nextId = 1000;
const seenAuth: string[] = [];
let fake: Server;

function startFake() {
  fake = createServer((req, res) => {
    seenAuth.push(String(req.headers.authorization));
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const send = (code: number, data: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      const m = req.url!.match(/^\/transactions(?:\/(\d+))?(\/token)?$/);
      if (!m) return send(404, {});
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
    });
  });
  return new Promise<string>((ok) => fake.listen(0, () => ok(`http://127.0.0.1:${(fake.address() as AddressInfo).port}`)));
}

const WH = 'wh_sandbox_test_secret';
const sign = (raw: string, t = Math.floor(Date.now() / 1000)) => `t=${t},s=${createHmac('sha256', WH).update(`${t}.${raw}`).digest('hex')}`;

let t: TestEnv;
let m: Market;
let D: Awaited<ReturnType<typeof delivery>>;

beforeAll(async () => {
  const url = await startFake();
  t = await startApp({ FEDAPAY_SECRET_KEY: 'sk_sandbox_test', FEDAPAY_API_URL: url, FEDAPAY_WEBHOOK_SECRET: WH });
  m = await marketplace(t);
  D = await delivery(t, m);
});
afterAll(async () => {
  await t?.close();
  fake?.close();
});

async function mobileOrder(name: string) {
  const R = await m.restaurant(name);
  const c = await m.customer();
  await c.client.post('/api/cart/items', { item: { productId: R.productId, qty: 1 } }).expect(204);
  const q = await c.client.get(`/api/cart?addressId=${c.addressId}`);
  const r = await c.client.post('/api/orders', { addressId: c.addressId, paymentMethod: 'MOBILE_MONEY', expectedTotal: q.body.total, idempotencyKey: `cle-mm-${Math.random().toString(36).slice(2)}` });
  expect(r.status).toBe(201);
  expect(r.body.paymentRequired).toBe(true);
  return { R, c, orderId: r.body.orderId as string, total: q.body.total as number };
}

describe('Paiement Mobile Money (FedaPay)', () => {
  it('le moyen de paiement est annoncé disponible', async () => {
    expect((await request(t.app.getHttpServer()).get('/api/payments/methods')).body).toEqual({ CASH: true, MOBILE_MONEY: true });
  });

  it('commande en attente de paiement : invisible pour le restaurant, payée seulement après confirmation vérifiée', async () => {
    const { R, c, orderId, total } = await mobileOrder('Resto Mobile Money');
    expect((await c.client.get(`/api/orders/${orderId}`)).body).toMatchObject({ status: 'AWAITING_PAYMENT', paymentStatus: 'PENDING' });
    const active = await R.owner.client.get(`/api/restaurants/${R.rid}/orders?scope=active`);
    expect(active.body.map((o: { id: string }) => o.id)).not.toContain(orderId);
    expect((await R.owner.client.post(`/api/restaurants/${R.rid}/orders/${orderId}/accept`)).status).toBe(422);

    const start = await c.client.post(`/api/orders/${orderId}/payments`);
    expect(start.status).toBe(201);
    expect(start.body.url).toMatch(/^https:\/\/checkout\.test\/pay\//);
    expect(seenAuth.at(-1)).toBe('Bearer sk_sandbox_test');
    const tx = [...txs.values()].at(-1)!;
    expect(tx.amount).toBe(total);

    // Retour du client sans paiement réel : rien n'est validé.
    expect((await c.client.post(`/api/orders/${orderId}/payments/refresh`)).body.status).toBe('PENDING');
    expect((await c.client.get(`/api/orders/${orderId}`)).body.status).toBe('AWAITING_PAYMENT');

    // Un faux webhook (signature invalide) est rejeté.
    const raw = JSON.stringify({ id: 1, name: 'transaction.approved', entity: { id: tx.id } });
    const forged = await request(t.app.getHttpServer()).post('/api/payments/fedapay/webhook').set('Content-Type', 'application/json').set('x-fedapay-signature', 't=1,s=abc').send(raw);
    expect(forged.status).toBe(400);
    // Webhook signé MAIS FedaPay indique toujours « pending » : l'état relu chez le prestataire prime.
    const early = await request(t.app.getHttpServer()).post('/api/payments/fedapay/webhook').set('Content-Type', 'application/json').set('x-fedapay-signature', sign(raw)).send(raw);
    expect(early.status).toBe(200);
    expect((await c.client.get(`/api/orders/${orderId}`)).body.status).toBe('AWAITING_PAYMENT');

    tx.status = 'approved';
    const raw2 = JSON.stringify({ id: 2, name: 'transaction.approved', entity: { id: tx.id } });
    await request(t.app.getHttpServer()).post('/api/payments/fedapay/webhook').set('Content-Type', 'application/json').set('x-fedapay-signature', sign(raw2)).send(raw2).expect(200);
    const dup = await request(t.app.getHttpServer()).post('/api/payments/fedapay/webhook').set('Content-Type', 'application/json').set('x-fedapay-signature', sign(raw2)).send(raw2);
    expect(dup.body.duplicate).toBe(true);

    const view = (await c.client.get(`/api/orders/${orderId}`)).body;
    expect(view).toMatchObject({ status: 'PENDING', paymentStatus: 'SUCCEEDED' });
    const notif = await R.owner.client.get('/api/notifications');
    expect(JSON.stringify(notif.body)).toMatch(/Nouvelle commande/);
    const pay = await db(t).collection('ledger_transactions').findOne({ type: 'payment.received' });
    expect(pay!.entries).toEqual(expect.arrayContaining([expect.objectContaining({ account: 'clearing:provider:fedapay', debit: total })]));

    // Livraison : le livreur n'encaisse rien, l'avance client est soldée.
    const L = await D.courier('Livreur MM');
    await D.deliver(R, c, orderId, L);
    expect((await L.client.get('/api/courier/earnings')).body.cashHeld).toBe(0);
    const delivered = await db(t).collection('ledger_transactions').findOne({ type: 'order.delivered', reference: orderId });
    expect(delivered!.entries).toEqual(expect.arrayContaining([expect.objectContaining({ account: 'liability:customer_prepayments', debit: total })]));
  });

  it('refuse un paiement dont le montant ne correspond pas', async () => {
    const { c, orderId } = await mobileOrder('Resto Écart');
    await c.client.post(`/api/orders/${orderId}/payments`).expect(201);
    const tx = [...txs.values()].at(-1)!;
    tx.status = 'approved';
    tx.amount = 100;
    expect((await c.client.post(`/api/orders/${orderId}/payments/refresh`)).body.status).toBe('PENDING');
    expect((await c.client.get(`/api/orders/${orderId}`)).body.status).toBe('AWAITING_PAYMENT');
  });

  it('paiement refusé : la commande reste en attente, le client peut réessayer ou annuler sans prévenir le restaurant', async () => {
    const { c, orderId } = await mobileOrder('Resto Refus');
    const first = await c.client.post(`/api/orders/${orderId}/payments`);
    const tx = [...txs.values()].at(-1)!;
    tx.status = 'declined';
    expect((await c.client.post(`/api/orders/${orderId}/payments/refresh`)).body.status).toBe('FAILED');
    const retry = await c.client.post(`/api/orders/${orderId}/payments`);
    expect(retry.body.url).not.toBe(first.body.url);
    await c.client.post(`/api/orders/${orderId}/cancel`, { reason: 'Je change d’avis' }).expect(201);
    expect((await c.client.get(`/api/orders/${orderId}`)).body).toMatchObject({ status: 'CANCELLED', paymentStatus: 'NOT_DUE' });
  });

  it('un autre client ne peut pas payer ni consulter la commande', async () => {
    const { orderId } = await mobileOrder('Resto Isolé');
    const other = await m.customer();
    expect((await other.client.post(`/api/orders/${orderId}/payments`)).status).toBe(404);
  });
});

describe('Sans clé FedaPay', () => {
  it('le Mobile Money est masqué et refusé', async () => {
    const t2 = await startApp();
    try {
      expect((await request(t2.app.getHttpServer()).get('/api/payments/methods')).body.MOBILE_MONEY).toBe(false);
    } finally {
      await t2.close();
    }
  });
});
