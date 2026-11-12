import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as argon2 from 'argon2';
import { Model, Types } from 'mongoose';
import { normalizePhone } from '@plateforme/contracts';
import { conflict } from '../../common/errors';
import { User, UserDocument } from './user.schema';

/** Paramètres Argon2id (OWASP : m=19 MiB, t=2, p=1 au minimum). */
const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly model: Model<User>) {}

  hashPassword(password: string) {
    return argon2.hash(password, ARGON_OPTS);
  }

  verifyPassword(hash: string, password: string) {
    return argon2.verify(hash, password);
  }

  async create(input: { fullName: string; phone: string; email?: string; password: string; emailVerified?: boolean }) {
    if (await this.model.exists({ phone: input.phone })) {
      throw conflict('PHONE_TAKEN', 'Un compte existe déjà avec ce numéro.');
    }
    if (input.email && (await this.model.exists({ email: input.email }))) {
      throw conflict('EMAIL_TAKEN', 'Un compte existe déjà avec cette adresse e-mail.');
    }
    try {
      return await this.model.create({
        fullName: input.fullName,
        phone: input.phone,
        email: input.email ?? null,
        emailVerifiedAt: input.emailVerified ? new Date() : null,
        passwordHash: await this.hashPassword(input.password),
      });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw conflict('ACCOUNT_EXISTS', 'Un compte existe déjà avec ces informations.');
      throw e;
    }
  }

  findById(id: string | Types.ObjectId) {
    return this.model.findById(id);
  }

  findByIdWithPassword(id: string | Types.ObjectId) {
    return this.model.findById(id).select('+passwordHash');
  }

  findByEmail(email: string) {
    return this.model.findOne({ email });
  }

  findByPhone(phone: string) {
    return this.model.findOne({ phone });
  }

  /** Identifiant de connexion : téléphone (toute forme) ou e-mail. */
  findByIdentifierWithPassword(identifier: string): Promise<UserDocument | null> {
    if (identifier.includes('@')) {
      return this.model.findOne({ email: identifier.trim().toLowerCase() }).select('+passwordHash').exec();
    }
    const p = normalizePhone(identifier);
    if (!p.ok) return Promise.resolve(null);
    return this.model.findOne({ phone: p.e164 }).select('+passwordHash').exec();
  }

  async setPassword(userId: Types.ObjectId | string, password: string) {
    await this.model.updateOne(
      { _id: userId },
      { passwordHash: await this.hashPassword(password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    );
  }

  async updateProfile(userId: string, patch: { fullName?: string; email?: string }) {
    // L'adresse e-mail sert à recevoir les codes de sécurité : elle ne change pas sans vérification.
    if (patch.email !== undefined) {
      const current = await this.model.findById(userId, { email: 1 }).lean();
      if ((current?.email ?? undefined) !== patch.email) {
        throw new UnprocessableEntityException({ statusCode: 422, error: 'EMAIL_LOCKED', message: 'Pour changer d’adresse e-mail, contactez l’assistance.' });
      }
      delete patch.email;
    }
    if (patch.email && (await this.model.exists({ email: patch.email, _id: { $ne: userId } }))) {
      throw conflict('EMAIL_TAKEN', 'Un compte existe déjà avec cette adresse e-mail.');
    }
    const set: Record<string, unknown> = {};
    if (patch.fullName !== undefined) set.fullName = patch.fullName;
    if (patch.email !== undefined) set.email = patch.email;
    return this.model.findByIdAndUpdate(userId, set, { new: true });
  }

}
