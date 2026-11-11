import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrderStatus, STATUS_LABELS_FR, VEHICLE_LABELS } from '@plateforme/contracts';
import { env } from '../../common/env';
import { Courier, Delivery, Incident } from '../couriers/courier.schemas';
import { CouriersService } from '../couriers/couriers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Order } from '../orders/order.schema';
import { OrderEventsService } from '../orders/order-events.service';
import { SettingsService } from '../settings/settings.service';
import { User } from '../users/user.schema';

const ACTIVE: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'WAITING_FOR_COURIER', 'COURIER_ASSIGNED', 'PICKED_UP', 'IN_DELIVERY', 'DELIVERY_FAILED'];
const NEEDS_COURIER: OrderStatus[] = ['READY', 'WAITING_FOR_COURIER'];

/** Tableau de bord des opérations + alerte « commande prête sans livreur ». */
@Injectable()
export class OpsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Ops');
  private timer: NodeJS.Timeout | null = null;
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Courier.name) private readonly couriers: Model<Courier>,
    @InjectModel(Delivery.name) private readonly deliveries: Model<Delivery>,
    @InjectModel(Incident.name) private readonly incidents: Model<Incident>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly courierService: CouriersService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly events: OrderEventsService,
  ) {}

  onApplicationBootstrap() {
    if (env().NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.runAlerts().catch((e) => this.logger.error((e as Error).message)), 30_000);
  }
  onApplicationShutdown() { if (this.timer) clearInterval(this.timer); }

  /** Commandes prêtes sans livreur depuis plus de N minutes : une seule alerte par commande. */
  async runAlerts(now = new Date()) {
    const minutes = await this.settings.get('orders.ready_without_courier_alert_minutes');
    if (minutes === null) return 0;
    const limit = new Date(now.getTime() - minutes * 60_000);
    const late = await this.orders.find({ status: { $in: NEEDS_COURIER }, statusChangedAt: { $lt: limit }, courierAlertAt: null }).setOptions({ crossTenant: true }).limit(100).lean();
    let n = 0;
    for (const o of late) {
      const claimed = await this.orders.updateOne({ restaurantId: o.restaurantId, _id: o._id, courierAlertAt: null }, { courierAlertAt: now });
      if (claimed.modifiedCount !== 1) continue;
      n++;
      await this.notifications.notify({
        userIds: await this.events.opsUsers(), eventKey: `order:${o._id}:no_courier:${o.seq}`, type: 'order.no_courier',
        title: `Sans livreur : ${o.number}`, body: `${o.restaurantSnapshot.name} → ${o.addressSnapshot.neighborhood}, prête depuis plus de ${minutes} min.`, link: '/operations',
      });
    }
    return n;
  }

  async overview(now = new Date()) {
    const [byStatus, couriers, openIncidents] = await Promise.all([
      this.orders.aggregate<{ _id: OrderStatus; n: number }>([{ $match: { restaurantId: { $exists: true }, status: { $in: ACTIVE } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]).option({ crossTenant: true }),
      this.couriers.find({ status: 'ACTIVE' }, { isOnline: 1, currentDeliveryId: 1 }).lean(),
      this.incidents.countDocuments({ status: { $in: ['OPEN', 'IN_PROGRESS'] } }),
    ]);
    const n = (s: OrderStatus[]) => byStatus.filter((x) => s.includes(x._id)).reduce((a, x) => a + x.n, 0);
    const lateResponse = await this.orders.countDocuments({ status: 'PENDING', acceptDeadlineAt: { $lt: now } }).setOptions({ crossTenant: true });
    const minutes = await this.settings.get('orders.ready_without_courier_alert_minutes');
    const lateCourier = minutes === null ? 0 : await this.orders.countDocuments({ status: { $in: NEEDS_COURIER }, statusChangedAt: { $lt: new Date(now.getTime() - minutes * 60_000) } }).setOptions({ crossTenant: true });
    return {
      pending: n(['PENDING']), inKitchen: n(['ACCEPTED', 'PREPARING']), withoutCourier: n(NEEDS_COURIER), inDelivery: n(['COURIER_ASSIGNED', 'PICKED_UP', 'IN_DELIVERY']),
      deliveryFailed: n(['DELIVERY_FAILED']), couriersOnline: couriers.filter((c) => c.isOnline).length,
      couriersAvailable: couriers.filter((c) => c.isOnline && !c.currentDeliveryId).length, couriersBusy: couriers.filter((c) => c.currentDeliveryId).length,
      late: lateResponse + lateCourier, lateResponse, lateCourier, openIncidents,
    };
  }

  async listOrders(filter: { scope: 'unassigned' | 'active' | 'all'; restaurantId?: string; neighborhood?: string }) {
    const f: Record<string, unknown> = {};
    if (filter.scope === 'unassigned') f.status = { $in: NEEDS_COURIER };
    else if (filter.scope === 'active') f.status = { $in: ACTIVE };
    if (filter.restaurantId && /^[a-f0-9]{24}$/i.test(filter.restaurantId)) f.restaurantId = new Types.ObjectId(filter.restaurantId);
    if (filter.neighborhood) f['addressSnapshot.neighborhood'] = filter.neighborhood;
    const list = await this.orders.find(f).setOptions({ crossTenant: true }).sort({ createdAt: filter.scope === 'all' ? -1 : 1 }).limit(200).lean();
    const dels = await this.deliveries.find({ orderId: { $in: list.map((o) => o._id) }, active: true }).lean();
    const dByOrder = new Map(dels.map((d) => [String(d.orderId), d]));
    const courierIds = [...new Set(list.map((o) => o.courierId).filter(Boolean).map(String))];
    const cs = await this.couriers.find({ _id: { $in: courierIds.map((i) => new Types.ObjectId(i)) } }, { userId: 1 }).lean();
    const us = await this.users.find({ _id: { $in: cs.map((c) => c.userId) } }, { fullName: 1, phone: 1 }).lean();
    const uById = new Map(us.map((u) => [String(u._id), u]));
    const cName = new Map(cs.map((c) => [String(c._id), uById.get(String(c.userId))]));
    return list.map((o) => {
      const d = dByOrder.get(String(o._id));
      return {
        id: String(o._id), number: o.number, status: o.status, statusLabel: STATUS_LABELS_FR[o.status], createdAt: o.createdAt, statusChangedAt: o.statusChangedAt,
        restaurant: { id: String(o.restaurantId), name: o.restaurantSnapshot.name, phone: o.restaurantSnapshot.phone, address: o.restaurantSnapshot.address },
        customer: { name: o.customerSnapshot.name, phone: o.customerSnapshot.phone },
        dropoff: { neighborhood: o.addressSnapshot.neighborhood, commune: o.addressSnapshot.commune, streetLandmark: o.addressSnapshot.streetLandmark, lat: o.addressSnapshot.lat, lng: o.addressSnapshot.lng },
        total: o.amounts.total, courierPay: o.finance.courierPay, zoneFrom: o.finance.fromZoneId, zoneTo: o.finance.toZoneId,
        courier: o.courierId ? { id: String(o.courierId), name: cName.get(String(o.courierId))?.fullName ?? '—', phone: cName.get(String(o.courierId))?.phone ?? null } : null,
        delivery: d ? { id: String(d._id), status: d.status, offers: d.offers.filter((x) => x.status === 'OFFERED').length, otpAttempts: d.otpAttempts } : null,
        delayMinutes: o.delayMinutes ?? 0,
      };
    });
  }

  async listCouriers() {
    const list = await this.couriers.find({ status: 'ACTIVE' }).lean();
    const users = await this.users.find({ _id: { $in: list.map((c) => c.userId) } }, { fullName: 1, phone: 1 }).lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const limit = await this.settings.get('couriers.cash_limit_fcfa');
    return Promise.all(list.map(async (c) => {
      const cashHeld = await this.courierService.cashHeld(c._id);
      return {
        id: String(c._id), fullName: byId.get(String(c.userId))?.fullName ?? '—', phone: byId.get(String(c.userId))?.phone ?? null,
        vehicle: VEHICLE_LABELS[c.vehicleType as keyof typeof VEHICLE_LABELS] ?? c.vehicleType, isOnline: c.isOnline, busy: !!c.currentDeliveryId,
        cashHeld, cashLimit: limit, overLimit: limit !== null && cashHeld >= limit,
        position: c.lastLat != null && c.lastLng != null && c.lastPositionAt ? { lat: c.lastLat, lng: c.lastLng, accuracy: c.lastAccuracy, at: c.lastPositionAt } : null,
      };
    }));
  }
}
