import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ collection: 'platform_staff', timestamps: true })
export class PlatformStaff {
  @Prop({ type: Types.ObjectId, required: true, unique: true }) userId: Types.ObjectId;
  @Prop({ required: true }) roleCode: string;
  @Prop({ type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' }) status: 'ACTIVE' | 'DISABLED';
  @Prop({ type: Types.ObjectId, default: null }) createdBy: Types.ObjectId | null;
}
export type PlatformStaffDocument = HydratedDocument<PlatformStaff>;
export const PlatformStaffSchema = SchemaFactory.createForClass(PlatformStaff);
