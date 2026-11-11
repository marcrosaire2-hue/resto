import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
import { ORDER_STATUSES, OrderStatus } from '@plateforme/contracts';
import { appendOnlyPlugin, tenantScopedPlugin } from '../../database/plugins';

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, required: true }) productId: Types.ObjectId;
  /** Instantanés au moment de l'achat : l'historique reste exact même si le menu change. */
  @Prop({ type: String, required: true }) name: string;
  @Prop({ type: String, default: '' }) description: string;
  @Prop({ type: String, default: null }) imageUrl: string | null;
  @Prop({ type: Number, required: true }) unitPrice: number;
  @Prop({ type: Number, required: true }) qty: number;
  @Prop({ type: Number, required: true }) lineTotal: number;
  @Prop({ type: Number, default: 0 }) unitDiscount: number;
  @Prop({ type: String, default: null }) promotionId: string | null;
  @Prop({ type: String, default: null }) promotionName: string | null;
  @Prop({ type: [String], default: [] }) optionLabels: string[];
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) selection: unknown;
  @Prop({ type: String, default: '' }) instructions: string;
}

export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUND_PENDING' | 'REFUNDED' | 'NOT_DUE';

@Schema({ collection: 'orders', timestamps: true })
export class Order {
  @Prop({ type: String, required: true, unique: true }) number: string;
  @Prop({ type: Types.ObjectId, required: true }) customerId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) restaurantId: Types.ObjectId;
  @Prop({ type: String, enum: ORDER_STATUSES, required: true }) status: OrderStatus;
  @Prop({ type: String, required: true }) paymentMethod: string;
  @Prop({ type: String, default: 'PENDING' }) paymentStatus: PaymentStatus;
  @Prop({ type: String, required: true }) idempotencyKey: string;
  @Prop({ type: Object, required: true }) customerSnapshot: { name: string; phone: string };
  @Prop({ type: Object, required: true }) addressSnapshot: {
    label: string; neighborhoodId: string; neighborhood: string; commune: string; city: string;
    streetLandmark: string; instructions: string; lat: number | null; lng: number | null;
  };
  @Prop({ type: Object, required: true }) restaurantSnapshot: { name: string; slug: string; phone: string | null; address: string | null };
  @Prop({ type: [OrderItem], required: true }) items: OrderItem[];
  @Prop({ type: Object, required: true }) amounts: { itemsSubtotal: number; restaurantDiscount: number; platformDiscount: number; deliveryFee: number; serviceFee: number; total: number };
  /** Valeurs financières figées (contrat, grille) : jamais recalculées après coup. */
  @Prop({ type: Object, required: true }) finance: {
    commissionRateBps: number; commissionAmount: number; restaurantNet: number; courierPay: number;
    contractId: string; feeRuleId: string; fromZoneId: string; toZoneId: string;
  };
  @Prop({ type: String, required: true, select: false }) deliveryCode: string;
  @Prop({ type: String, default: '' }) customerNote: string;
  @Prop({ type: String, default: null }) rejectReason: string | null;
  @Prop({ type: String, default: null }) cancelReason: string | null;
  @Prop({ type: Date, default: null }) acceptDeadlineAt: Date | null;
  @Prop({ type: Date, default: null }) responseAlertAt: Date | null;
  @Prop({ type: Date, default: null }) courierAlertAt: Date | null;
  @Prop({ type: Types.ObjectId, default: null }) courierId: Types.ObjectId | null;
  @Prop({ type: Number, default: 0 }) delayMinutes: number;
  @Prop({ type: Number, default: 1 }) seq: number;
  @Prop({ type: Date, default: () => new Date() }) statusChangedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true });
OrderSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ customerId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, acceptDeadlineAt: 1 });
OrderSchema.plugin(tenantScopedPlugin);

@Schema({ collection: 'order_status_history', timestamps: { createdAt: true, updatedAt: false } })
export class OrderStatusHistory {
  @Prop({ type: Types.ObjectId, required: true, index: true }) orderId: Types.ObjectId;
  @Prop({ type: String, default: null }) fromStatus: OrderStatus | null;
  @Prop({ type: String, required: true }) toStatus: OrderStatus;
  @Prop({ type: Types.ObjectId, default: null }) actorUserId: Types.ObjectId | null;
  @Prop({ type: String, required: true }) actorKind: string;
  @Prop({ type: String, default: null }) reason: string | null;
  createdAt: Date;
}
export const OrderStatusHistorySchema = SchemaFactory.createForClass(OrderStatusHistory);
OrderStatusHistorySchema.plugin(appendOnlyPlugin);

export type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

/** Signalement lié à une commande (retard cuisine, problème). Traité par les opérations (phase 4 : incidents). */
@Schema({ collection: 'order_issues', timestamps: true })
export class OrderIssue {
  @Prop({ type: Types.ObjectId, required: true }) restaurantId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) orderId: Types.ObjectId;
  @Prop({ type: String, required: true }) type: string;
  @Prop({ type: String, default: '' }) description: string;
  @Prop({ type: Number, default: null }) delayMinutes: number | null;
  @Prop({ type: String, default: 'OPEN' }) status: IssueStatus;
  @Prop({ type: Types.ObjectId, required: true }) reportedBy: Types.ObjectId;
  createdAt: Date;
}
export const OrderIssueSchema = SchemaFactory.createForClass(OrderIssue);
OrderIssueSchema.plugin(tenantScopedPlugin);
