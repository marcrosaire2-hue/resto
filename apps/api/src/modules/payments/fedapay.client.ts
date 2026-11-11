import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { env } from '../../common/env';

export type FedapayStatus = 'pending' | 'approved' | 'declined' | 'canceled' | 'refunded' | 'transferred' | 'expired' | string;
export interface FedapayTransaction { id: number; status: FedapayStatus; amount: number; currency_id?: number; currency?: { iso?: string }; merchant_reference?: string | null }

/**
 * Client HTTP minimal de l'API FedaPay (https://docs.fedapay.com).
 * La clé secrète ne quitte jamais le serveur. Aucune réponse n'est inventée : toute erreur remonte.
 */
@Injectable()
export class FedapayClient {
  private readonly logger = new Logger('FedaPay');

  enabled() {
    return !!env().FEDAPAY_SECRET_KEY;
  }

  private base() {
    const e = env();
    return e.FEDAPAY_API_URL ?? (e.FEDAPAY_ENV === 'live' ? 'https://api.fedapay.com/v1' : 'https://sandbox-api.fedapay.com/v1');
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const key = env().FEDAPAY_SECRET_KEY;
    if (!key) throw new ServiceUnavailableException({ statusCode: 503, error: 'PAYMENT_UNAVAILABLE', message: 'Le paiement Mobile Money n’est pas disponible pour le moment.' });
    const res = await fetch(`${this.base()}${path}`, {
      method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException({ statusCode: 503, error: 'PAYMENT_PROVIDER_ERROR', message: 'Le service de paiement ne répond pas correctement. Réessayez dans un instant.' });
    }
    return JSON.parse(text) as T;
  }

  private static unwrap(r: Record<string, unknown>): FedapayTransaction {
    const t = (r['v1/transaction'] ?? r.transaction ?? r) as FedapayTransaction;
    if (!t || typeof t.id !== 'number') throw new Error('Réponse FedaPay inattendue');
    return t;
  }

  async createTransaction(input: { amount: number; description: string; callbackUrl: string; merchantReference: string; customer: { firstname: string; lastname: string; phone: string } }) {
    const r = await this.call<Record<string, unknown>>('POST', '/transactions', {
      description: input.description, amount: input.amount, currency: { iso: 'XOF' }, callback_url: input.callbackUrl,
      merchant_reference: input.merchantReference,
      customer: { firstname: input.customer.firstname, lastname: input.customer.lastname, phone_number: { number: input.customer.phone, country: 'bj' } },
    });
    return FedapayClient.unwrap(r);
  }

  async token(transactionId: number) {
    const r = await this.call<{ token: string; url: string }>('POST', `/transactions/${transactionId}/token`);
    if (!r.url) throw new Error('Lien de paiement FedaPay absent');
    return r;
  }

  async retrieve(transactionId: number) {
    return FedapayClient.unwrap(await this.call<Record<string, unknown>>('GET', `/transactions/${transactionId}`));
  }

  /**
   * Vérifie l'en-tête X-FEDAPAY-SIGNATURE (« t=<horodatage>,s=<hmac> », HMAC-SHA256 de « t.corps »).
   * Tolérance de 5 minutes contre le rejeu.
   */
  verifySignature(rawBody: Buffer, header: string | undefined, now = Date.now()) {
    const secret = env().FEDAPAY_WEBHOOK_SECRET;
    if (!secret || !header) return false;
    const parts = Object.fromEntries(header.split(',').map((p) => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
    const t = Number(parts.t);
    if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300 || !parts.s) return false;
    const expected = createHmac('sha256', secret).update(`${t}.${rawBody.toString('utf8')}`).digest('hex');
    const a = Buffer.from(expected); const b = Buffer.from(parts.s);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
