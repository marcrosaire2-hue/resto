import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { LedgerTransaction } from './ledger.schema';

export interface OrderForLedger {
  _id: Types.ObjectId; restaurantId: Types.ObjectId; number: string; paymentMethod: string; courierId?: Types.ObjectId | null;
  amounts: { total: number; platformDiscount: number; deliveryFee: number; serviceFee: number };
  finance: { commissionAmount: number; restaurantNet: number; courierPay: number };
}

/** Grand livre (docs/05). Les soldes se calculent à partir des écritures, jamais de compteurs modifiables. */
@Injectable()
export class LedgerService {
  constructor(@InjectModel(LedgerTransaction.name) private readonly model: Model<LedgerTransaction>) {}

  /** Écritures à la livraison d'une commande (espèces : encaissées par le livreur). Idempotent. */
  async postOrderDelivered(o: OrderForLedger, session?: ClientSession) {
    if (await this.model.exists({ type: 'order.delivered', reference: String(o._id) }).session(session ?? null)) return;
    // Espèces : encaissées par le livreur. Paiement en ligne : déjà reçu (payment.received), on solde l'avance client.
    const cashAccount = o.paymentMethod === 'CASH' ? `clearing:cash:${o.courierId ?? 'inconnu'}` : 'liability:customer_prepayments';
    const rid = String(o.restaurantId);
    const entries = [
      { account: cashAccount, debit: o.amounts.total, credit: 0 },
      { account: 'expense:platform_promotions', debit: o.amounts.platformDiscount, credit: 0 },
      { account: `payable:restaurant:${rid}`, debit: 0, credit: o.finance.restaurantNet },
      { account: 'revenue:commission', debit: 0, credit: o.finance.commissionAmount },
      { account: `payable:courier:${o.courierId ?? 'inconnu'}`, debit: 0, credit: o.finance.courierPay },
      { account: 'revenue:delivery', debit: 0, credit: o.amounts.deliveryFee - o.finance.courierPay },
      { account: 'revenue:service', debit: 0, credit: o.amounts.serviceFee },
    ]
      // une marge de livraison négative (livraison subventionnée) passe au débit d'une charge
      .flatMap((e) => (e.account === 'revenue:delivery' && e.credit < 0 ? [{ account: 'expense:delivery_subsidy', debit: -e.credit, credit: 0 }] : [e]))
      .filter((e) => e.debit > 0 || e.credit > 0);
    await this.model.create([{ type: 'order.delivered', reference: String(o._id), restaurantId: o.restaurantId, entries, description: `Commande ${o.number} livrée` }], { session });
  }

  /** Écriture générique équilibrée (idempotente par type + référence). */
  async post(type: string, reference: string, entries: { account: string; debit?: number; credit?: number }[], opts: { restaurantId?: Types.ObjectId | null; description?: string; createdBy?: string | null; session?: ClientSession } = {}) {
    const clean = entries.map((e) => ({ account: e.account, debit: e.debit ?? 0, credit: e.credit ?? 0 })).filter((e) => e.debit > 0 || e.credit > 0);
    await this.model.create([{ type, reference, restaurantId: opts.restaurantId ?? null, entries: clean, description: opts.description ?? null, createdBy: opts.createdBy ? new Types.ObjectId(opts.createdBy) : null }], { session: opts.session });
  }

  /** Soldes regroupés par compte pour un préfixe (ex. « payable:restaurant: »). */
  async balancesByPrefix(prefix: string) {
    const rx = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    return this.model.aggregate<{ _id: string; debit: number; credit: number }>([
      { $unwind: '$entries' }, { $match: { 'entries.account': rx } },
      { $group: { _id: '$entries.account', debit: { $sum: '$entries.debit' }, credit: { $sum: '$entries.credit' } } },
    ]);
  }

  async transactions(filter: { account?: string; type?: string; from?: Date; to?: Date; restaurantId?: string }, limit = 200) {
    const q: Record<string, unknown> = {};
    if (filter.type) q.type = filter.type;
    if (filter.account) q['entries.account'] = filter.account;
    if (filter.restaurantId) q.restaurantId = new Types.ObjectId(filter.restaurantId);
    if (filter.from || filter.to) q.createdAt = { ...(filter.from ? { $gte: filter.from } : {}), ...(filter.to ? { $lt: filter.to } : {}) };
    return this.model.find(q).sort({ createdAt: -1 }).limit(Math.min(limit, 1000)).lean();
  }

  async balance(account: string) {
    const r = await this.model.aggregate<{ debit: number; credit: number }>([
      { $unwind: '$entries' }, { $match: { 'entries.account': account } },
      { $group: { _id: null, debit: { $sum: '$entries.debit' }, credit: { $sum: '$entries.credit' } } },
    ]);
    return { debit: r[0]?.debit ?? 0, credit: r[0]?.credit ?? 0 };
  }
}
