import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ collection: 'coupons', timestamps: true })
export class Coupon {
  @Prop({ type: String, required: true, unique: true }) code: string;
  @Prop({ type: String, default: '' }) description: string;
  @Prop({ type: String, enum: ['PERCENT', 'FIXED'], required: true }) type: 'PERCENT' | 'FIXED';
  @Prop({ type: Number, required: true }) value: number;
  @Prop({ type: Number, default: null }) maxDiscount: number | null;
  @Prop({ type: Number, default: 0 }) minItemsSubtotal: number;
  @Prop({ type: Date, required: true }) startsAt: Date;
  @Prop({ type: Date, required: true }) endsAt: Date;
  @Prop({ type: Number, default: null }) maxUses: number | null;
  @Prop({ type: Number, default: 0 }) uses: number;
  @Prop({ type: Number, default: 1 }) perUserLimit: number;
  @Prop({ type: [Types.ObjectId], default: [] }) restaurantIds: Types.ObjectId[];
  @Prop({ type: Boolean, default: true }) active: boolean;
  @Prop({ type: Types.ObjectId, required: true }) createdBy: Types.ObjectId;
}
export const CouponSchema = SchemaFactory.createForClass(Coupon);

@Schema({ collection: 'coupon_redemptions', timestamps: { createdAt: true, updatedAt: false } })
export class CouponRedemption {
  @Prop({ type: Types.ObjectId, required: true, index: true }) couponId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, unique: true }) orderId: Types.ObjectId;
  @Prop({ type: Number, required: true }) discount: number;
}
export const CouponRedemptionSchema = SchemaFactory.createForClass(CouponRedemption);
CouponRedemptionSchema.index({ couponId: 1, userId: 1 });

@Schema({ collection: 'subscription_plans', timestamps: true })
export class SubscriptionPlan {
  @Prop({ type: String, required: true, unique: true }) code: string;
  @Prop({ type: String, required: true }) name: string;
  @Prop({ type: Number, required: true }) monthlyPrice: number;
  @Prop({ type: Number, default: null }) maxProducts: number | null;
  @Prop({ type: [String], default: [] }) features: string[];
  @Prop({ type: Boolean, default: true }) active: boolean;
}
export const SubscriptionPlanSchema = SchemaFactory.createForClass(SubscriptionPlan);

@Schema({ collection: 'restaurant_subscriptions', timestamps: true })
export class RestaurantSubscription {
  @Prop({ type: Types.ObjectId, required: true, index: true }) restaurantId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) planId: Types.ObjectId;
  @Prop({ type: Date, required: true }) startsAt: Date;
  @Prop({ type: Date, default: null }) endsAt: Date | null;
  @Prop({ type: String, default: 'ACTIVE' }) status: 'ACTIVE' | 'ENDED';
  @Prop({ type: Number, required: true }) monthlyPrice: number;
  @Prop({ type: Types.ObjectId, required: true }) createdBy: Types.ObjectId;
}
export const RestaurantSubscriptionSchema = SchemaFactory.createForClass(RestaurantSubscription);

@Schema({ collection: 'ad_campaigns', timestamps: true })
export class AdCampaign {
  @Prop({ type: Types.ObjectId, required: true, index: true }) restaurantId: Types.ObjectId;
  @Prop({ type: String, required: true }) placement: 'TOP_LIST' | 'FEATURED_PRODUCT' | 'BANNER';
  @Prop({ type: Types.ObjectId, default: null }) productId: Types.ObjectId | null;
  @Prop({ type: String, default: '' }) title: string;
  @Prop({ type: String, default: null }) imagePublicId: string | null;
  @Prop({ type: Date, required: true }) startsAt: Date;
  @Prop({ type: Date, required: true }) endsAt: Date;
  @Prop({ type: Number, required: true }) price: number;
  @Prop({ type: Boolean, default: false }) paid: boolean;
  @Prop({ type: Boolean, default: true }) active: boolean;
  @Prop({ type: Types.ObjectId, required: true }) createdBy: Types.ObjectId;
}
export const AdCampaignSchema = SchemaFactory.createForClass(AdCampaign);
AdCampaignSchema.index({ placement: 1, active: 1, endsAt: 1 });

@Schema({ collection: 'home_sections', timestamps: true })
export class HomeSection {
  @Prop({ type: String, required: true }) type: string;
  @Prop({ type: String, required: true }) title: string;
  @Prop({ type: Number, default: 0 }) sort: number;
  @Prop({ type: Boolean, default: true }) active: boolean;
  @Prop({ type: [Types.ObjectId], default: [] }) restaurantIds: Types.ObjectId[];
}
export const HomeSectionSchema = SchemaFactory.createForClass(HomeSection);

export const GROWTH_SCHEMAS = [
  { name: Coupon.name, schema: CouponSchema },
  { name: CouponRedemption.name, schema: CouponRedemptionSchema },
  { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
  { name: RestaurantSubscription.name, schema: RestaurantSubscriptionSchema },
  { name: AdCampaign.name, schema: AdCampaignSchema },
  { name: HomeSection.name, schema: HomeSectionSchema },
];
