import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ collection: 'customer_addresses', timestamps: true })
export class CustomerAddress {
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId: Types.ObjectId;
  @Prop({ type: String, required: true }) label: string;
  @Prop({ type: Types.ObjectId, required: true }) neighborhoodId: Types.ObjectId;
  @Prop({ type: String, required: true }) streetLandmark: string;
  @Prop({ type: String, default: '' }) instructions: string;
  @Prop({ type: Number, default: null }) lat: number | null;
  @Prop({ type: Number, default: null }) lng: number | null;
  @Prop({ type: Boolean, default: false }) isDefault: boolean;
  @Prop({ type: Date, default: null }) archivedAt: Date | null;
}
export const CustomerAddressSchema = SchemaFactory.createForClass(CustomerAddress);

@Schema({ _id: false })
export class CartItem {
  @Prop({ type: String, required: true }) key: string;
  @Prop({ type: Types.ObjectId, required: true }) productId: Types.ObjectId;
  @Prop({ type: Number, required: true }) qty: number;
  @Prop({ type: Object, default: {} }) variants: Record<string, string>;
  @Prop({ type: [String], default: [] }) addons: string[];
  @Prop({ type: String, default: '' }) instructions: string;
}

/** Panier serveur : un panier par client, un seul restaurant (docs/04). */
@Schema({ collection: 'carts', timestamps: true })
export class Cart {
  @Prop({ type: Types.ObjectId, required: true, unique: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, default: null }) restaurantId: Types.ObjectId | null;
  @Prop({ type: [CartItem], default: [] }) items: CartItem[];
  @Prop({ type: String, default: null }) couponCode: string | null;
}
export const CartSchema = SchemaFactory.createForClass(Cart);
