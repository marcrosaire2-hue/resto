import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type RestaurantStatus = 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';

@Schema({ _id: false })
export class OpeningSlotDoc {
  @Prop({ type: Number, required: true, min: 0, max: 6 }) weekday: number;
  @Prop({ type: String, required: true }) opens: string;
  @Prop({ type: String, required: true }) closes: string;
}
@Schema({ _id: false })
export class ClosureDoc {
  @Prop({ type: Date, required: true }) from: Date;
  @Prop({ type: Date, required: true }) to: Date;
  @Prop({ type: String, default: null }) reason: string | null;
}

/**
 * Restaurant. Les champs « vitrine » publiés sont à la racine ; `draft` contient les modifications
 * en cours, visibles en aperçu par le restaurant et copiées à la racine lors de la publication.
 */
@Schema({ collection: 'restaurants', timestamps: true })
export class Restaurant {
  @Prop({ type: String, required: true, trim: true, maxlength: 120 }) name: string;
  @Prop({ type: String, required: true, unique: true }) slug: string;
  @Prop({ type: String, enum: ['PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'REJECTED'], default: 'PENDING_REVIEW' }) status: RestaurantStatus;
  @Prop({ type: String, default: null }) statusReason: string | null;
  @Prop({ type: Types.ObjectId, required: true }) createdBy: Types.ObjectId;

  @Prop({ type: String, default: '' }) description: string;
  @Prop({ type: String, default: null }) phone: string | null;
  @Prop({ type: String, default: null }) whatsapp: string | null;
  @Prop({ type: String, default: null }) email: string | null;
  @Prop({ type: String, default: null }) address: string | null;
  @Prop({ type: Types.ObjectId, default: null }) neighborhoodId: Types.ObjectId | null;
  @Prop({ type: [Types.ObjectId], default: [] }) cuisineIds: Types.ObjectId[];
  @Prop({ type: Number, default: 30 }) avgPrepMinutes: number;
  @Prop({ type: String, default: null }) logoPublicId: string | null;
  @Prop({ type: String, default: null }) coverPublicId: string | null;

  @Prop({ type: Boolean, default: false }) acceptingOrders: boolean;
  @Prop({ type: [OpeningSlotDoc], default: [] }) openingHours: OpeningSlotDoc[];
  @Prop({ type: [ClosureDoc], default: [] }) closures: ClosureDoc[];
  @Prop({ type: [Types.ObjectId], default: [] }) zoneIds: Types.ObjectId[];

  @Prop({ type: Number, default: null }) ratingAvg: number | null;
  @Prop({ type: Number, default: 0 }) ratingCount: number;
  @Prop({ type: Date, default: null }) publishedAt: Date | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) draft: Record<string, unknown> | null;
  @Prop({ type: String, default: '' }) searchText: string;
  /** Contenu de démonstration (script seed:demo) : affiché avec la mention « Démo », interdit en production. */
  @Prop({ type: Boolean, default: false }) isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export type RestaurantDocument = HydratedDocument<Restaurant>;
export const RestaurantSchema = SchemaFactory.createForClass(Restaurant);
RestaurantSchema.index({ status: 1, publishedAt: -1 });
RestaurantSchema.index({ cuisineIds: 1 });
