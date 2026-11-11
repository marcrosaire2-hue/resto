import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { tenantScopedPlugin } from '../../database/plugins';

/** Promotion d'un restaurant (collection « tenant »). Le prix promotionnel est toujours calculé côté serveur. */
@Schema({ collection: 'promotions', timestamps: true })
export class Promotion {
  @Prop({ type: Types.ObjectId, required: true }) restaurantId: Types.ObjectId;
  @Prop({ type: String, required: true }) name: string;
  @Prop({ type: String, enum: ['PERCENT', 'FIXED'], required: true }) type: 'PERCENT' | 'FIXED';
  @Prop({ type: Number, required: true, validate: Number.isInteger }) value: number;
  @Prop({ type: [Types.ObjectId], default: [] }) productIds: Types.ObjectId[];
  @Prop({ type: Date, required: true }) startsAt: Date;
  @Prop({ type: Date, required: true }) endsAt: Date;
  @Prop({ type: Number, default: 0 }) minItemsSubtotal: number;
  @Prop({ type: Boolean, default: true }) active: boolean;
  @Prop({ type: Types.ObjectId, required: true }) createdBy: Types.ObjectId;
}
export const PromotionSchema = SchemaFactory.createForClass(Promotion);
PromotionSchema.index({ restaurantId: 1, active: 1, endsAt: 1 });
PromotionSchema.plugin(tenantScopedPlugin);
