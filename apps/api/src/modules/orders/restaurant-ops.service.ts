import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ISSUE_LABELS, KitchenTicket, OrderStatus, RestaurantDashboard, STATUS_LABELS_FR } from '@plateforme/contracts';
import { notFound, unprocessable } from '../../common/errors';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { Order, OrderIssue } from './order.schema';
import { Incident } from '../couriers/courier.schemas';
import { OrderEventsService } from './order-events.service';

const KITCHEN: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'WAITING_FOR_COURIER', 'COURIER_ASSIGNED'];
const OFFSET_MS = 60 * 60_000; // heure du Bénin (UTC+1)

/** Début du jour béninois contenant `d`, en UTC. */
function beninDayStart(d: Date) {
  const local = new Date(d.getTime() + OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET_MS);
}

@Injectable()
export class RestaurantOpsService {
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(OrderIssue.name) private readonly issues: Model<OrderIssue>,
    @InjectModel(Incident.name) private readonly incidentsModel: Model<Incident>,
    private readonly events: OrderEventsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Écran cuisine : commandes en cours, sans aucune donnée personnelle du client. */
  async kitchen(restaurantId: string): Promise<KitchenTicket[]> {
    const list = await this.orders.find({ restaurantId: new Types.ObjectId(restaurantId), status: { $in: KITCHEN } }, { customerSnapshot: 0, addressSnapshot: 0, finance: 0 }).sort({ createdAt: 1 }).lean();
    return list.map((o) => ({
      id: String(o._id), number: o.number, status: o.status, createdAt: o.createdAt.toISOString(), statusChangedAt: o.statusChangedAt.toISOString(),
      delayMinutes: o.delayMinutes ?? 0, customerNote: o.customerNote,
      items: o.items.map((i) => ({ name: i.name, qty: i.qty, optionLabels: i.optionLabels, instructions: i.instructions })),
    }));
  }

  private async find(restaurantId: string, orderId: Types.ObjectId) {
    const o = await this.orders.findOne({ restaurantId: new Types.ObjectId(restaurantId), _id: orderId }).lean();
    if (!o) throw notFound('Commande introuvable.');
    return o;
  }

  /** Retard signalé par la cuisine : client et opérations informés. */
  async reportDelay(restaurantId: string, orderId: Types.ObjectId, minutes: number, reason: string, userId: string) {
    const o = await this.find(restaurantId, orderId);
    if (!['ACCEPTED', 'PREPARING'].includes(o.status)) throw unprocessable('INVALID_STATE', 'Un retard ne peut être signalé que pour une commande acceptée ou en préparation.');
    await this.orders.updateOne({ restaurantId: o.restaurantId, _id: o._id }, { $inc: { delayMinutes: minutes, seq: 1 } });
    const issue = await this.issues.create({ restaurantId: o.restaurantId, orderId: o._id, type: 'DELAY', description: reason, delayMinutes: minutes, reportedBy: new Types.ObjectId(userId) });
    await this.notifications.notify({
      userIds: [o.customerId], eventKey: `issue:${issue._id}:customer`, type: 'order.delay',
      title: `Commande ${o.number} — léger retard`, body: `Le restaurant annonce environ ${minutes} minutes de plus.${reason ? ` ${reason}` : ''}`, link: `/commandes/${o._id}`,
    });
    await this.notifications.notify({
      userIds: await this.events.opsUsers(), eventKey: `issue:${issue._id}:ops`, type: 'order.delay',
      title: `Retard annoncé : ${o.number}`, body: `${o.restaurantSnapshot.name} : +${minutes} min. ${reason}`, link: null,
    });
    const payload = { orderId: String(o._id), number: o.number, status: o.status, seq: o.seq + 1 };
    this.realtime.toOrder(String(o._id), 'order.updated', payload);
    this.realtime.toRestaurant(restaurantId, 'order.updated', payload);
    return { id: String(issue._id) };
  }

  /** Problème signalé par le restaurant : transmis aux opérations. */
  async reportIssue(restaurantId: string, orderId: Types.ObjectId, type: keyof typeof ISSUE_LABELS, description: string, userId: string) {
    const o = await this.find(restaurantId, orderId);
    const issue = await this.issues.create({ restaurantId: o.restaurantId, orderId: o._id, type, description, reportedBy: new Types.ObjectId(userId) });
    // Suivi côté opérations (statut, responsable, historique, résolution).
    await this.incidentsModel.create({
      type, description: `${o.number} : ${description}`, source: 'restaurant', reportedBy: new Types.ObjectId(userId), orderId: o._id, restaurantId: o.restaurantId, courierId: o.courierId,
      events: [{ at: new Date(), by: new Types.ObjectId(userId), action: 'Ouverture', note: description }],
    });
    await this.notifications.notify({
      userIds: await this.events.opsUsers(), eventKey: `issue:${issue._id}:ops`, type: 'order.issue',
      title: `${ISSUE_LABELS[type]} : ${o.number}`, body: `${o.restaurantSnapshot.name} — ${description}`, link: null,
    });
    return { id: String(issue._id) };
  }

  async listIssues(restaurantId: string, orderId: Types.ObjectId) {
    await this.find(restaurantId, orderId);
    const list = await this.issues.find({ restaurantId: new Types.ObjectId(restaurantId), orderId }).sort({ createdAt: -1 }).lean();
    return list.map((i) => ({ id: String(i._id), type: i.type, description: i.description, delayMinutes: i.delayMinutes, status: i.status, createdAt: i.createdAt }));
  }

  /** Tableau de bord calculé à partir des commandes réelles (jamais de chiffres estimés au hasard). */
  async dashboard(restaurantId: string, days: 1 | 7 | 30, canSeeMoney: boolean, now = new Date()): Promise<RestaurantDashboard> {
    const rid = new Types.ObjectId(restaurantId);
    const todayStart = beninDayStart(now);
    const from = new Date(todayStart.getTime() - (days - 1) * 86_400_000);
    const money = (v: number) => (canSeeMoney ? v : null);

    const [todayAgg] = await this.orders.aggregate<{ byStatus: { _id: OrderStatus; n: number }[]; delivered: { gross: number; net: number }[] }>([
      { $match: { restaurantId: rid, createdAt: { $gte: todayStart } } },
      { $facet: {
        byStatus: [{ $group: { _id: '$status', n: { $sum: 1 } } }],
        delivered: [{ $match: { status: 'DELIVERED' } }, { $group: { _id: null, gross: { $sum: { $subtract: ['$amounts.itemsSubtotal', '$amounts.restaurantDiscount'] } }, net: { $sum: '$finance.restaurantNet' } } }],
      } },
    ]);
    const n = (s: OrderStatus[]) => todayAgg.byStatus.filter((x) => s.includes(x._id)).reduce((a, x) => a + x.n, 0);

    const [periodAgg] = await this.orders.aggregate<{
      totals: { orders: number; delivered: number; gross: number; net: number }[];
      series: { _id: string; orders: number; gross: number }[];
      top: { _id: string; qty: number }[];
    }>([
      { $match: { restaurantId: rid, createdAt: { $gte: from }, status: { $nin: ['REJECTED', 'CANCELLED'] } } },
      { $facet: {
        totals: [{ $group: {
          _id: null, orders: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'DELIVERED'] }, 1, 0] } },
          gross: { $sum: { $cond: [{ $eq: ['$status', 'DELIVERED'] }, { $subtract: ['$amounts.itemsSubtotal', '$amounts.restaurantDiscount'] }, 0] } },
          net: { $sum: { $cond: [{ $eq: ['$status', 'DELIVERED'] }, '$finance.restaurantNet', 0] } },
        } }],
        series: [
          { $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+01:00' } },
            orders: { $sum: 1 },
            gross: { $sum: { $cond: [{ $eq: ['$status', 'DELIVERED'] }, { $subtract: ['$amounts.itemsSubtotal', '$amounts.restaurantDiscount'] }, 0] } },
          } },
        ],
        top: [{ $unwind: '$items' }, { $group: { _id: '$items.name', qty: { $sum: '$items.qty' } } }, { $sort: { qty: -1 } }, { $limit: 5 }],
      } },
    ]);
    const t = periodAgg.totals[0] ?? { orders: 0, delivered: 0, gross: 0, net: 0 };
    const byDay = new Map(periodAgg.series.map((x) => [x._id, x]));
    const series = Array.from({ length: days }, (_, i) => {
      const d = new Date(from.getTime() + i * 86_400_000 + OFFSET_MS).toISOString().slice(0, 10);
      const v = byDay.get(d);
      return { day: d, orders: v?.orders ?? 0, grossSales: money(v?.gross ?? 0) };
    });
    const latest = await this.orders.find({ restaurantId: rid }, { number: 1, status: 1, amounts: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(8).lean();

    return {
      period: { from: from.toISOString(), to: now.toISOString(), label: days === 1 ? 'Aujourd’hui' : `${days} derniers jours` },
      canSeeMoney,
      today: {
        orders: n(Object.keys(STATUS_LABELS_FR) as OrderStatus[]), pending: n(['PENDING']), preparing: n(['ACCEPTED', 'PREPARING']),
        ready: n(['READY', 'WAITING_FOR_COURIER', 'COURIER_ASSIGNED', 'PICKED_UP', 'IN_DELIVERY']), delivered: n(['DELIVERED']),
        rejectedOrCancelled: n(['REJECTED', 'CANCELLED']),
        grossSales: money(todayAgg.delivered[0]?.gross ?? 0), netEstimate: money(todayAgg.delivered[0]?.net ?? 0),
      },
      periodTotals: { orders: t.orders, delivered: t.delivered, grossSales: money(t.gross), netEstimate: money(t.net), averageBasket: money(t.delivered ? Math.round(t.gross / t.delivered) : 0) },
      series,
      topProducts: periodAgg.top.map((x) => ({ name: x._id, qty: x.qty })),
      latest: latest.map((o) => ({ id: String(o._id), number: o.number, status: o.status, statusLabel: STATUS_LABELS_FR[o.status], total: money(o.amounts.total), createdAt: o.createdAt.toISOString() })),
    };
  }
}
