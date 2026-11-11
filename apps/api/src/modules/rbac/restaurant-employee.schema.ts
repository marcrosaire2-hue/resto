import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { tenantScopedPlugin } from '../../database/plugins';

export type MembershipStatus = 'ACTIVE' | 'DISABLED';

/** Affectation d'un utilisateur à un restaurant (collection « tenant »). */
@Schema({ collection: 'restaurant_employees', timestamps: true })
export class RestaurantEmployee {
  @Prop({ type: Types.ObjectId, required: true }) restaurantId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId: Types.ObjectId;
  @Prop({ required: true }) roleCode: string;
  /** Ajustements fins décidés par le propriétaire, bornés au périmètre restaurant. */
  @Prop({ type: [String], default: [] }) granted: string[];
  @Prop({ type: [String], default: [] }) revoked: string[];
  @Prop({ type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' }) status: MembershipStatus;
  @Prop({ type: Types.ObjectId, default: null }) createdBy: Types.ObjectId | null;
}
export type RestaurantEmployeeDocument = HydratedDocument<RestaurantEmployee>;
export const RestaurantEmployeeSchema = SchemaFactory.createForClass(RestaurantEmployee);
RestaurantEmployeeSchema.index({ restaurantId: 1, userId: 1 }, { unique: true });
RestaurantEmployeeSchema.plugin(tenantScopedPlugin);
