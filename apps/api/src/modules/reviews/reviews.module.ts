import { Body, Controller, Get, Global, Injectable, Module, Param, Post, Query, Req } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { Model, Types } from 'mongoose';
import { z } from 'zod';
import { PublicReview, reviewReplySchema, reviewSchema } from '@plateforme/contracts';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { toObjectId } from '../../common/object-id';
import { AppRequest, AuthContext, CurrentAuth, CurrentTenant, Public, requestMeta, TenantContext } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Order, OrderSchema } from '../orders/order.schema';
import { OrderEventsService } from '../orders/order-events.service';
import { OrdersModule } from '../orders/orders.module';
import { RequirePermission } from '../rbac/require-permission';
import { Restaurant } from '../restaurants/restaurant.schema';

/** Avis : uniquement par un client dont la commande a été livrée, un seul par commande. */
@Schema({ collection: 'reviews', timestamps: true })
export class Review {
  @Prop({ type: Types.ObjectId, required: true, unique: true }) orderId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) restaurantId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) customerId: Types.ObjectId;
  @Prop({ type: String, required: true }) authorName: string;
  @Prop({ type: Number, required: true, min: 1, max: 5 }) rating: number;
  @Prop({ type: String, default: '' }) comment: string;
  @Prop({ type: String, default: 'VISIBLE' }) status: 'VISIBLE' | 'HIDDEN';
  @Prop({ type: String, default: null }) moderationReason: string | null;
  @Prop({ type: String, default: null }) reply: string | null;
  @Prop({ type: Date, default: null }) repliedAt: Date | null;
  createdAt: Date;
}
export const ReviewSchema = SchemaFactory.createForClass(Review);

type Rv = Review & { _id: Types.ObjectId };
const firstNameAndInitial = (full: string) => { const [a, b] = full.trim().split(/\s+/); return b ? `${a} ${b[0]}.` : a; };

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private readonly reviews: Model<Review>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Restaurant.name) private readonly restaurants: Model<Restaurant>,
    private readonly notifications: NotificationsService,
    private readonly events: OrderEventsService,
    private readonly audit: AuditService,
  ) {}

  /** Note moyenne recalculée à partir des seuls avis visibles. */
  private async recompute(restaurantId: Types.ObjectId) {
    const [a] = await this.reviews.aggregate<{ avg: number; n: number }>([{ $match: { restaurantId, status: 'VISIBLE' } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
    await this.restaurants.updateOne({ _id: restaurantId }, { ratingAvg: a ? Math.round(a.avg * 10) / 10 : null, ratingCount: a?.n ?? 0 });
  }

  private dto(r: Rv): PublicReview {
    return { id: String(r._id), rating: r.rating, comment: r.comment, authorName: r.authorName, createdAt: r.createdAt.toISOString(), reply: r.reply, repliedAt: r.repliedAt?.toISOString() ?? null };
  }

  async create(userId: string, orderId: Types.ObjectId, input: z.output<typeof reviewSchema>) {
    const o = await this.orders.findOne({ _id: orderId, customerId: new Types.ObjectId(userId) }).setOptions({ crossTenant: true }).lean();
    if (!o) throw notFound('Commande introuvable.');
    if (o.status !== 'DELIVERED') throw unprocessable('NOT_DELIVERED', 'Vous pourrez donner votre avis une fois la commande livrée.');
    try {
      const r = await this.reviews.create({ orderId, restaurantId: o.restaurantId, customerId: o.customerId, authorName: firstNameAndInitial(o.customerSnapshot.name), ...input });
      await this.recompute(o.restaurantId);
      await this.notifications.notify({ userIds: await this.events.restaurantUsers(o.restaurantId, 'reviews.reply'), eventKey: `review:${r._id}:new`, type: 'review.new', title: `Nouvel avis : ${'★'.repeat(input.rating)}`, body: input.comment.slice(0, 120), link: `/pro/${o.restaurantId}/avis` });
      return { id: String(r._id) };
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw conflict('ALREADY_REVIEWED', 'Vous avez déjà donné votre avis sur cette commande.');
      throw e;
    }
  }

  async mineForOrder(userId: string, orderId: Types.ObjectId) {
    const r = (await this.reviews.findOne({ orderId, customerId: new Types.ObjectId(userId) }).lean()) as Rv | null;
    return r ? this.dto(r) : null;
  }

  async publicList(slug: string) {
    const r = await this.restaurants.findOne({ slug, status: 'ACTIVE' }, { _id: 1 }).lean();
    if (!r) throw notFound();
    return ((await this.reviews.find({ restaurantId: r._id, status: 'VISIBLE' }).sort({ createdAt: -1 }).limit(50).lean()) as Rv[]).map((x) => this.dto(x));
  }

  async restaurantList(restaurantId: string) {
    return ((await this.reviews.find({ restaurantId: new Types.ObjectId(restaurantId) }).sort({ createdAt: -1 }).limit(200).lean()) as Rv[]).map((x) => ({ ...this.dto(x), status: x.status }));
  }

  async reply(restaurantId: string, reviewId: Types.ObjectId, reply: string, actor: string, meta: { ip: string | null; userAgent: string | null }) {
    const r = await this.reviews.findOneAndUpdate({ _id: reviewId, restaurantId: new Types.ObjectId(restaurantId) }, { reply, repliedAt: new Date() }, { new: true });
    if (!r) throw notFound();
    await this.audit.record({ actorUserId: actor, scope: 'restaurant', restaurantId, action: 'review.reply', entity: 'review', entityId: String(reviewId), after: { reply }, ...meta });
    return this.dto(r.toObject() as Rv);
  }

  async adminList(status?: string) {
    const list = (await this.reviews.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(300).lean()) as Rv[];
    const rs = await this.restaurants.find({ _id: { $in: list.map((r) => r.restaurantId) } }, { name: 1 }).lean();
    const rName = new Map(rs.map((r) => [String(r._id), r.name]));
    return list.map((r) => ({ ...this.dto(r), status: r.status, moderationReason: r.moderationReason, restaurantName: rName.get(String(r.restaurantId)) ?? '—' }));
  }

  /** Modération : masquage d'un contenu abusif (motif tracé) ; la note est recalculée. */
  async moderate(reviewId: Types.ObjectId, status: 'VISIBLE' | 'HIDDEN', reason: string | null, actor: string, meta: { ip: string | null; userAgent: string | null }) {
    const r = await this.reviews.findByIdAndUpdate(reviewId, { status, moderationReason: reason }, { new: true });
    if (!r) throw notFound();
    await this.recompute(r.restaurantId);
    await this.audit.record({ actorUserId: actor, scope: 'platform', restaurantId: String(r.restaurantId), action: 'review.moderate', entity: 'review', entityId: String(reviewId), after: { status, reason }, ...meta });
    return { id: String(reviewId), status };
  }
}

const moderateBody = z.object({ status: z.enum(['VISIBLE', 'HIDDEN']), reason: z.string().trim().max(300).optional() })
  .refine((m) => m.status === 'VISIBLE' || !!m.reason, { path: ['reason'], message: 'Le motif est obligatoire pour masquer un avis.' });

@ApiTags('avis')
@Controller()
class ReviewsController {
  constructor(private readonly s: ReviewsService) {}
  @Post('orders/:id/review') create(@CurrentAuth() a: AuthContext, @Param('id') id: string, @Body(new ZodPipe(reviewSchema)) b: z.output<typeof reviewSchema>) { return this.s.create(a.userId, toObjectId(id), b); }
  @Get('orders/:id/review') async mine(@CurrentAuth() a: AuthContext, @Param('id') id: string) { return { review: await this.s.mineForOrder(a.userId, toObjectId(id)) }; }
  @Public() @Get('catalog/restaurants/:slug/reviews') publicList(@Param('slug') slug: string) { return this.s.publicList(slug.slice(0, 120)); }
  @Get('restaurants/:restaurantId/reviews') @RequirePermission('reviews.reply') list(@CurrentTenant() t: TenantContext) { return this.s.restaurantList(t.restaurantId); }
  @Post('restaurants/:restaurantId/reviews/:id/reply') @RequirePermission('reviews.reply')
  reply(@CurrentTenant() t: TenantContext, @Param('id') id: string, @Body(new ZodPipe(reviewReplySchema)) b: z.output<typeof reviewReplySchema>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.s.reply(t.restaurantId, toObjectId(id), b.reply, a.userId, requestMeta(r)); }
  @Get('admin/reviews') @RequirePermission('admin.reviews.moderate') adminList(@Query('status') status?: string) { return this.s.adminList(status === 'HIDDEN' || status === 'VISIBLE' ? status : undefined); }
  @Post('admin/reviews/:id/moderate') @RequirePermission('admin.reviews.moderate')
  moderate(@Param('id') id: string, @Body(new ZodPipe(moderateBody)) b: z.output<typeof moderateBody>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.s.moderate(toObjectId(id), b.status, b.reason ?? null, a.userId, requestMeta(r)); }
}

@Global()
@Module({
  imports: [OrdersModule, MongooseModule.forFeature([{ name: Review.name, schema: ReviewSchema }, { name: Order.name, schema: OrderSchema }])],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
