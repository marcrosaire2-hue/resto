import { Body, Controller, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { Model, Types } from 'mongoose';
import { z } from 'zod';
import { ticketMessageSchema, ticketSchema } from '@plateforme/contracts';
import { notFound, unprocessable } from '../../common/errors';
import { toObjectId } from '../../common/object-id';
import { AuthContext, CurrentAuth } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { NotificationsService } from '../notifications/notifications.service';
import { Order, OrderSchema } from '../orders/order.schema';
import { OrdersModule } from '../orders/orders.module';
import { OrderEventsService } from '../orders/order-events.service';
import { RequirePermission } from '../rbac/require-permission';
import { User, UserSchema } from '../users/user.schema';

@Schema({ _id: false })
class TicketMessage {
  @Prop({ type: Types.ObjectId, required: true }) authorId: Types.ObjectId;
  @Prop({ type: Boolean, default: false }) staff: boolean;
  @Prop({ type: String, required: true }) body: string;
  @Prop({ type: Date, default: () => new Date() }) at: Date;
}

export type TicketStatus = 'OPEN' | 'PENDING_CUSTOMER' | 'RESOLVED' | 'CLOSED';

@Schema({ collection: 'support_tickets', timestamps: true })
export class SupportTicket {
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId: Types.ObjectId;
  @Prop({ type: String, required: true }) subject: string;
  @Prop({ type: Types.ObjectId, default: null }) orderId: Types.ObjectId | null;
  @Prop({ type: String, default: 'OPEN' }) status: TicketStatus;
  @Prop({ type: Types.ObjectId, default: null }) assigneeId: Types.ObjectId | null;
  @Prop({ type: [TicketMessage], default: [] }) messages: TicketMessage[];
  createdAt: Date;
  updatedAt: Date;
}
export const SupportTicketSchema = SchemaFactory.createForClass(SupportTicket);
SupportTicketSchema.index({ status: 1, updatedAt: -1 });

type T = SupportTicket & { _id: Types.ObjectId };

/** Assistance : un utilisateur ne voit que ses demandes ; l'équipe support les traite. */
@Injectable()
export class SupportService {
  constructor(
    @InjectModel(SupportTicket.name) private readonly tickets: Model<SupportTicket>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly notifications: NotificationsService,
    private readonly events: OrderEventsService,
  ) {}

  private dto(t: T, staffView = false) {
    return {
      id: String(t._id), subject: t.subject, orderId: t.orderId ? String(t.orderId) : null, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt,
      assigneeId: staffView && t.assigneeId ? String(t.assigneeId) : undefined,
      messages: t.messages.map((m) => ({ staff: m.staff, body: m.body, at: m.at, mine: !m.staff })),
    };
  }

  private async supportUsers() {
    return (await this.events.opsUsers()); // l'équipe opérations reçoit aussi les tickets ; affinable par rôle support
  }

  async create(userId: string, input: z.output<typeof ticketSchema>) {
    let orderId: Types.ObjectId | null = null;
    if (input.orderId) {
      const o = await this.orders.findOne({ _id: input.orderId, customerId: new Types.ObjectId(userId) }).setOptions({ crossTenant: true }).lean();
      if (!o) throw notFound('Commande introuvable.');
      orderId = o._id;
    }
    const t = await this.tickets.create({ userId: new Types.ObjectId(userId), subject: input.subject, orderId, messages: [{ authorId: new Types.ObjectId(userId), staff: false, body: input.message }] });
    await this.notifications.notify({ userIds: await this.supportUsers(), eventKey: `ticket:${t._id}:open`, type: 'ticket.open', title: `Nouvelle demande d’assistance`, body: input.subject, link: '/admin/support' });
    return { id: String(t._id) };
  }

  async mine(userId: string) {
    return ((await this.tickets.find({ userId: new Types.ObjectId(userId) }).sort({ updatedAt: -1 }).limit(50).lean()) as T[]).map((t) => this.dto(t));
  }

  async getMine(userId: string, id: Types.ObjectId) {
    const t = (await this.tickets.findOne({ _id: id, userId: new Types.ObjectId(userId) }).lean()) as T | null;
    if (!t) throw notFound();
    return this.dto(t);
  }

  async replyAsUser(userId: string, id: Types.ObjectId, body: string) {
    const t = await this.tickets.findOneAndUpdate({ _id: id, userId: new Types.ObjectId(userId), status: { $ne: 'CLOSED' } },
      { $push: { messages: { authorId: new Types.ObjectId(userId), staff: false, body, at: new Date() } }, status: 'OPEN' }, { new: true }).lean();
    if (!t) throw unprocessable('CLOSED', 'Cette demande est clôturée : ouvrez-en une nouvelle.');
    if (t.assigneeId) await this.notifications.notify({ userIds: [t.assigneeId], eventKey: `ticket:${id}:user:${t.messages.length}`, type: 'ticket.reply', title: `Réponse client : ${t.subject}`, body: body.slice(0, 120), link: '/admin/support' });
    return this.dto(t as T);
  }

  async staffList(status?: string) {
    const f = status === 'open' ? { status: { $in: ['OPEN', 'PENDING_CUSTOMER'] } } : status ? { status } : {};
    const list = (await this.tickets.find(f).sort({ updatedAt: -1 }).limit(200).lean()) as T[];
    const us = await this.users.find({ _id: { $in: list.map((t) => t.userId) } }, { fullName: 1, phone: 1 }).lean();
    const byId = new Map(us.map((u) => [String(u._id), u]));
    return list.map((t) => ({ ...this.dto(t, true), customer: { name: byId.get(String(t.userId))?.fullName ?? '—', phone: byId.get(String(t.userId))?.phone ?? null } }));
  }

  async staffReply(actor: string, id: Types.ObjectId, body: string) {
    const t = await this.tickets.findOneAndUpdate({ _id: id, status: { $ne: 'CLOSED' } },
      { $push: { messages: { authorId: new Types.ObjectId(actor), staff: true, body, at: new Date() } }, status: 'PENDING_CUSTOMER' }, { new: true }).lean();
    if (!t) throw notFound();
    if (!t.assigneeId) await this.tickets.updateOne({ _id: id }, { assigneeId: new Types.ObjectId(actor) });
    await this.notifications.notify({ userIds: [t.userId], eventKey: `ticket:${id}:staff:${t.messages.length}`, type: 'ticket.reply', title: `Réponse de l’assistance : ${t.subject}`, body: body.slice(0, 120), link: '/aide' });
    return this.dto(t as T, true);
  }

  async staffUpdate(actor: string, id: Types.ObjectId, patch: { status?: TicketStatus; assignToMe?: boolean }) {
    const set: Record<string, unknown> = {};
    if (patch.status) set.status = patch.status;
    if (patch.assignToMe) set.assigneeId = new Types.ObjectId(actor);
    const t = await this.tickets.findByIdAndUpdate(id, set, { new: true }).lean();
    if (!t) throw notFound();
    if (patch.status === 'RESOLVED') await this.notifications.notify({ userIds: [t.userId], eventKey: `ticket:${id}:resolved:${Date.now()}`, type: 'ticket.resolved', title: `Demande résolue : ${t.subject}`, body: '', link: '/aide' });
    return this.dto(t as T, true);
  }
}

const updateBody = z.object({ status: z.enum(['OPEN', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED']).optional(), assignToMe: z.boolean().optional() });

@ApiTags('assistance')
@Controller()
class SupportController {
  constructor(private readonly s: SupportService) {}
  @Post('support/tickets') create(@CurrentAuth() a: AuthContext, @Body(new ZodPipe(ticketSchema)) b: z.output<typeof ticketSchema>) { return this.s.create(a.userId, b); }
  @Get('support/tickets') mine(@CurrentAuth() a: AuthContext) { return this.s.mine(a.userId); }
  @Get('support/tickets/:id') getMine(@CurrentAuth() a: AuthContext, @Param('id') id: string) { return this.s.getMine(a.userId, toObjectId(id)); }
  @Post('support/tickets/:id/messages') reply(@CurrentAuth() a: AuthContext, @Param('id') id: string, @Body(new ZodPipe(ticketMessageSchema)) b: z.output<typeof ticketMessageSchema>) { return this.s.replyAsUser(a.userId, toObjectId(id), b.body); }
  @Get('admin/tickets') @RequirePermission('support.tickets.manage') staffList(@Query('status') status?: string) { return this.s.staffList(status); }
  @Post('admin/tickets/:id/messages') @RequirePermission('support.tickets.manage') staffReply(@CurrentAuth() a: AuthContext, @Param('id') id: string, @Body(new ZodPipe(ticketMessageSchema)) b: z.output<typeof ticketMessageSchema>) { return this.s.staffReply(a.userId, toObjectId(id), b.body); }
  @Patch('admin/tickets/:id') @RequirePermission('support.tickets.manage') staffUpdate(@CurrentAuth() a: AuthContext, @Param('id') id: string, @Body(new ZodPipe(updateBody)) b: z.output<typeof updateBody>) { return this.s.staffUpdate(a.userId, toObjectId(id), b); }
}

@Module({
  imports: [OrdersModule, MongooseModule.forFeature([{ name: SupportTicket.name, schema: SupportTicketSchema }, { name: Order.name, schema: OrderSchema }, { name: User.name, schema: UserSchema }])],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
