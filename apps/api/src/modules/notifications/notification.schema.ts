import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

/** Notification dans l'application. (userId, eventKey) unique : un même événement n'est jamais notifié deux fois. */
@Schema({ collection: 'notifications', timestamps: { createdAt: true, updatedAt: false } })
export class Notification {
  @Prop({ type: Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ type: String, required: true }) eventKey: string;
  @Prop({ type: String, required: true }) type: string;
  @Prop({ type: String, required: true }) title: string;
  @Prop({ type: String, default: '' }) body: string;
  @Prop({ type: String, default: null }) link: string | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) data: unknown;
  @Prop({ type: Date, default: null }) readAt: Date | null;
  createdAt: Date;
}
export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, eventKey: 1 }, { unique: true });
NotificationSchema.index({ userId: 1, createdAt: -1 });
