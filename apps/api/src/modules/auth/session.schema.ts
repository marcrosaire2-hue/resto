import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ collection: 'sessions', timestamps: { createdAt: true, updatedAt: false } })
export class Session {
  /** Seul le hachage SHA-256 du jeton est stocké ; le jeton brut ne vit que dans le cookie httpOnly. */
  @Prop({ required: true, unique: true }) tokenHash: string;
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId: Types.ObjectId;
  @Prop({ type: String, default: null }) ip: string | null;
  @Prop({ type: String, default: null }) userAgent: string | null;
  @Prop({ type: Date, required: true }) expiresAt: Date;
  @Prop({ type: Date, default: null }) revokedAt: Date | null;
  @Prop({ type: Date, default: () => new Date() }) lastSeenAt: Date;
}
export type SessionDocument = HydratedDocument<Session>;
export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

@Schema({ collection: 'password_reset_tokens', timestamps: { createdAt: true, updatedAt: false } })
export class PasswordResetToken {
  @Prop({ required: true, unique: true }) tokenHash: string;
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId: Types.ObjectId;
  @Prop({ type: Date, required: true }) expiresAt: Date;
  @Prop({ type: Date, default: null }) usedAt: Date | null;
}
export const PasswordResetTokenSchema = SchemaFactory.createForClass(PasswordResetToken);
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
