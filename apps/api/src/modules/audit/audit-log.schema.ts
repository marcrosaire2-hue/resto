import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { appendOnlyPlugin } from '../../database/plugins';

export type AuditScope = 'platform' | 'restaurant' | 'self' | 'system';

@Schema({ collection: 'audit_logs', timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: Types.ObjectId, default: null, index: true }) actorUserId: Types.ObjectId | null;
  @Prop({ type: String, required: true, enum: ['platform', 'restaurant', 'self', 'system'] }) scope: AuditScope;
  @Prop({ type: Types.ObjectId, default: null }) restaurantId: Types.ObjectId | null;
  @Prop({ required: true }) action: string;
  @Prop({ required: true }) entity: string;
  @Prop({ type: String, default: null }) entityId: string | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) before: unknown;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) after: unknown;
  @Prop({ type: String, default: null }) ip: string | null;
  @Prop({ type: String, default: null }) userAgent: string | null;
  createdAt: Date;
}
export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ restaurantId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.plugin(appendOnlyPlugin);
