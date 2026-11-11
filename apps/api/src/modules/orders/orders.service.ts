import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { ActorKind, ACTIVE_RESTAURANT_STATUSES, checkTransition, OrderStatus, OrderView, STATUS_LABELS_FR } from '@plateforme/contracts';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { Order, OrderStatusHistory } from './order.schema';
import { OrderEventsService } from './order-events.service';

type O = Order & { _id: Types.ObjectId };
export interface Actor { kind: ActorKind; userId: string | null }
interface ViewOpts { audience: 'customer' | 'restaurant' | 'ops'; showContact?: boolean }

@Injectable()
export class OrdersService {
  private readonly logger = new Logger('Orders');
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(OrderStatusHistory.name) private readonly history: Model<OrderStatusHistory>,
    private readonly ledger: LedgerService,
    private readonly events: OrderEventsService,
    private readonly audit: AuditService,
  ) {}

  async view(o: O, opts: ViewOpts): Promise<OrderView> {
    const hist = await this.history.find({ orderId: o._id }).sort({ createdAt: 1 }).lean();
    let deliveryCode: string | undefined;
    if (opts.audience === 'customer') {
      const withCode = await this.orders.findOne({ _id: o._id, restaurantId: o.restaurantId }).select('+deliveryCode').lean();
      deliveryCode = withCode?.deliveryCode;
    }
    const showContact = opts.audience === 'ops' || (opts.audience === 'restaurant' && opts.showContact);
    return {
      id: String(o._id), number: o.number, status: o.status, statusLabel: STATUS_LABELS_FR[o.status],
      restaurant: { id: String(o.restaurantId), name: o.restaurantSnapshot.name, slug: o.restaurantSnapshot.slug, phone: o.restaurantSnapshot.phone },
      ...(opts.audience !== 'customer' ? { customer: { name: o.customerSnapshot.name, phone: showContact ? o.customerSnapshot.phone : null } } : {}),
      address: {
        label: o.addressSnapshot.label, neighborhood: o.addressSnapshot.neighborhood, commune: o.addressSnapshot.commune,
        streetLandmark: opts.audience === 'customer' || showContact ? o.addressSnapshot.streetLandmark : '',
        instructions: opts.audience === 'customer' || showContact ? o.addressSnapshot.instructions : '',
      },
      items: o.items.map((i) => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice, lineTotal: i.lineTotal, unitDiscount: i.unitDiscount ?? 0, promotionName: i.promotionName ?? null, optionLabels: i.optionLabels, instructions: i.instructions, imageUrl: i.imageUrl })),
      itemsSubtotal: o.amounts.itemsSubtotal, restaurantDiscount: o.amounts.restaurantDiscount, platformDiscount: o.amounts.platformDiscount, deliveryFee: o.amounts.deliveryFee, serviceFee: o.amounts.serviceFee, total: o.amounts.total,
      paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus, customerNote: o.customerNote,
      rejectReason: o.rejectReason, cancelReason: o.cancelReason, deliveryCode,
      history: hist.map((h) => ({ status: h.toStatus, label: STATUS_LABELS_FR[h.toStatus], at: h.createdAt.toISOString(), reason: h.reason })),
      createdAt: o.createdAt.toISOString(), acceptDeadlineAt: o.acceptDeadlineAt?.toISOString() ?? null, seq: o.seq, delayMinutes: o.delayMinutes ?? 0,
    };
  }

  // ---------- Lecture ----------
  async forCustomer(userId: string, orderId: Types.ObjectId) {
    const o = (await this.orders.findOne({ _id: orderId, customerId: new Types.ObjectId(userId) }).setOptions({ crossTenant: true }).lean()) as O | null;
    if (!o) throw notFound('Commande introuvable.');
    return o;
  }

  /** Accès transversal réservé aux opérations (permission vérifiée par le contrôleur). */
  async findAny(orderId: Types.ObjectId) {
    const o = (await this.orders.findOne({ _id: orderId }).setOptions({ crossTenant: true }).lean()) as O | null;
    if (!o) throw notFound('Commande introuvable.');
    return o;
  }

  async listForCustomer(userId: string) {
    const list = (await this.orders.find({ customerId: new Types.ObjectId(userId) }).setOptions({ crossTenant: true }).sort({ createdAt: -1 }).limit(50).lean()) as O[];
    return list.map((o) => ({
      id: String(o._id), number: o.number, status: o.status, statusLabel: STATUS_LABELS_FR[o.status], restaurantName: o.restaurantSnapshot.name,
      total: o.amounts.total, itemsCount: o.items.reduce((s, i) => s + i.qty, 0), createdAt: o.createdAt, imageUrl: o.items[0]?.imageUrl ?? null,
    }));
  }

  async forRestaurant(restaurantId: string, orderId: Types.ObjectId) {
    const o = (await this.orders.findOne({ restaurantId: new Types.ObjectId(restaurantId), _id: orderId }).lean()) as O | null;
    if (!o) throw notFound('Commande introuvable.');
    return o;
  }

  async listForRestaurant(restaurantId: string, scope: 'active' | 'history') {
    const filter = { restaurantId: new Types.ObjectId(restaurantId), status: scope === 'active' ? { $in: ACTIVE_RESTAURANT_STATUSES } : { $nin: ACTIVE_RESTAURANT_STATUSES } };
    return (await this.orders.find(filter).sort({ createdAt: scope === 'active' ? 1 : -1 }).limit(100).lean()) as O[];
  }

  // ---------- Transitions ----------
  /**
   * Seul point de changement de statut : règle de transition, verrou optimiste (status attendu),
   * historique, effets financiers dans la même transaction, puis notifications.
   */
  async transition(order: O, to: OrderStatus, actor: Actor, reason: string | null = null, extra: Record<string, unknown> = {}) {
    const check = checkTransition(order.status, to, actor.kind, reason);
    if (!check.ok) throw unprocessable('INVALID_TRANSITION', check.error);
    const set: Record<string, unknown> = { status: to, statusChangedAt: new Date(), ...extra };
    if (to === 'REJECTED') set.rejectReason = reason;
    if (to === 'CANCELLED') set.cancelReason = reason;
    if (to === 'DELIVERED' && order.paymentMethod === 'CASH') set.paymentStatus = 'SUCCEEDED';
    if ((to === 'REJECTED' || to === 'CANCELLED') && order.paymentStatus === 'PENDING') set.paymentStatus = 'NOT_DUE';

    const session = await this.conn.startSession();
    try {
      await session.withTransaction(async () => {
        const res = await this.orders.updateOne({ restaurantId: order.restaurantId, _id: order._id, status: order.status }, { $set: set, $inc: { seq: 1 } }, { session });
        if (res.modifiedCount !== 1) throw conflict('STATUS_CHANGED', 'La commande a été modifiée entre-temps. Rechargez la page.');
        await this.history.create([{ orderId: order._id, fromStatus: order.status, toStatus: to, actorUserId: actor.userId ? new Types.ObjectId(actor.userId) : null, actorKind: actor.kind, reason }], { session });
        if (to === 'DELIVERED') {
          const fresh = await this.orders.findOne({ restaurantId: order.restaurantId, _id: order._id }).session(session).lean();
          await this.ledger.postOrderDelivered(fresh as never, session);
        }
      });
    } finally {
      await session.endSession();
    }
    if (actor.kind === 'ops' || actor.kind === 'system') {
      await this.audit.record({ actorUserId: actor.userId, scope: actor.kind === 'system' ? 'system' : 'platform', restaurantId: String(order.restaurantId), action: `order.${to.toLowerCase()}`, entity: 'order', entityId: String(order._id), before: { status: order.status }, after: { status: to, reason } });
    }
    await this.events.statusChanged(String(order._id), to, reason).catch((e) => this.logger.error(`Effets de ${to} échoués : ${(e as Error).message}`));
    return { id: String(order._id), status: to };
  }
}
