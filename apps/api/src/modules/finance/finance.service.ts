import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'node:crypto';
import { Connection, Model, Types } from 'mongoose';
import { conflict, forbidden, notFound, unprocessable } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { Courier } from '../couriers/courier.schemas';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Order } from '../orders/order.schema';
import { OrderEventsService } from '../orders/order-events.service';
import { Restaurant } from '../restaurants/restaurant.schema';
import { SettingsService } from '../settings/settings.service';
import { User } from '../users/user.schema';
import { CashRemittance, Payout, Refund } from './finance.schemas';

interface Meta { ip: string | null; userAgent: string | null }
const net = (b: { debit: number; credit: number }) => b.credit - b.debit;

/**
 * Module financier : chaque mouvement est une écriture équilibrée du grand livre ; rien n'est modifié,
 * toute correction produit une nouvelle écriture. Les montants viennent des écritures, jamais de compteurs.
 */
@Injectable()
export class FinanceService {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(CashRemittance.name) private readonly remittances: Model<CashRemittance>,
    @InjectModel(Payout.name) private readonly payouts: Model<Payout>,
    @InjectModel(Refund.name) private readonly refunds: Model<Refund>,
    @InjectModel(Courier.name) private readonly couriers: Model<Courier>,
    @InjectModel(Restaurant.name) private readonly restaurants: Model<Restaurant>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly ledger: LedgerService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly events: OrderEventsService,
  ) {}

  private async inTx<T>(fn: (s: import('mongoose').ClientSession) => Promise<T>) {
    const session = await this.conn.startSession();
    try {
      let out!: T;
      await session.withTransaction(async () => { out = await fn(session); });
      return out;
    } finally {
      await session.endSession();
    }
  }

  // ---------- Vue d'ensemble ----------
  async overview() {
    const [rest, cour, cash] = await Promise.all([
      this.ledger.balancesByPrefix('payable:restaurant:'),
      this.ledger.balancesByPrefix('payable:courier:'),
      this.ledger.balancesByPrefix('clearing:cash:'),
    ]);
    const one = async (a: string) => this.ledger.balance(a);
    const [commission, delivery, service, promos, refundsExp, subsidy] = await Promise.all([
      one('revenue:commission'), one('revenue:delivery'), one('revenue:service'), one('expense:platform_promotions'), one('expense:refunds'), one('expense:delivery_subsidy'),
    ]);
    return {
      revenue: { commission: net(commission), delivery: net(delivery), service: net(service) },
      expenses: { promotions: promos.debit - promos.credit, refunds: refundsExp.debit - refundsExp.credit, deliverySubsidy: subsidy.debit - subsidy.credit },
      owedToRestaurants: rest.reduce((s, b) => s + net(b), 0),
      owedToCouriers: cour.reduce((s, b) => s + net(b), 0),
      cashHeldByCouriers: cash.reduce((s, b) => s + (b.debit - b.credit), 0),
      pendingPayouts: await this.payouts.countDocuments({ status: { $in: ['PENDING_APPROVAL', 'APPROVED'] } }),
      pendingRefunds: await this.refunds.countDocuments({ status: { $in: ['REQUESTED', 'APPROVED'] } }),
    };
  }

  async transactions(f: { account?: string; type?: string; from?: Date; to?: Date }) {
    const list = await this.ledger.transactions(f);
    return list.map((t) => ({ id: String(t._id), type: t.type, reference: t.reference, description: t.description, createdAt: t.createdAt, entries: t.entries }));
  }

  /** Soldes à verser : restaurants et livreurs, avec noms. */
  async balances() {
    const [rest, cour, cash] = await Promise.all([
      this.ledger.balancesByPrefix('payable:restaurant:'), this.ledger.balancesByPrefix('payable:courier:'), this.ledger.balancesByPrefix('clearing:cash:'),
    ]);
    const rIds = rest.map((b) => b._id.split(':')[2]).filter((x) => /^[a-f0-9]{24}$/.test(x));
    const cIds = [...new Set([...cour, ...cash].map((b) => b._id.split(':')[2]).filter((x) => /^[a-f0-9]{24}$/.test(x)))];
    const [rs, cs] = await Promise.all([
      this.restaurants.find({ _id: { $in: rIds } }, { name: 1 }).lean(),
      this.couriers.find({ _id: { $in: cIds } }, { userId: 1 }).lean(),
    ]);
    const us = await this.users.find({ _id: { $in: cs.map((c) => c.userId) } }, { fullName: 1 }).lean();
    const rName = new Map(rs.map((r) => [String(r._id), r.name]));
    const uName = new Map(us.map((u) => [String(u._id), u.fullName]));
    const cName = new Map(cs.map((c) => [String(c._id), uName.get(String(c.userId)) ?? '—']));
    const pending = await this.payouts.aggregate<{ _id: string; amount: number }>([{ $match: { status: { $in: ['PENDING_APPROVAL', 'APPROVED'] } } }, { $group: { _id: { $toString: '$beneficiaryId' }, amount: { $sum: '$amount' } } }]);
    const pend = new Map(pending.map((p) => [p._id, p.amount]));
    return {
      restaurants: rest.map((b) => { const id = b._id.split(':')[2]; return { id, name: rName.get(id) ?? id, earned: b.credit, paid: b.debit, balance: net(b), pendingPayouts: pend.get(id) ?? 0 }; }).sort((a, b) => b.balance - a.balance),
      couriers: cIds.map((id) => {
        const p = cour.find((b) => b._id === `payable:courier:${id}`) ?? { debit: 0, credit: 0 };
        const c = cash.find((b) => b._id === `clearing:cash:${id}`) ?? { debit: 0, credit: 0 };
        return { id, name: cName.get(id) ?? id, earned: p.credit, paid: p.debit, balance: net(p), cashHeld: c.debit - c.credit, pendingPayouts: pend.get(id) ?? 0 };
      }).sort((a, b) => b.cashHeld - a.cashHeld),
    };
  }

  // ---------- Reversement d'espèces ----------
  async recordRemittance(courierId: Types.ObjectId, amount: number, note: string, actor: string, meta: Meta) {
    if (!(await this.couriers.exists({ _id: courierId }))) throw notFound('Livreur introuvable.');
    const held = await this.ledger.balance(`clearing:cash:${courierId}`);
    if (amount > held.debit - held.credit) throw unprocessable('AMOUNT_TOO_HIGH', `Le livreur ne détient que ${held.debit - held.credit} FCFA.`);
    const receiptNumber = `REC-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(randomInt(0, 1e6)).padStart(6, '0')}`;
    const r = await this.inTx(async (session) => {
      const [doc] = await this.remittances.create([{ courierId, amount, receiptNumber, receivedBy: new Types.ObjectId(actor), note }], { session });
      await this.ledger.post('courier.cash_remittance', String(doc._id), [
        { account: 'bank:platform', debit: amount }, { account: `clearing:cash:${courierId}`, credit: amount },
      ], { description: `Reversement espèces ${receiptNumber}`, createdBy: actor, session });
      return doc;
    });
    await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'finance.cash_remittance', entity: 'courier', entityId: String(courierId), after: { amount, receiptNumber }, ...meta });
    return { id: String(r._id), receiptNumber, amount, createdAt: r.createdAt };
  }

  async remittanceList(courierId?: string) {
    const list = await this.remittances.find(courierId ? { courierId: new Types.ObjectId(courierId) } : {}).sort({ createdAt: -1 }).limit(200).lean();
    return list.map((r) => ({ id: String(r._id), courierId: String(r.courierId), amount: r.amount, receiptNumber: r.receiptNumber, note: r.note, createdAt: r.createdAt }));
  }

  // ---------- Versements ----------
  private account(type: 'RESTAURANT' | 'COURIER', id: Types.ObjectId | string) {
    return `payable:${type === 'RESTAURANT' ? 'restaurant' : 'courier'}:${id}`;
  }

  private async available(type: 'RESTAURANT' | 'COURIER', id: Types.ObjectId, excludePayout?: Types.ObjectId) {
    const b = await this.ledger.balance(this.account(type, id));
    const reserved = await this.payouts.aggregate<{ s: number }>([{ $match: { beneficiaryId: id, status: { $in: ['PENDING_APPROVAL', 'APPROVED'] }, ...(excludePayout ? { _id: { $ne: excludePayout } } : {}) } }, { $group: { _id: null, s: { $sum: '$amount' } } }]);
    return net(b) - (reserved[0]?.s ?? 0);
  }

  async requestPayout(input: { beneficiaryType: 'RESTAURANT' | 'COURIER'; beneficiaryId: Types.ObjectId; amount: number; method: string; note: string }, actor: string, meta: Meta) {
    const exists = input.beneficiaryType === 'RESTAURANT' ? await this.restaurants.exists({ _id: input.beneficiaryId }) : await this.couriers.exists({ _id: input.beneficiaryId });
    if (!exists) throw notFound('Bénéficiaire introuvable.');
    const avail = await this.available(input.beneficiaryType, input.beneficiaryId);
    if (input.amount > avail) throw unprocessable('AMOUNT_TOO_HIGH', `Montant supérieur au solde disponible (${avail} FCFA).`);
    const p = await this.payouts.create({ ...input, requestedBy: new Types.ObjectId(actor) });
    await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'finance.payout_request', entity: 'payout', entityId: String(p._id), after: input, ...meta });
    return { id: String(p._id), status: p.status };
  }

  async approvePayout(id: Types.ObjectId, actor: string, meta: Meta) {
    const p = await this.payouts.findById(id);
    if (!p) throw notFound();
    if (p.status !== 'PENDING_APPROVAL') throw unprocessable('INVALID_STATE', 'Ce versement n’est pas en attente d’approbation.');
    if (p.requestedBy.equals(actor)) throw forbidden('La double validation exige une autre personne que le demandeur.', 'SAME_PERSON');
    if (p.amount > (await this.available(p.beneficiaryType, p.beneficiaryId, p._id))) throw unprocessable('AMOUNT_TOO_HIGH', 'Le solde disponible a changé : montant trop élevé.');
    const r = await this.payouts.updateOne({ _id: id, status: 'PENDING_APPROVAL' }, { status: 'APPROVED', approvedBy: new Types.ObjectId(actor) });
    if (r.modifiedCount !== 1) throw conflict('STATUS_CHANGED', 'Le versement a changé entre-temps.');
    await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'finance.payout_approve', entity: 'payout', entityId: String(id), ...meta });
    return { id: String(id), status: 'APPROVED' };
  }

  async executePayout(id: Types.ObjectId, reference: string, actor: string, meta: Meta) {
    const p = await this.payouts.findById(id);
    if (!p) throw notFound();
    if (p.status !== 'APPROVED') throw unprocessable('INVALID_STATE', 'Le versement doit être approuvé avant d’être exécuté.');
    const res = await this.inTx(async (session) => {
      const r = await this.payouts.updateOne({ _id: id, status: 'APPROVED' }, { status: 'PAID', reference, paidBy: new Types.ObjectId(actor), paidAt: new Date() }, { session });
      if (r.modifiedCount !== 1) throw conflict('STATUS_CHANGED', 'Le versement a changé entre-temps.');
      await this.ledger.post('payout.paid', String(id), [{ account: this.account(p.beneficiaryType, p.beneficiaryId), debit: p.amount }, { account: 'bank:platform', credit: p.amount }],
        { restaurantId: p.beneficiaryType === 'RESTAURANT' ? p.beneficiaryId : null, description: `Versement ${reference}`, createdBy: actor, session });
      return { id: String(id), status: 'PAID' };
    });
    await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'finance.payout_paid', entity: 'payout', entityId: String(id), after: { reference, amount: p.amount }, ...meta });
    const userIds = p.beneficiaryType === 'RESTAURANT'
      ? await this.events.restaurantUsers(p.beneficiaryId, 'payouts.view')
      : [(await this.couriers.findById(p.beneficiaryId, { userId: 1 }).lean())!.userId];
    await this.notifications.notify({ userIds, eventKey: `payout:${id}:paid`, type: 'payout.paid', title: 'Versement effectué', body: `${p.amount} FCFA — référence ${reference}`, link: p.beneficiaryType === 'RESTAURANT' ? `/pro/${p.beneficiaryId}/finances` : '/livreur' });
    return res;
  }

  async rejectPayout(id: Types.ObjectId, reason: string, actor: string, meta: Meta) {
    const r = await this.payouts.updateOne({ _id: id, status: { $in: ['PENDING_APPROVAL', 'APPROVED'] } }, { status: 'REJECTED', rejectReason: reason });
    if (r.modifiedCount !== 1) throw unprocessable('INVALID_STATE', 'Ce versement ne peut plus être refusé.');
    await this.audit.record({ actorUserId: actor, scope: 'platform', action: 'finance.payout_reject', entity: 'payout', entityId: String(id), after: { reason }, ...meta });
    return { id: String(id), status: 'REJECTED' };
  }

  async payoutList(f: { status?: string; beneficiaryId?: string }) {
    const q: Record<string, unknown> = {};
    if (f.status) q.status = f.status;
    if (f.beneficiaryId) q.beneficiaryId = new Types.ObjectId(f.beneficiaryId);
    const list = await this.payouts.find(q).sort({ createdAt: -1 }).limit(300).lean();
    return list.map((p) => ({ id: String(p._id), beneficiaryType: p.beneficiaryType, beneficiaryId: String(p.beneficiaryId), amount: p.amount, method: p.method, status: p.status, reference: p.reference, note: p.note, requestedBy: String(p.requestedBy), approvedBy: p.approvedBy ? String(p.approvedBy) : null, paidAt: p.paidAt, rejectReason: p.rejectReason, createdAt: p.createdAt }));
  }

  // ---------- Remboursements ----------
  private async refunded(orderId: Types.ObjectId, excludeId?: Types.ObjectId) {
    const r = await this.refunds.aggregate<{ s: number }>([{ $match: { orderId, status: { $in: ['REQUESTED', 'APPROVED', 'PAID'] }, ...(excludeId ? { _id: { $ne: excludeId } } : {}) } }, { $group: { _id: null, s: { $sum: '$amount' } } }]);
    return r[0]?.s ?? 0;
  }

  async requestRefund(input: { orderId: Types.ObjectId; amount: number; reason: string; borneBy: 'RESTAURANT' | 'PLATFORM' }, actor: string, meta: Meta) {
    const o = await this.orders.findOne({ _id: input.orderId }).setOptions({ crossTenant: true }).lean();
    if (!o) throw notFound('Commande introuvable.');
    // Vérification du paiement initial : on ne rembourse que ce qui a réellement été encaissé.
    if (o.paymentStatus !== 'SUCCEEDED') throw unprocessable('NOT_PAID', 'Aucun paiement encaissé pour cette commande : rien à rembourser.');
    const already = await this.refunded(o._id);
    if (input.amount > o.amounts.total - already) throw unprocessable('AMOUNT_TOO_HIGH', `Montant maximal remboursable : ${o.amounts.total - already} FCFA.`);
    const threshold = await this.settings.get('finance.refund_double_approval_threshold_fcfa');
    const requiredApprovals = threshold === null || input.amount > threshold ? 2 : 1; // sans seuil configuré : double validation systématique
    const r = await this.refunds.create({ ...input, restaurantId: o.restaurantId, customerId: o.customerId, requiredApprovals, requestedBy: new Types.ObjectId(actor) });
    await this.audit.record({ actorUserId: actor, scope: 'platform', restaurantId: String(o.restaurantId), action: 'finance.refund_request', entity: 'refund', entityId: String(r._id), after: { ...input, orderId: String(input.orderId), requiredApprovals }, ...meta });
    return { id: String(r._id), status: r.status, requiredApprovals };
  }

  async approveRefund(id: Types.ObjectId, actor: string, meta: Meta) {
    const r = await this.refunds.findById(id);
    if (!r) throw notFound();
    if (r.status !== 'REQUESTED') throw unprocessable('INVALID_STATE', 'Ce remboursement n’est pas en attente.');
    if (r.requestedBy.equals(actor)) throw forbidden('Le demandeur ne peut pas approuver son propre remboursement.', 'SAME_PERSON');
    if (r.approvals.some((a) => a.equals(actor))) throw conflict('ALREADY_APPROVED', 'Vous avez déjà approuvé ce remboursement.');
    const approvals = [...r.approvals, new Types.ObjectId(actor)];
    const status = approvals.length >= r.requiredApprovals ? 'APPROVED' : 'REQUESTED';
    await this.refunds.updateOne({ _id: id, status: 'REQUESTED', approvals: r.approvals }, { approvals, status });
    await this.audit.record({ actorUserId: actor, scope: 'platform', restaurantId: String(r.restaurantId), action: 'finance.refund_approve', entity: 'refund', entityId: String(id), after: { approvals: approvals.length, status }, ...meta });
    return { id: String(id), status, approvals: approvals.length, requiredApprovals: r.requiredApprovals };
  }

  async payRefund(id: Types.ObjectId, method: string, reference: string, actor: string, meta: Meta) {
    const r = await this.refunds.findById(id);
    if (!r) throw notFound();
    if (r.status !== 'APPROVED') throw unprocessable('INVALID_STATE', 'Le remboursement doit être approuvé.');
    await this.inTx(async (session) => {
      const u = await this.refunds.updateOne({ _id: id, status: 'APPROVED' }, { status: 'PAID', method, reference, paidBy: new Types.ObjectId(actor) }, { session });
      if (u.modifiedCount !== 1) throw conflict('STATUS_CHANGED', 'Le remboursement a changé entre-temps.');
      await this.ledger.post('refund.paid', String(id), [
        { account: r.borneBy === 'RESTAURANT' ? `payable:restaurant:${r.restaurantId}` : 'expense:refunds', debit: r.amount },
        { account: 'bank:platform', credit: r.amount },
      ], { restaurantId: r.restaurantId, description: `Remboursement ${reference}`, createdBy: actor, session });
      const o = await this.orders.findOne({ restaurantId: r.restaurantId, _id: r.orderId }).session(session).lean();
      const total = (await this.refunds.aggregate<{ s: number }>([{ $match: { orderId: r.orderId, status: 'PAID' } }, { $group: { _id: null, s: { $sum: '$amount' } } }]).session(session))[0]?.s ?? 0;
      if (o && total >= o.amounts.total) await this.orders.updateOne({ restaurantId: r.restaurantId, _id: r.orderId }, { paymentStatus: 'REFUNDED' }, { session });
    });
    await this.audit.record({ actorUserId: actor, scope: 'platform', restaurantId: String(r.restaurantId), action: 'finance.refund_paid', entity: 'refund', entityId: String(id), after: { amount: r.amount, method, reference }, ...meta });
    await this.notifications.notify({ userIds: [r.customerId], eventKey: `refund:${id}:paid`, type: 'refund.paid', title: 'Remboursement effectué', body: `${r.amount} FCFA vous ont été remboursés (${method}, réf. ${reference}).`, link: `/commandes/${r.orderId}` });
    return { id: String(id), status: 'PAID' };
  }

  async rejectRefund(id: Types.ObjectId, reason: string, actor: string, meta: Meta) {
    const r = await this.refunds.findOneAndUpdate({ _id: id, status: { $in: ['REQUESTED', 'APPROVED'] } }, { status: 'REJECTED', rejectReason: reason });
    if (!r) throw unprocessable('INVALID_STATE', 'Ce remboursement ne peut plus être refusé.');
    await this.audit.record({ actorUserId: actor, scope: 'platform', restaurantId: String(r.restaurantId), action: 'finance.refund_reject', entity: 'refund', entityId: String(id), after: { reason }, ...meta });
    await this.notifications.notify({ userIds: [r.customerId], eventKey: `refund:${id}:rejected`, type: 'refund.rejected', title: 'Demande de remboursement refusée', body: reason, link: `/commandes/${r.orderId}` });
    return { id: String(id), status: 'REJECTED' };
  }

  async refundList(f: { status?: string; orderId?: string }) {
    const q: Record<string, unknown> = {};
    if (f.status) q.status = f.status;
    if (f.orderId && /^[a-f0-9]{24}$/i.test(f.orderId)) q.orderId = new Types.ObjectId(f.orderId);
    const list = await this.refunds.find(q).sort({ createdAt: -1 }).limit(300).lean();
    const orders = await this.orders.find({ _id: { $in: list.map((r) => r.orderId) } }, { number: 1, restaurantSnapshot: 1 }).setOptions({ crossTenant: true }).lean();
    const byId = new Map(orders.map((o) => [String(o._id), o]));
    return list.map((r) => ({
      id: String(r._id), orderId: String(r.orderId), orderNumber: byId.get(String(r.orderId))?.number ?? '', restaurantName: byId.get(String(r.orderId))?.restaurantSnapshot.name ?? '',
      amount: r.amount, reason: r.reason, borneBy: r.borneBy, status: r.status, approvals: r.approvals.length, requiredApprovals: r.requiredApprovals,
      requestedBy: String(r.requestedBy), method: r.method, reference: r.reference, rejectReason: r.rejectReason, createdAt: r.createdAt,
    }));
  }

  // ---------- Finances d'un restaurant ----------
  async restaurantStatement(restaurantId: string, from: Date, to: Date) {
    const rid = new Types.ObjectId(restaurantId);
    const [agg] = await this.orders.aggregate<{ n: number; gross: number; discount: number; commission: number; net: number }>([
      { $match: { restaurantId: rid, status: 'DELIVERED', statusChangedAt: { $gte: from, $lt: to } } },
      { $group: { _id: null, n: { $sum: 1 }, gross: { $sum: '$amounts.itemsSubtotal' }, discount: { $sum: '$amounts.restaurantDiscount' }, commission: { $sum: '$finance.commissionAmount' }, net: { $sum: '$finance.restaurantNet' } } },
    ]);
    const bal = await this.ledger.balance(`payable:restaurant:${restaurantId}`);
    const payouts = await this.payouts.find({ beneficiaryType: 'RESTAURANT', beneficiaryId: rid }).sort({ createdAt: -1 }).limit(50).lean();
    const refunds = await this.refunds.find({ restaurantId: rid, borneBy: 'RESTAURANT', status: 'PAID' }).sort({ createdAt: -1 }).limit(50).lean();
    const paid = payouts.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amount, 0);
    return {
      period: { from, to },
      orders: agg?.n ?? 0, grossSales: agg?.gross ?? 0, discounts: agg?.discount ?? 0, commissions: agg?.commission ?? 0, net: agg?.net ?? 0,
      totalEarned: bal.credit, totalPaidOut: paid, refundsBorne: refunds.reduce((s, r) => s + r.amount, 0), balance: net(bal),
      pendingPayouts: payouts.filter((p) => ['PENDING_APPROVAL', 'APPROVED'].includes(p.status)).reduce((s, p) => s + p.amount, 0),
      payouts: payouts.map((p) => ({ id: String(p._id), amount: p.amount, status: p.status, method: p.method, reference: p.reference, paidAt: p.paidAt, createdAt: p.createdAt })),
    };
  }
}
