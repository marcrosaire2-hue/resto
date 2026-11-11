import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/** Contrat commercial d'un restaurant, versionné : un nouveau taux clôture l'ancien, jamais de modification. */
@Schema({ collection: 'restaurant_contracts', timestamps: { createdAt: true, updatedAt: false } })
export class RestaurantContract {
  @Prop({ type: Types.ObjectId, required: true, index: true }) restaurantId: Types.ObjectId;
  @Prop({ type: Number, required: true, min: 0, max: 10_000, validate: Number.isInteger }) commissionRateBps: number;
  @Prop({ type: Date, required: true }) validFrom: Date;
  @Prop({ type: Date, default: null }) validTo: Date | null;
  @Prop({ type: String, default: null }) reference: string | null;
  @Prop({ type: Types.ObjectId, required: true }) createdBy: Types.ObjectId;
}
export const RestaurantContractSchema = SchemaFactory.createForClass(RestaurantContract);
RestaurantContractSchema.index({ restaurantId: 1, validTo: 1 });
