import { Body, Controller, Get, Injectable, Module, Param, Post, Query, Req } from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { Model, Types } from 'mongoose';
import { z } from 'zod';
import { notFound, unprocessable } from '../../common/errors';
import { toObjectId } from '../../common/object-id';
import { AppRequest, AuthContext, CurrentAuth, requestMeta } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { Session, SessionSchema } from '../auth/session.schema';
import { Courier, CourierSchema, Delivery, DeliverySchema } from '../couriers/courier.schemas';
import { Refund, RefundSchema } from '../finance/finance.schemas';
import { Order, OrderSchema } from '../orders/order.schema';
import { PlatformStaff, PlatformStaffSchema } from '../rbac/platform-staff.schema';
import { RequirePermission } from '../rbac/require-permission';
import { Restaurant, RestaurantSchema } from '../restaurants/restaurant.schema';
import { User, UserSchema } from '../users/user.schema';

const DAY = 86_400_000;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Console d'administration : chiffres calculés sur les données réelles, aucune valeur inventée. */
@Injectable()
export class AdminConsoleService {
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
    @InjectModel(Restaurant.name) private readonly restaurants: Model<Restaurant>,
    @InjectModel(Courier.name) private readonly couriers: Model<Courier>,
    @InjectModel(Delivery.name) private readonly deliveries: Model<Delivery>,
    @InjectModel(Refund.name) private readonly refunds: Model<Refund>,
    @InjectModel(PlatformStaff.name) private readonly staff: Model<PlatformStaff>,
    private readonly audit: AuditService,
  ) {}

  async dashboard(days: number) {
    const since = new Date(Date.now() - days * DAY);
    const [delivered] = await this.orders.aggregate<{ n: number; gmv: number; commission: number; delivery: number; service: number; platformDiscount: number }>([
      { $match: { status: 'DELIVERED', statusChangedAt: { $gte: since } } },
      { $group: { _id: null, n: { $sum: 1 }, gmv: { $sum: '$amounts.total' }, commission: { $sum: '$finance.commissionAmount' }, delivery: { $sum: '$amounts.deliveryFee' }, service: { $sum: '$amounts.serviceFee' }, platformDiscount: { $sum: '$amounts.platformDiscount' } } },
    ]).option({ crossTenant: true });
    const byStatus = await this.orders.aggregate<{ _id: string; n: number }>([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]).option({ crossTenant: true });
    const daily = await this.orders.aggregate<{ _id: string; orders: number; gmv: number }>([
      { $match: { status: 'DELIVERED', statusChangedAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$statusChangedAt', timezone: 'Africa/Porto-Novo' } }, orders: { $sum: 1 }, gmv: { $sum: '$amounts.total' } } },
      { $sort: { _id: 1 } },
    ]).option({ crossTenant: true });
    const [refunded] = await this.refunds.aggregate<{ total: number }>([{ $match: { status: 'PAID', updatedAt: { $gte: since } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const topRestaurants = await this.orders.aggregate<{ _id: Types.ObjectId; name: string; orders: number; gmv: number }>([
      { $match: { status: 'DELIVERED', statusChangedAt: { $gte: since } } },
      { $group: { _id: '$restaurantId', name: { $first: '$restaurantSnapshot.name' }, orders: { $sum: 1 }, gmv: { $sum: '$amounts.total' } } },
      { $sort: { gmv: -1 } }, { $limit: 5 },
    ]).option({ crossTenant: true });
    const statuses = Object.fromEntries(byStatus.map((s) => [s._id, s.n]));
    const created = byStatus.reduce((a, s) => a + s.n, 0);
    return {
      periodDays: days,
      orders: { created, delivered: delivered?.n ?? 0, byStatus: statuses, cancellationRate: created ? Math.round((((statuses.CANCELLED ?? 0) + (statuses.REJECTED ?? 0)) / created) * 1000) / 10 : null },
      money: { gmv: delivered?.gmv ?? 0, commission: delivered?.commission ?? 0, deliveryFees: delivered?.delivery ?? 0, serviceFees: delivered?.service ?? 0, platformDiscounts: delivered?.platformDiscount ?? 0, refunds: refunded?.total ?? 0, averageBasket: delivered?.n ? Math.round(delivered.gmv / delivered.n) : null },
      counts: {
        customers: await this.users.countDocuments({}),
        newCustomers: await this.users.countDocuments({ createdAt: { $gte: since } }),
        activeRestaurants: await this.restaurants.countDocuments({ status: 'ACTIVE' }),
        pendingRestaurants: await this.restaurants.countDocuments({ status: { $in: ['APPLICATION', 'PENDING_REVIEW'] } }),
        activeCouriers: await this.couriers.countDocuments({ status: 'ACTIVE' }),
        onlineCouriers: await this.couriers.countDocuments({ status: 'ACTIVE', isOnline: true }),
        pendingCouriers: await this.couriers.countDocuments({ status: 'PENDING_REVIEW' }),
      },
      daily: daily.map((d) => ({ day: d._id, orders: d.orders, gmv: d.gmv })),
      topRestaurants: topRestaurants.map((r) => ({ id: String(r._id), name: r.name, orders: r.orders, gmv: r.gmv })),
    };
  }

  async customers(q: string | undefined, status: string | undefined) {
    const f: Record<string, unknown> = {};
    if (q) { const rx = new RegExp(escapeRegex(q.slice(0, 60)), 'i'); f.$or = [{ fullName: rx }, { phone: rx }, { email: rx }]; }
    if (status === 'ACTIVE' || status === 'SUSPENDED') f.status = status;
    const list = await this.users.find(f, { fullName: 1, phone: 1, email: 1, status: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(100).lean<{ _id: Types.ObjectId; fullName: string; phone: string; email: string | null; status: string; createdAt: Date }[]>();
    const stats = await this.orders.aggregate<{ _id: Types.ObjectId; orders: number; spent: number }>([
      { $match: { customerId: { $in: list.map((u) => u._id) } } },
      { $group: { _id: '$customerId', orders: { $sum: 1 }, spent: { $sum: { $cond: [{ $eq: ['$status', 'DELIVERED'] }, '$amounts.total', 0] } } } },
    ]).option({ crossTenant: true });
    const byId = new Map(stats.map((s) => [String(s._id), s]));
    const staffIds = new Set((await this.staff.find({ userId: { $in: list.map((u) => u._id) } }, { userId: 1 }).lean()).map((s) => String(s.userId)));
    return list.map((u) => ({ id: String(u._id), fullName: u.fullName, phone: u.phone, email: u.email, status: u.status, createdAt: u.createdAt, isStaff: staffIds.has(String(u._id)), orders: byId.get(String(u._id))?.orders ?? 0, spent: byId.get(String(u._id))?.spent ?? 0 }));
  }

  async customer(id: Types.ObjectId) {
    const u = await this.users.findById(id, { fullName: 1, phone: 1, email: 1, status: 1, createdAt: 1 }).lean<{ _id: Types.ObjectId; fullName: string; phone: string; email: string | null; status: string; createdAt: Date }>();
    if (!u) throw notFound();
    const orders = await this.orders.find({ customerId: id }, { number: 1, status: 1, 'amounts.total': 1, restaurantSnapshot: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(50).setOptions({ crossTenant: true }).lean();
    return {
      id: String(u._id), fullName: u.fullName, phone: u.phone, email: u.email, status: u.status, createdAt: u.createdAt,
      orders: orders.map((o) => ({ id: String(o._id), number: o.number, status: o.status, total: o.amounts.total, restaurant: o.restaurantSnapshot.name, createdAt: (o as unknown as { createdAt: Date }).createdAt })),
    };
  }

  /** Suspension : le compte ne peut plus se connecter et toutes ses sessions sont révoquées immédiatement. */
  async setStatus(id: Types.ObjectId, status: 'ACTIVE' | 'SUSPENDED', reason: string, actor: string, meta: { ip: string | null; userAgent: string | null }) {
    if (String(id) === actor) throw unprocessable('SELF', 'Vous ne pouvez pas modifier votre propre statut.');
    if (status === 'SUSPENDED' && (await this.staff.exists({ userId: id, status: 'ACTIVE' }))) throw unprocessable('IS_STAFF', 'Ce compte appartient à un salarié : désactivez d’abord son accès dans « Personnel ».');
    const before = await this.users.findByIdAndUpdate(id, { status }, { new: false }).lean();
    if (!before) throw notFound();
    if (status === 'SUSPENDED') await this.sessions.updateMany({ userId: id, revokedAt: null }, { revokedAt: new Date() });
    await this.audit.record({ actorUserId: actor, scope: 'platform', action: status === 'SUSPENDED' ? 'user.suspend' : 'user.reactivate', entity: 'user', entityId: String(id), before: { status: before.status }, after: { status, reason }, ...meta });
    return { id: String(id), status };
  }

  async courierPerformance(days: number) {
    const since = new Date(Date.now() - days * DAY);
    const cs = await this.couriers.find({ status: { $in: ['ACTIVE', 'SUSPENDED'] } }, { userId: 1, status: 1, isOnline: 1, vehicleType: 1 }).lean();
    const users = await this.users.find({ _id: { $in: cs.map((c) => c.userId) } }, { fullName: 1, phone: 1 }).lean();
    const uById = new Map(users.map((u) => [String(u._id), u]));
    const stats = await this.deliveries.aggregate<{ _id: Types.ObjectId; delivered: number; failed: number; earned: number; avgMinutes: number | null }>([
      { $match: { courierId: { $ne: null }, createdAt: { $gte: since } } },
      { $group: {
        _id: '$courierId',
        delivered: { $sum: { $cond: [{ $eq: ['$status', 'DELIVERED'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } },
        earned: { $sum: { $cond: [{ $eq: ['$status', 'DELIVERED'] }, '$courierPay', 0] } },
        avgMinutes: { $avg: { $cond: [{ $and: ['$deliveredAt', '$assignedAt'] }, { $divide: [{ $subtract: ['$deliveredAt', '$assignedAt'] }, 60000] }, null] } },
      } },
    ]);
    const offers = await this.deliveries.aggregate<{ _id: Types.ObjectId; offered: number; accepted: number }>([
      { $match: { createdAt: { $gte: since } } }, { $unwind: '$offers' },
      { $group: { _id: '$offers.courierId', offered: { $sum: 1 }, accepted: { $sum: { $cond: [{ $eq: ['$offers.status', 'ACCEPTED'] }, 1, 0] } } } },
    ]);
    const sById = new Map(stats.map((s) => [String(s._id), s]));
    const oById = new Map(offers.map((o) => [String(o._id), o]));
    return cs.map((c) => {
      const s = sById.get(String(c._id)); const o = oById.get(String(c._id)); const u = uById.get(String(c.userId));
      const done = (s?.delivered ?? 0) + (s?.failed ?? 0);
      return {
        id: String(c._id), name: u?.fullName ?? '—', phone: u?.phone ?? null, status: c.status, isOnline: c.isOnline, vehicleType: c.vehicleType,
        delivered: s?.delivered ?? 0, failed: s?.failed ?? 0, earned: s?.earned ?? 0,
        successRate: done ? Math.round(((s?.delivered ?? 0) / done) * 1000) / 10 : null,
        acceptanceRate: o?.offered ? Math.round((o.accepted / o.offered) * 1000) / 10 : null,
        avgDeliveryMinutes: s?.avgMinutes != null ? Math.round(s.avgMinutes) : null,
      };
    }).sort((a, b) => b.delivered - a.delivered);
  }
}

const days = (v?: string) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 365 ? n : 30; };
const statusBody = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: z.string().trim().min(3, 'Indiquez un motif.').max(300) });

@ApiTags('administration')
@Controller('admin')
class AdminConsoleController {
  constructor(private readonly s: AdminConsoleService) {}
  @Get('dashboard') @RequirePermission('admin.restaurants.view') dashboard(@Query('days') d?: string) { return this.s.dashboard(days(d)); }
  @Get('customers') @RequirePermission('support.customers.view') customers(@Query('q') q?: string, @Query('status') status?: string) { return this.s.customers(q?.trim() || undefined, status); }
  @Get('customers/:id') @RequirePermission('support.customers.view') customer(@Param('id') id: string) { return this.s.customer(toObjectId(id)); }
  @Post('customers/:id/status') @RequirePermission('admin.users.manage')
  setStatus(@Param('id') id: string, @Body(new ZodPipe(statusBody)) b: z.output<typeof statusBody>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.s.setStatus(toObjectId(id), b.status, b.reason, a.userId, requestMeta(r)); }
  @Get('couriers/performance') @RequirePermission('admin.couriers.review') performance(@Query('days') d?: string) { return this.s.courierPerformance(days(d)); }
}

@Module({
  imports: [MongooseModule.forFeature([
    { name: Order.name, schema: OrderSchema }, { name: User.name, schema: UserSchema }, { name: Session.name, schema: SessionSchema },
    { name: Restaurant.name, schema: RestaurantSchema }, { name: Courier.name, schema: CourierSchema }, { name: Delivery.name, schema: DeliverySchema },
    { name: Refund.name, schema: RefundSchema }, { name: PlatformStaff.name, schema: PlatformStaffSchema },
  ])],
  controllers: [AdminConsoleController],
  providers: [AdminConsoleService],
})
export class AdminConsoleModule {}
