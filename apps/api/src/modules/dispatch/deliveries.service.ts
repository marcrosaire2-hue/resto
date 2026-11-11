import { HttpException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CourierDeliveryView, CourierOffer, DELIVERY_STATUS_LABELS, maskPhone, MAX_OTP_ATTEMPTS, OrderStatus } from '@plateforme/contracts';
import { conflict, forbidden, notFound, unprocessable } from '../../common/errors';
import { Courier, Delivery } from '../couriers/courier.schemas';
import { CouriersService } from '../couriers/couriers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Order } from '../orders/order.schema';
import { Actor, OrdersService } from '../orders/orders.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import { User } from '../users/user.schema';
import { IncidentsService } from './incidents.service';

type D = Delivery & { _id: Types.ObjectId };
type O = Order & { _id: Types.ObjectId };
const ASSIGNABLE: OrderStatus[] = ['READY', 'WAITING_FOR_COURIER'];

/**
 * Livraisons : affectation manuelle assistée (MVP) et offres aux livreurs.
 * Garanties : une course n'a qu'un livreur, un livreur n'a qu'une course, une livraison n'est validée qu'une fois.
 */
@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger('Dispatch');
  constructor(
    @InjectModel(Delivery.name) private readonly deliveries: Model<Delivery>,
    @InjectModel(Courier.name) private readonly couriers: Model<Courier>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly orderService: OrdersService,
    private readonly courierService: CouriersService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly incidents: IncidentsService,
  ) {}

  private async order(orderId: Types.ObjectId) {
    return this.orderService.findAny(orderId);
  }

  private async activeAttempt(o: O) {
    const existing = (await this.deliveries.findOne({ orderId: o._id, active: true }).lean()) as D | null;
    if (existing) return existing;
    const attemptNo = (await this.deliveries.countDocuments({ orderId: o._id })) + 1;
    try {
      return (await this.deliveries.create({ orderId: o._id, restaurantId: o.restaurantId, attemptNo, courierPay: o.finance.courierPay })).toObject() as D;
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return (await this.deliveries.findOne({ orderId: o._id, active: true }).lean()) as D;
      throw e;
    }
  }

  /** Plafond d'espèces obligatoire (paramètre administrable) : sans lui, aucune affectation. */
  private async cashLimit() {
    const limit = await this.settings.get('couriers.cash_limit_fcfa');
    if (limit === null) throw unprocessable('PLATFORM_NOT_CONFIGURED', 'Le plafond d’espèces des livreurs n’est pas configuré (Paramètres).');
    return limit;
  }

  async eligibility(courierId: Types.ObjectId) {
    const c = await this.couriers.findById(courierId).lean();
    if (!c || c.status !== 'ACTIVE') return { ok: false as const, reason: 'Livreur inactif.' };
    if (!c.isOnline) return { ok: false as const, reason: 'Livreur hors ligne.' };
    if (c.currentDeliveryId) return { ok: false as const, reason: 'Livreur déjà en course.' };
    const limit = await this.cashLimit();
    const held = await this.courierService.cashHeld(c._id);
    if (held >= limit) return { ok: false as const, reason: 'Plafond d’espèces atteint : le livreur doit d’abord reverser.' };
    return { ok: true as const };
  }

  private emit(d: D | null, o: O | null, courierUserId?: string) {
    const payload = { deliveryId: d ? String(d._id) : null, orderId: o ? String(o._id) : null };
    this.realtime.toOps('delivery.updated', payload);
    if (courierUserId) this.realtime.toUser(courierUserId, 'delivery.updated', payload);
  }

  private async courierUserId(courierId: Types.ObjectId) {
    return String((await this.couriers.findById(courierId, { userId: 1 }).lean())?.userId ?? '');
  }

  /** Attribution effective : réservation atomique du livreur et de la course, puis transition de la commande. */
  private async bind(o: O, d: D, courierId: Types.ObjectId, actor: Actor) {
    const claimedCourier = await this.couriers.updateOne({ _id: courierId, status: 'ACTIVE', isOnline: true, currentDeliveryId: null }, { currentDeliveryId: d._id });
    if (claimedCourier.modifiedCount !== 1) throw conflict('COURIER_UNAVAILABLE', 'Ce livreur n’est plus disponible.');
    const now = new Date();
    const claimedDelivery = await this.deliveries.updateOne(
      { _id: d._id, active: true, courierId: null },
      { courierId, status: 'ASSIGNED', assignedAt: now, $set: { 'offers.$[o].status': 'ACCEPTED' } },
      { arrayFilters: [{ 'o.courierId': courierId, 'o.status': 'OFFERED' }] },
    );
    if (claimedDelivery.modifiedCount !== 1) {
      await this.couriers.updateOne({ _id: courierId, currentDeliveryId: d._id }, { currentDeliveryId: null });
      throw conflict('ALREADY_ASSIGNED', 'Cette course a déjà été attribuée.');
    }
    try {
      await this.orderService.transition(o, 'COURIER_ASSIGNED', actor, null, { courierId });
    } catch (e) {
      await this.deliveries.updateOne({ _id: d._id }, { courierId: null, status: 'SEARCHING', assignedAt: null });
      await this.couriers.updateOne({ _id: courierId, currentDeliveryId: d._id }, { currentDeliveryId: null });
      throw e;
    }
    // Les autres offres en attente expirent : la course n'est plus proposée.
    await this.deliveries.updateOne({ _id: d._id }, { $set: { 'offers.$[o].status': 'EXPIRED' } }, { arrayFilters: [{ 'o.status': 'OFFERED' }] });
    const uid = await this.courierUserId(courierId);
    await this.notifications.notify({ userIds: [uid], eventKey: `delivery:${d._id}:assigned`, type: 'delivery.assigned', title: `Course ${o.number} attribuée`, body: `Rendez-vous chez ${o.restaurantSnapshot.name}.`, link: '/livreur' });
    this.emit(d, o, uid);
    return { deliveryId: String(d._id), courierId: String(courierId) };
  }

  // ---------- Opérations ----------
  async assign(orderId: Types.ObjectId, courierId: Types.ObjectId, opsUserId: string) {
    const o = await this.order(orderId);
    if (!ASSIGNABLE.includes(o.status)) throw unprocessable('NOT_READY', 'La commande doit être prête (ou en attente de livreur) pour être attribuée.');
    const elig = await this.eligibility(courierId);
    if (!elig.ok) throw unprocessable('COURIER_NOT_ELIGIBLE', elig.reason);
    const d = await this.activeAttempt(o);
    return this.bind(o, d, courierId, { kind: 'ops', userId: opsUserId });
  }

  async offer(orderId: Types.ObjectId, courierIds: Types.ObjectId[], opsUserId: string) {
    const o = await this.order(orderId);
    if (!['ACCEPTED', 'PREPARING', ...ASSIGNABLE].includes(o.status)) throw unprocessable('NOT_OFFERABLE', 'Cette commande ne peut pas être proposée.');
    const expiry = await this.settings.get('couriers.offer_expiry_seconds');
    if (expiry === null) throw unprocessable('PLATFORM_NOT_CONFIGURED', 'La durée de validité des offres n’est pas configurée (Paramètres).');
    const d = await this.activeAttempt(o);
    if (d.courierId) throw conflict('ALREADY_ASSIGNED', 'Cette course a déjà un livreur.');
    const now = new Date();
    const sent: string[] = [];
    for (const cid of courierIds) {
      const elig = await this.eligibility(cid);
      if (!elig.ok) continue;
      await this.deliveries.updateOne({ _id: d._id, 'offers.courierId': { $ne: cid } }, { $push: { offers: { courierId: cid, status: 'OFFERED', offeredAt: now, expiresAt: new Date(now.getTime() + expiry * 1000) } } });
      const uid = await this.courierUserId(cid);
      this.realtime.toUser(uid, 'delivery.offer', { deliveryId: String(d._id) });
      await this.notifications.notify({ userIds: [uid], eventKey: `delivery:${d._id}:offer:${now.getTime()}`, type: 'delivery.offer', title: 'Nouvelle course disponible', body: `${o.restaurantSnapshot.name} → ${o.addressSnapshot.neighborhood}`, link: '/livreur' });
      sent.push(String(cid));
    }
    if (!sent.length) throw unprocessable('NO_ELIGIBLE_COURIER', 'Aucun des livreurs choisis n’est disponible.');
    this.emit(d, o);
    return { deliveryId: String(d._id), offeredTo: sent };
  }

  /** Réattribution contrôlée : la tentative en cours est close, la commande repart en attente de livreur. */
  async unassign(orderId: Types.ObjectId, reason: string, actor: Actor) {
    const o = await this.order(orderId);
    const d = (await this.deliveries.findOne({ orderId: o._id, active: true }).lean()) as D | null;
    if (!d?.courierId || !['ASSIGNED', 'AT_PICKUP'].includes(d.status)) throw unprocessable('CANNOT_UNASSIGN', 'Réattribution impossible : la commande est déjà récupérée ou sans livreur.');
    const closed = await this.deliveries.updateOne({ _id: d._id, active: true, status: { $in: ['ASSIGNED', 'AT_PICKUP'] } }, { active: false, status: 'CANCELLED', endReason: reason });
    if (closed.modifiedCount !== 1) throw conflict('STATUS_CHANGED', 'La course a changé entre-temps.');
    await this.couriers.updateOne({ _id: d.courierId, currentDeliveryId: d._id }, { currentDeliveryId: null });
    await this.orderService.transition(o, 'WAITING_FOR_COURIER', actor, reason, { courierId: null, courierAlertAt: null });
    const uid = await this.courierUserId(d.courierId);
    await this.notifications.notify({ userIds: [uid], eventKey: `delivery:${d._id}:cancelled`, type: 'delivery.cancelled', title: `Course ${o.number} retirée`, body: reason, link: '/livreur' });
    this.emit(d, o, uid);
    return { ok: true };
  }

  // ---------- Livreur ----------
  async offersFor(userId: string): Promise<CourierOffer[]> {
    const c = await this.courierService.requireActive(userId);
    const now = new Date();
    const list = (await this.deliveries.find({ active: true, courierId: null, offers: { $elemMatch: { courierId: c._id, status: 'OFFERED', expiresAt: { $gt: now } } } }).lean()) as D[];
    const orders = await this.orders.find({ _id: { $in: list.map((d) => d.orderId) } }).setOptions({ crossTenant: true }).lean();
    const byId = new Map(orders.map((o) => [String(o._id), o]));
    return list.flatMap((d) => {
      const o = byId.get(String(d.orderId));
      const off = d.offers.find((x) => x.courierId.equals(c._id));
      if (!o || !off) return [];
      // Avant acceptation : seulement les zones et la rémunération (aucune donnée personnelle du client).
      return [{ deliveryId: String(d._id), orderNumber: o.number, restaurantName: o.restaurantSnapshot.name, pickupArea: o.restaurantSnapshot.address ?? '', dropoffArea: `${o.addressSnapshot.neighborhood}, ${o.addressSnapshot.commune}`, courierPay: d.courierPay, distanceKm: null, estimatedMinutes: null, expiresAt: off.expiresAt.toISOString() }];
    });
  }

  async accept(userId: string, deliveryId: Types.ObjectId) {
    const c = await this.courierService.requireActive(userId);
    const d = (await this.deliveries.findOne({ _id: deliveryId, active: true, offers: { $elemMatch: { courierId: c._id, status: 'OFFERED', expiresAt: { $gt: new Date() } } } }).lean()) as D | null;
    if (!d) throw notFound('Offre introuvable ou expirée.');
    if (d.courierId) throw conflict('ALREADY_ASSIGNED', 'Course déjà attribuée à un autre livreur.');
    const elig = await this.eligibility(c._id);
    if (!elig.ok) throw unprocessable('COURIER_NOT_ELIGIBLE', elig.reason);
    const o = await this.order(d.orderId);
    if (!ASSIGNABLE.includes(o.status)) throw unprocessable('NOT_READY', 'La commande n’est pas encore prête. Réessayez dans un instant.');
    return this.bind(o, d, c._id, { kind: 'courier', userId });
  }

  async decline(userId: string, deliveryId: Types.ObjectId) {
    const c = await this.courierService.requireActive(userId);
    const r = await this.deliveries.updateOne({ _id: deliveryId, active: true }, { $set: { 'offers.$[o].status': 'DECLINED' } }, { arrayFilters: [{ 'o.courierId': c._id, 'o.status': 'OFFERED' }] });
    if (r.modifiedCount !== 1) throw notFound('Offre introuvable.');
    this.realtime.toOps('delivery.updated', { deliveryId: String(deliveryId) });
  }

  /** Course du livreur : jamais celle d'un autre (filtre sur son identifiant). */
  private async mine(userId: string, deliveryId: Types.ObjectId) {
    const c = await this.courierService.requireActive(userId);
    const d = (await this.deliveries.findOne({ _id: deliveryId, courierId: c._id, active: true }).lean()) as D | null;
    if (!d) throw notFound('Course introuvable.');
    return { c, d, o: await this.order(d.orderId) };
  }

  async view(d: D, o: O): Promise<CourierDeliveryView> {
    const revealCustomer = ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF'].includes(d.status);
    return {
      id: String(d._id), orderId: String(o._id), orderNumber: o.number, status: d.status, statusLabel: DELIVERY_STATUS_LABELS[d.status],
      restaurant: { name: o.restaurantSnapshot.name, phone: o.restaurantSnapshot.phone, address: o.restaurantSnapshot.address, area: o.restaurantSnapshot.address ?? '' },
      customer: revealCustomer
        ? { name: o.customerSnapshot.name, phone: o.customerSnapshot.phone, address: o.addressSnapshot.streetLandmark, area: `${o.addressSnapshot.neighborhood}, ${o.addressSnapshot.commune}`, instructions: o.addressSnapshot.instructions }
        : { name: o.customerSnapshot.name, phone: maskPhone(o.customerSnapshot.phone), address: '', area: o.addressSnapshot.neighborhood, instructions: '' },
      items: o.items.map((i) => ({ name: i.name, qty: i.qty })),
      cashToCollect: o.paymentMethod === 'CASH' ? o.amounts.total : 0, courierPay: d.courierPay, customerNote: o.customerNote,
      assignedAt: d.assignedAt?.toISOString() ?? null, otpAttemptsLeft: Math.max(0, MAX_OTP_ATTEMPTS - d.otpAttempts),
    };
  }

  async active(userId: string) {
    const c = await this.courierService.requireActive(userId);
    if (!c.currentDeliveryId) return null;
    const d = (await this.deliveries.findOne({ _id: c.currentDeliveryId, courierId: c._id, active: true }).lean()) as D | null;
    if (!d) return null;
    return this.view(d, await this.order(d.orderId));
  }

  private async step(userId: string, deliveryId: Types.ObjectId, from: string[], to: Delivery['status'], extra: Record<string, unknown> = {}) {
    const { d, o, c } = await this.mine(userId, deliveryId);
    const r = await this.deliveries.updateOne({ _id: d._id, courierId: c._id, active: true, status: { $in: from } }, { status: to, ...extra });
    if (r.modifiedCount !== 1) throw unprocessable('INVALID_STEP', 'Cette étape n’est pas possible maintenant.');
    return { d: { ...d, status: to }, o, c };
  }

  async arrivedPickup(userId: string, id: Types.ObjectId) {
    const { d, o } = await this.step(userId, id, ['ASSIGNED'], 'AT_PICKUP', { arrivedPickupAt: new Date() });
    this.emit(d as D, o, userId);
    return this.view(d as D, o);
  }

  async pickedUp(userId: string, id: Types.ObjectId) {
    const { d: before, o: ord } = await this.mine(userId, id);
    if (before.status !== 'AT_PICKUP') throw unprocessable('INVALID_STEP', 'Confirmez d’abord votre arrivée au restaurant.');
    if (ord.status !== 'COURIER_ASSIGNED') throw unprocessable('NOT_READY', 'La commande n’est pas prête à être remise.');
    const { d, o } = await this.step(userId, id, ['AT_PICKUP'], 'PICKED_UP', { pickedUpAt: new Date() });
    await this.orderService.transition(o, 'PICKED_UP', { kind: 'courier', userId });
    await this.orderService.transition(await this.order(o._id), 'IN_DELIVERY', { kind: 'courier', userId });
    this.emit(d as D, o, userId);
    return this.view(d as D, await this.order(o._id));
  }

  async arrivedDropoff(userId: string, id: Types.ObjectId) {
    const { d, o } = await this.step(userId, id, ['PICKED_UP'], 'AT_DROPOFF', { arrivedDropoffAt: new Date() });
    this.emit(d as D, o, userId);
    return this.view(d as D, o);
  }

  /** Remise au client : code à 4 chiffres, 5 essais maximum, validation unique (verrou sur le statut). */
  async deliver(userId: string, id: Types.ObjectId, code: string, position?: { lat: number; lng: number }) {
    const { d, o, c } = await this.mine(userId, id);
    if (!['PICKED_UP', 'AT_DROPOFF'].includes(d.status) || o.status !== 'IN_DELIVERY') throw unprocessable('INVALID_STEP', 'Cette course ne peut pas être validée maintenant.');
    if (d.otpAttempts >= MAX_OTP_ATTEMPTS) throw new HttpException({ statusCode: 423, error: 'OTP_LOCKED', message: 'Trop d’essais : contactez les opérations.' }, 423);
    const withCode = await this.orders.findOne({ restaurantId: o.restaurantId, _id: o._id }).select('+deliveryCode').lean();
    if (withCode?.deliveryCode !== code) {
      const upd = await this.deliveries.findOneAndUpdate({ _id: d._id }, { $inc: { otpAttempts: 1 } }, { new: true }).lean();
      const left = MAX_OTP_ATTEMPTS - (upd?.otpAttempts ?? MAX_OTP_ATTEMPTS);
      if (left <= 0) {
        await this.incidents.open({ type: 'OTHER', description: `Code de livraison erroné ${MAX_OTP_ATTEMPTS} fois (commande ${o.number}).`, source: 'system', reportedBy: null, orderId: o._id, restaurantId: o.restaurantId, courierId: c._id });
      }
      throw unprocessable('OTP_INVALID', left > 0 ? `Code incorrect. Il reste ${left} essai(s).` : 'Code incorrect. La validation est bloquée : contactez les opérations.');
    }
    const done = await this.deliveries.updateOne({ _id: d._id, courierId: c._id, active: true, status: { $in: ['PICKED_UP', 'AT_DROPOFF'] } }, { status: 'DELIVERED', deliveredAt: new Date(), active: false, deliveredPosition: position ?? null });
    if (done.modifiedCount !== 1) throw conflict('ALREADY_DELIVERED', 'Cette livraison a déjà été validée.');
    await this.orderService.transition(o, 'DELIVERED', { kind: 'courier', userId });
    await this.couriers.updateOne({ _id: c._id, currentDeliveryId: d._id }, { currentDeliveryId: null });
    this.emit(d, o, userId);
    return { ok: true, cashCollected: o.paymentMethod === 'CASH' ? o.amounts.total : 0, earned: d.courierPay };
  }

  async fail(userId: string, id: Types.ObjectId, reason: string) {
    const { d, o, c } = await this.mine(userId, id);
    if (!['PICKED_UP', 'AT_DROPOFF'].includes(d.status)) throw unprocessable('INVALID_STEP', 'Échec possible uniquement après le retrait de la commande.');
    const r = await this.deliveries.updateOne({ _id: d._id, active: true, status: { $in: ['PICKED_UP', 'AT_DROPOFF'] } }, { status: 'FAILED', active: false, endReason: reason });
    if (r.modifiedCount !== 1) throw conflict('STATUS_CHANGED', 'La course a changé entre-temps.');
    await this.orderService.transition(o, 'DELIVERY_FAILED', { kind: 'courier', userId }, reason);
    await this.couriers.updateOne({ _id: c._id, currentDeliveryId: d._id }, { currentDeliveryId: null });
    await this.incidents.open({ type: 'DELIVERY_FAILED', description: `${o.number} : ${reason}`, source: 'courier', reportedBy: userId, orderId: o._id, restaurantId: o.restaurantId, courierId: c._id });
    this.emit(d, o, userId);
    return { ok: true };
  }

  async withdraw(userId: string, id: Types.ObjectId, reason: string) {
    const { o } = await this.mine(userId, id);
    return this.unassign(o._id, reason, { kind: 'courier', userId });
  }

  async report(userId: string, id: Types.ObjectId, type: string, description: string) {
    const { o, c } = await this.mine(userId, id);
    return this.incidents.open({ type, description: `${o.number} : ${description}`, source: 'courier', reportedBy: userId, orderId: o._id, restaurantId: o.restaurantId, courierId: c._id });
  }

  async history(userId: string) {
    const c = await this.courierService.byUser(userId);
    if (!c) throw forbidden('Vous n’êtes pas inscrit comme livreur.', 'NOT_A_COURIER');
    const list = (await this.deliveries.find({ courierId: c._id, active: false }).sort({ updatedAt: -1 }).limit(50).lean()) as D[];
    const orders = await this.orders.find({ _id: { $in: list.map((d) => d.orderId) } }, { number: 1, restaurantSnapshot: 1, addressSnapshot: 1 }).setOptions({ crossTenant: true }).lean();
    const byId = new Map(orders.map((o) => [String(o._id), o]));
    return list.map((d) => ({ id: String(d._id), orderNumber: byId.get(String(d.orderId))?.number ?? '', restaurantName: byId.get(String(d.orderId))?.restaurantSnapshot.name ?? '', area: byId.get(String(d.orderId))?.addressSnapshot.neighborhood ?? '', status: d.status, statusLabel: DELIVERY_STATUS_LABELS[d.status], courierPay: d.status === 'DELIVERED' ? d.courierPay : 0, at: d.deliveredAt ?? d.updatedAt }));
  }

  /** Gains calculés depuis les livraisons validées ; dû restant calculé depuis le grand livre. */
  async earnings(userId: string, now = new Date()) {
    const c = await this.courierService.byUser(userId);
    if (!c) throw forbidden('Vous n’êtes pas inscrit comme livreur.', 'NOT_A_COURIER');
    const dayStart = new Date(Date.UTC(new Date(now.getTime() + 3600_000).getUTCFullYear(), new Date(now.getTime() + 3600_000).getUTCMonth(), new Date(now.getTime() + 3600_000).getUTCDate()) - 3600_000);
    const sum = async (from: Date) => {
      const r = await this.deliveries.aggregate<{ total: number; n: number }>([{ $match: { courierId: c._id, status: 'DELIVERED', deliveredAt: { $gte: from } } }, { $group: { _id: null, total: { $sum: '$courierPay' }, n: { $sum: 1 } } }]);
      return { total: r[0]?.total ?? 0, count: r[0]?.n ?? 0 };
    };
    const payable = await this.courierService.payable(c._id);
    return {
      today: await sum(dayStart), week: await sum(new Date(dayStart.getTime() - 6 * 86_400_000)), month: await sum(new Date(dayStart.getTime() - 29 * 86_400_000)),
      pendingPayout: payable.credit - payable.debit, paidOut: payable.debit, cashHeld: await this.courierService.cashHeld(c._id),
    };
  }
}
