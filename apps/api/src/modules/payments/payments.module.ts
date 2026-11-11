import { BadRequestException, Body, Controller, Get, HttpCode, Injectable, Logger, Module, Param, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection, InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { Connection, Model, Types } from 'mongoose';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { env } from '../../common/env';
import { toObjectId } from '../../common/object-id';
import { AppRequest, AuthContext, CurrentAuth, Public, SkipCsrf } from '../../common/request-context';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Order, OrderSchema } from '../orders/order.schema';
import { OrderEventsService } from '../orders/order-events.service';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';
import { SettingsService } from '../settings/settings.service';
import { FedapayClient, FedapayStatus } from './fedapay.client';

export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';

/** Une tentative de paiement en ligne. Plusieurs tentatives possibles par commande ; une seule peut réussir. */
@Schema({ collection: 'payments', timestamps: true })
export class Payment {
  @Prop({ type: Types.ObjectId, required: true, index: true }) orderId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) customerId: Types.ObjectId;
  @Prop({ type: String, required: true }) provider: 'FEDAPAY';
  @Prop({ type: String, required: true, unique: true }) providerRef: string;
  @Prop({ type: Number, required: true }) amount: number;
  @Prop({ type: String, default: 'PENDING' }) status: PaymentStatus;
  @Prop({ type: String, default: null }) providerStatus: string | null;
  @Prop({ type: String, default: null }) checkoutUrl: string | null;
  @Prop({ type: Date, default: null }) confirmedAt: Date | null;
  createdAt: Date;
}
export const PaymentSchema = SchemaFactory.createForClass(Payment);
// Une seule tentative réussie par commande, garantie par la base.
PaymentSchema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { status: 'SUCCEEDED' }, name: 'one_success_per_order' });

/** Notifications brutes reçues du prestataire (traçabilité, anti-doublon). */
@Schema({ collection: 'payment_events', timestamps: { createdAt: true, updatedAt: false } })
export class PaymentEvent {
  @Prop({ type: String, required: true, unique: true }) providerEventId: string;
  @Prop({ type: String, required: true }) provider: string;
  @Prop({ type: String, required: true }) name: string;
  @Prop({ type: String, default: null }) providerRef: string | null;
  @Prop({ type: Boolean, required: true }) signatureValid: boolean;
  @Prop({ type: Object, default: null }) payload: unknown;
}
export const PaymentEventSchema = SchemaFactory.createForClass(PaymentEvent);

const mapStatus = (s: FedapayStatus): PaymentStatus | null =>
  s === 'approved' || s === 'transferred' ? 'SUCCEEDED' : s === 'declined' || s === 'canceled' ? 'FAILED' : s === 'expired' ? 'EXPIRED' : s === 'pending' ? 'PENDING' : null;

type O = Order & { _id: Types.ObjectId };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Paiements');
  constructor(
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(PaymentEvent.name) private readonly events: Model<PaymentEvent>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectConnection() private readonly conn: Connection,
    private readonly fedapay: FedapayClient,
    private readonly ordersService: OrdersService,
    private readonly orderEvents: OrderEventsService,
    private readonly ledger: LedgerService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  methods() {
    return { CASH: true, MOBILE_MONEY: this.fedapay.enabled() };
  }

  private async customerOrder(userId: string, orderId: Types.ObjectId) {
    const o = (await this.orders.findOne({ _id: orderId, customerId: new Types.ObjectId(userId) }).setOptions({ crossTenant: true }).lean()) as O | null;
    if (!o) throw notFound('Commande introuvable.');
    return o;
  }

  /** Démarre (ou reprend) le paiement : renvoie le lien de la page de paiement sécurisée FedaPay. */
  async start(userId: string, orderId: Types.ObjectId) {
    const o = await this.customerOrder(userId, orderId);
    if (o.paymentMethod !== 'MOBILE_MONEY') throw unprocessable('NOT_ONLINE', 'Cette commande se règle en espèces à la livraison.');
    if (o.status !== 'AWAITING_PAYMENT') throw unprocessable('NOT_AWAITING_PAYMENT', 'Cette commande n’attend pas de paiement.');
    if (!this.fedapay.enabled()) throw new ServiceUnavailableException({ statusCode: 503, error: 'PAYMENT_UNAVAILABLE', message: 'Le paiement Mobile Money n’est pas disponible pour le moment.' });

    // Reprise d'une tentative en cours (après vérification de son état réel chez FedaPay).
    const pending = await this.payments.findOne({ orderId, status: 'PENDING' }).sort({ createdAt: -1 }).lean();
    if (pending) {
      const r = await this.reconcile(pending.providerRef);
      if (r === 'SUCCEEDED') return { paid: true, url: null };
      if (r === 'PENDING' && pending.checkoutUrl && Date.now() - pending.createdAt.getTime() < 20 * 60_000) return { paid: false, url: pending.checkoutUrl };
    }
    const attempt = (await this.payments.countDocuments({ orderId })) + 1;
    const [firstname, ...rest] = o.customerSnapshot.name.trim().split(/\s+/);
    const tx = await this.fedapay.createTransaction({
      amount: o.amounts.total, description: `Commande ${o.number} — ${o.restaurantSnapshot.name}`,
      callbackUrl: `${env().APP_PUBLIC_URL}/commandes/${o._id}?paiement=retour`,
      merchantReference: `${o.number}-${attempt}`,
      customer: { firstname: firstname || 'Client', lastname: rest.join(' ') || firstname || 'Client', phone: o.customerSnapshot.phone },
    });
    const tok = await this.fedapay.token(tx.id);
    await this.payments.create({ orderId, customerId: o.customerId, provider: 'FEDAPAY', providerRef: String(tx.id), amount: o.amounts.total, providerStatus: tx.status, checkoutUrl: tok.url });
    return { paid: false, url: tok.url };
  }

  /** Vérification à la demande du client (retour de la page de paiement). */
  async refresh(userId: string, orderId: Types.ObjectId) {
    await this.customerOrder(userId, orderId);
    const last = await this.payments.findOne({ orderId }).sort({ createdAt: -1 }).lean();
    if (!last) return { status: null };
    return { status: last.status === 'PENDING' ? await this.reconcile(last.providerRef) : last.status };
  }

  /** Webhook : signature vérifiée, événement dédoublonné, puis état relu chez FedaPay (seule source de vérité). */
  async webhook(raw: Buffer | undefined, signature: string | undefined) {
    if (!raw) throw new BadRequestException();
    const configured = !!env().FEDAPAY_WEBHOOK_SECRET;
    if (!configured && env().NODE_ENV === 'production') throw new ServiceUnavailableException('Webhook non configuré');
    const valid = configured && this.fedapay.verifySignature(raw, signature);
    if (configured && !valid) throw new BadRequestException('Signature invalide');
    let body: { id?: number | string; name?: string; entity?: { id?: number } };
    try { body = JSON.parse(raw.toString('utf8')); } catch { throw new BadRequestException(); }
    const ref = body.entity?.id != null ? String(body.entity.id) : null;
    const eventId = body.id != null ? String(body.id) : `${body.name}:${ref}`;
    try {
      await this.events.create({ providerEventId: `fedapay:${eventId}`, provider: 'FEDAPAY', name: String(body.name ?? 'inconnu'), providerRef: ref, signatureValid: valid, payload: body });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return { received: true, duplicate: true };
      throw e;
    }
    // Sans secret (développement uniquement), l'événement n'est qu'un signal : l'état est toujours relu chez FedaPay.
    if (ref && (await this.payments.exists({ providerRef: ref }))) await this.reconcile(ref);
    return { received: true };
  }

  /** Rapproche une tentative avec l'état réel de la transaction FedaPay. Idempotent. */
  async reconcile(providerRef: string): Promise<PaymentStatus> {
    const p = await this.payments.findOne({ providerRef }).lean();
    if (!p) throw notFound();
    if (p.status !== 'PENDING') return p.status;
    const tx = await this.fedapay.retrieve(Number(providerRef));
    const status = mapStatus(tx.status);
    if (!status || status === 'PENDING') return 'PENDING';
    if (status === 'SUCCEEDED' && tx.amount !== p.amount) {
      this.logger.error(`Montant FedaPay ${tx.amount} ≠ montant attendu ${p.amount} (transaction ${providerRef}) : paiement non validé.`);
      await this.notifications.notify({ userIds: await this.orderEvents.opsUsers(), eventKey: `payment:${providerRef}:mismatch`, type: 'payment.mismatch', title: 'Écart de montant sur un paiement', body: `Transaction FedaPay ${providerRef} : à vérifier.`, link: '/operations' });
      return 'PENDING';
    }
    if (status !== 'SUCCEEDED') {
      await this.payments.updateOne({ _id: p._id, status: 'PENDING' }, { status, providerStatus: tx.status });
      return status;
    }
    return this.confirm(p._id, p.orderId, p.amount, tx.status);
  }

  private async confirm(paymentId: Types.ObjectId, orderId: Types.ObjectId, amount: number, providerStatus: string): Promise<PaymentStatus> {
    const session = await this.conn.startSession();
    let won = false;
    try {
      await session.withTransaction(async () => {
        const r = await this.payments.updateOne({ _id: paymentId, status: 'PENDING' }, { status: 'SUCCEEDED', providerStatus, confirmedAt: new Date() }, { session });
        if (r.modifiedCount !== 1) return;
        won = true;
        await this.orders.updateOne({ _id: orderId }, { paymentStatus: 'SUCCEEDED' }, { session }).setOptions({ crossTenant: true });
        await this.ledger.post('payment.received', String(paymentId), [
          { account: 'clearing:provider:fedapay', debit: amount },
          { account: 'liability:customer_prepayments', credit: amount },
        ], { description: 'Paiement Mobile Money confirmé (FedaPay)', session });
      });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw conflict('ALREADY_PAID', 'Cette commande est déjà payée.');
      throw e;
    } finally {
      await session.endSession();
    }
    if (!won) return 'SUCCEEDED';
    const o = (await this.orders.findOne({ _id: orderId }).setOptions({ crossTenant: true }).lean()) as O;
    if (o.status === 'AWAITING_PAYMENT') {
      const minutes = await this.settings.get('orders.restaurant_response_minutes');
      await this.ordersService.transition(o, 'PENDING', { kind: 'system', userId: null }, null, minutes ? { acceptDeadlineAt: new Date(Date.now() + minutes * 60_000) } : {});
      await this.orderEvents.created(String(orderId)).catch((e) => this.logger.error((e as Error).message));
    } else {
      // Paiement arrivé après l'annulation : l'argent est encaissé, un remboursement doit être traité.
      await this.notifications.notify({ userIds: await this.orderEvents.opsUsers(), eventKey: `payment:${paymentId}:after-cancel`, type: 'payment.refund_needed', title: `Paiement reçu sur la commande annulée ${o.number}`, body: `${amount} FCFA à rembourser au client.`, link: '/admin/finances' });
    }
    return 'SUCCEEDED';
  }
}

@ApiTags('paiements')
@Controller()
class PaymentsController {
  constructor(private readonly s: PaymentsService) {}
  @Public() @Get('payments/methods') methods() { return this.s.methods(); }
  @Post('orders/:id/payments') start(@CurrentAuth() a: AuthContext, @Param('id') id: string) { return this.s.start(a.userId, toObjectId(id)); }
  @Post('orders/:id/payments/refresh') refresh(@CurrentAuth() a: AuthContext, @Param('id') id: string) { return this.s.refresh(a.userId, toObjectId(id)); }
  @Public() @SkipCsrf() @Post('payments/fedapay/webhook') @HttpCode(200)
  webhook(@Req() r: AppRequest & { rawBody?: Buffer }, @Body() _b: unknown) { return this.s.webhook(r.rawBody, r.headers['x-fedapay-signature'] as string | undefined); }
}

@Module({
  imports: [OrdersModule, MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }, { name: PaymentEvent.name, schema: PaymentEventSchema }, { name: Order.name, schema: OrderSchema }])],
  controllers: [PaymentsController],
  providers: [PaymentsService, FedapayClient],
  exports: [PaymentsService, FedapayClient],
})
export class PaymentsModule {}
