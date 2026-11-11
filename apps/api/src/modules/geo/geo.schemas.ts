import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ collection: 'cities', timestamps: true })
export class City {
  @Prop({ type: String, required: true, trim: true, unique: true }) name: string;
  @Prop({ type: Boolean, default: true }) active: boolean;
}
export const CitySchema = SchemaFactory.createForClass(City);

@Schema({ collection: 'communes', timestamps: true })
export class Commune {
  @Prop({ type: Types.ObjectId, required: true, index: true }) cityId: Types.ObjectId;
  @Prop({ type: String, required: true, trim: true }) name: string;
  @Prop({ type: Boolean, default: true }) active: boolean;
}
export const CommuneSchema = SchemaFactory.createForClass(Commune);
CommuneSchema.index({ cityId: 1, name: 1 }, { unique: true });

@Schema({ collection: 'neighborhoods', timestamps: true })
export class Neighborhood {
  @Prop({ type: Types.ObjectId, required: true }) cityId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) communeId: Types.ObjectId;
  @Prop({ type: String, required: true, trim: true }) name: string;
  @Prop({ type: Boolean, default: true }) active: boolean;
}
export type NeighborhoodDocument = HydratedDocument<Neighborhood>;
export const NeighborhoodSchema = SchemaFactory.createForClass(Neighborhood);
NeighborhoodSchema.index({ communeId: 1, name: 1 }, { unique: true });

@Schema({ collection: 'delivery_zones', timestamps: true })
export class DeliveryZone {
  @Prop({ type: String, required: true, trim: true, unique: true }) name: string;
  @Prop({ type: Boolean, default: true }) active: boolean;
  @Prop({ type: [Types.ObjectId], default: [] }) neighborhoodIds: Types.ObjectId[];
}
export const DeliveryZoneSchema = SchemaFactory.createForClass(DeliveryZone);

/** Grille versionnée : une règle n'est jamais modifiée, elle est clôturée (validTo) et remplacée. */
@Schema({ collection: 'delivery_fee_rules', timestamps: { createdAt: true, updatedAt: false } })
export class DeliveryFeeRule {
  @Prop({ type: Types.ObjectId, required: true }) fromZoneId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) toZoneId: Types.ObjectId;
  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger }) customerFee: number;
  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger }) courierPay: number;
  @Prop({ type: Date, required: true }) validFrom: Date;
  @Prop({ type: Date, default: null }) validTo: Date | null;
  @Prop({ type: Types.ObjectId, required: true }) createdBy: Types.ObjectId;
}
export const DeliveryFeeRuleSchema = SchemaFactory.createForClass(DeliveryFeeRule);
DeliveryFeeRuleSchema.index({ fromZoneId: 1, toZoneId: 1, validTo: 1 });
