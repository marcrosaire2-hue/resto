import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserStatus = 'ACTIVE' | 'SUSPENDED';

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ required: true, trim: true, maxlength: 120 }) fullName: string;
  @Prop({ required: true, unique: true }) phone: string; // E.164
  @Prop({ type: String, default: null, lowercase: true, trim: true }) email: string | null;
  @Prop({ required: true, select: false }) passwordHash: string;
  @Prop({ type: Date, default: null }) phoneVerifiedAt: Date | null;
  @Prop({ type: Date, default: null }) emailVerifiedAt: Date | null;
  @Prop({ type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE' }) status: UserStatus;
  @Prop({ type: String, default: null }) avatarPublicId: string | null;
  @Prop({ default: 0 }) failedLoginCount: number;
  @Prop({ type: Date, default: null }) lockedUntil: Date | null;
  @Prop({ type: Date, default: null }) passwordChangedAt: Date | null;
  /** Compte créé par un restaurant pour un salarié : seul ce restaurant peut en réinitialiser l'accès. */
  @Prop({ type: Types.ObjectId, default: null }) invitedByRestaurantId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}
export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
