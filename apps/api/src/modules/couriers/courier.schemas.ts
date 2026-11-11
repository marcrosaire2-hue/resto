import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
import { DeliveryStatus } from '@plateforme/contracts';

@Schema({ _id: false })
export class CourierDocument {
  @Prop({ type: String, required: true }) type: string;
  /** Fichier privé Cloudinary (type « authenticated ») : lisible uniquement via une URL signée par l'API. */
  @Prop({ type: String, required: true }) publicId: string;
  @Prop({ type: String, default: 'PENDING' }) status: 'PENDING' | 'APPROVED' | 'REJECTED';
  @Prop({ type: Date, default: () => new Date() }) uploadedAt: Date;
}

export type CourierStatus = 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';

@Schema({ collection: 'couriers', timestamps: true })
export class Courier {
  @Prop({ type: Types.ObjectId, required: true, unique: true }) userId: Types.ObjectId;
  @Prop({ type: String, default: 'PENDING_REVIEW' }) status: CourierStatus;
  @Prop({ type: String, default: null }) statusReason: string | null;
  @Prop({ type: String, required: true }) vehicleType: string;
  @Prop({ type: String, default: null }) plate: string | null;
  @Prop({ type: String, default: null }) photoPublicId: string | null;
  /** Coordonnées de versement (affichées masquées hors administration). */
  @Prop({ type: Object, required: true }) payout: { provider: string; number: string };
  @Prop({ type: [CourierDocument], default: [] }) documents: CourierDocument[];
  @Prop({ type: Boolean, default: false }) isOnline: boolean;
  @Prop({ type: Number, default: null }) lastLat: number | null;
  @Prop({ type: Number, default: null }) lastLng: number | null;
  @Prop({ type: Number, default: null }) lastAccuracy: number | null;
  @Prop({ type: Date, default: null }) lastPositionAt: Date | null;
  @Prop({ type: Types.ObjectId, default: null }) currentDeliveryId: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, default: null }) reviewedBy: Types.ObjectId | null;
  createdAt: Date;
}
export const CourierSchema = SchemaFactory.createForClass(Courier);
CourierSchema.index({ status: 1, isOnline: 1 });

@Schema({ _id: false })
export class DeliveryOffer {
  @Prop({ type: Types.ObjectId, required: true }) courierId: Types.ObjectId;
  @Prop({ type: String, default: 'OFFERED' }) status: 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  @Prop({ type: Date, required: true }) offeredAt: Date;
  @Prop({ type: Date, required: true }) expiresAt: Date;
}

/** Tentative de livraison d'une commande. Une seule tentative active à la fois (réattribution = nouvelle tentative). */
@Schema({ collection: 'deliveries', timestamps: true })
export class Delivery {
  @Prop({ type: Types.ObjectId, required: true, index: true }) orderId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) restaurantId: Types.ObjectId;
  @Prop({ type: Number, default: 1 }) attemptNo: number;
  @Prop({ type: Boolean, default: true }) active: boolean;
  @Prop({ type: String, default: 'SEARCHING' }) status: DeliveryStatus;
  @Prop({ type: Types.ObjectId, default: null }) courierId: Types.ObjectId | null;
  @Prop({ type: Number, required: true }) courierPay: number;
  @Prop({ type: [DeliveryOffer], default: [] }) offers: DeliveryOffer[];
  @Prop({ type: Date, default: null }) assignedAt: Date | null;
  @Prop({ type: Date, default: null }) arrivedPickupAt: Date | null;
  @Prop({ type: Date, default: null }) pickedUpAt: Date | null;
  @Prop({ type: Date, default: null }) arrivedDropoffAt: Date | null;
  @Prop({ type: Date, default: null }) deliveredAt: Date | null;
  @Prop({ type: String, default: null }) endReason: string | null;
  @Prop({ type: Number, default: 0 }) otpAttempts: number;
  @Prop({ type: Object, default: null }) deliveredPosition: { lat: number; lng: number } | null;
  createdAt: Date;
  updatedAt: Date;
}
export const DeliverySchema = SchemaFactory.createForClass(Delivery);
DeliverySchema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { active: true }, name: 'one_active_attempt' });
DeliverySchema.index({ courierId: 1, status: 1 });
DeliverySchema.index({ 'offers.courierId': 1, active: 1 });

@Schema({ _id: false })
export class IncidentEvent {
  @Prop({ type: Date, default: () => new Date() }) at: Date;
  @Prop({ type: Types.ObjectId, default: null }) by: Types.ObjectId | null;
  @Prop({ type: String, required: true }) action: string;
  @Prop({ type: String, default: '' }) note: string;
}

@Schema({ collection: 'incidents', timestamps: true })
export class Incident {
  @Prop({ type: String, required: true }) type: string;
  @Prop({ type: String, required: true }) description: string;
  @Prop({ type: String, default: 'OPEN' }) status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  @Prop({ type: Types.ObjectId, default: null }) orderId: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, default: null }) restaurantId: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, default: null }) courierId: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, default: null }) ownerId: Types.ObjectId | null;
  @Prop({ type: String, default: null }) resolution: string | null;
  @Prop({ type: String, required: true }) source: 'restaurant' | 'courier' | 'ops' | 'system';
  @Prop({ type: Types.ObjectId, default: null }) reportedBy: Types.ObjectId | null;
  @Prop({ type: [IncidentEvent], default: [] }) events: IncidentEvent[];
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) data: unknown;
  createdAt: Date;
  updatedAt: Date;
}
export const IncidentSchema = SchemaFactory.createForClass(Incident);
IncidentSchema.index({ status: 1, createdAt: -1 });
