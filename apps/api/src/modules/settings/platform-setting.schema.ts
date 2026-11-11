import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ collection: 'platform_settings', timestamps: true })
export class PlatformSetting {
  @Prop({ required: true, unique: true }) key: string;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) value: unknown;
  @Prop({ type: Types.ObjectId, default: null }) updatedBy: Types.ObjectId | null;
  updatedAt: Date;
}
export const PlatformSettingSchema = SchemaFactory.createForClass(PlatformSetting);
