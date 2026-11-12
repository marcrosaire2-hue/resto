import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/** Reversement d'espèces par un livreur, avec reçu numéroté. */
@Schema({ collection: 'courier_cash_remittances', timestamps: { createdAt: true, updatedAt: false } })
export class CashRemittance {
  @Prop({ type: Types.ObjectId, required: true, index: true }) courierId: Types.ObjectId;
  @Prop({ type: Number, required: true, min: 1, validate: Number.isInteger }) amount: number;
  @Prop({ type: String, required: true, unique: true }) receiptNumber: string;
  @Prop({ type: Types.ObjectId, required: true }) receivedBy: Types.ObjectId;
  @Prop({ type: String, default: '' }) note: string;
  createdAt: Date;
}
export const CashRemittanceSchema = SchemaFactory.createForClass(CashRemittance);

export type PayoutStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED';

/** Versement à un restaurant ou à un livreur : demandé, approuvé par une autre personne, puis exécuté avec référence. */
@Schema({ collection: 'payouts', timestamps: true })
export class Payout {
  @Prop({ type: String, enum: ['RESTAURANT', 'COURIER'], required: true }) beneficiaryType: 'RESTAURANT' | 'COURIER';
  @Prop({ type: Types.ObjectId, required: true, index: true }) beneficiaryId: Types.ObjectId;
  @Prop({ type: Number, required: true, min: 1, validate: Number.isInteger }) amount: number;
  @Prop({ type: String, required: true }) method: string;
  @Prop({ type: String, default: 'PENDING_APPROVAL' }) status: PayoutStatus;
  @Prop({ type: String, default: '' }) note: string;
  @Prop({ type: String, default: null }) reference: string | null;
  @Prop({ type: Types.ObjectId, required: true }) requestedBy: Types.ObjectId;
  @Prop({ type: Types.ObjectId, default: null }) approvedBy: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, default: null }) paidBy: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) paidAt: Date | null;
  @Prop({ type: String, default: null }) rejectReason: string | null;
  createdAt: Date;
}
export const PayoutSchema = SchemaFactory.createForClass(Payout);

export type RefundStatus = 'REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED';

/** Remboursement : vérifié sur le paiement initial, approuvé (double validation au-delà du seuil), exécuté avec référence. */
@Schema({ collection: 'refunds', timestamps: true })
export class Refund {
  @Prop({ type: Types.ObjectId, required: true, index: true }) orderId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) restaurantId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) customerId: Types.ObjectId;
  @Prop({ type: Number, required: true, min: 1, validate: Number.isInteger }) amount: number;
  @Prop({ type: String, required: true }) reason: string;
  @Prop({ type: String, enum: ['RESTAURANT', 'PLATFORM'], required: true }) borneBy: 'RESTAURANT' | 'PLATFORM';
  @Prop({ type: String, default: 'REQUESTED' }) status: RefundStatus;
  @Prop({ type: Number, required: true }) requiredApprovals: number;
  @Prop({ type: [Types.ObjectId], default: [] }) approvals: Types.ObjectId[];
  @Prop({ type: Types.ObjectId, required: true }) requestedBy: Types.ObjectId;
  @Prop({ type: String, default: null }) method: string | null;
  @Prop({ type: String, default: null }) reference: string | null;
  @Prop({ type: Types.ObjectId, default: null }) paidBy: Types.ObjectId | null;
  @Prop({ type: String, default: null }) rejectReason: string | null;
  createdAt: Date;
}
export const RefundSchema = SchemaFactory.createForClass(Refund);
