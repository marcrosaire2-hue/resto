import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { MeResponse } from '@plateforme/contracts';
import { randomToken, sha256 } from '../../common/crypto';
import { env } from '../../common/env';
import { AuditService } from '../audit/audit.service';
import { PermissionService } from '../rbac/permission.service';
import { SettingsService } from '../settings/settings.service';
import { UserDocument } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { EmailCodeService } from './email-code.service';
import { PasswordResetToken, Session } from './session.schema';

const DEFAULT_MAX_FAILED = 5; // valeur de sécurité, surchargée par le paramètre auth.max_failed_logins
const LOCK_MINUTES = 15;
const RESET_TTL_MIN = 30;
const TOUCH_INTERVAL_MS = 5 * 60_000;

interface Meta { ip: string | null; userAgent: string | null }

const invalidCredentials = () =>
  new HttpException({ statusCode: 401, error: 'INVALID_CREDENTIALS', message: 'Identifiants incorrects.' }, HttpStatus.UNAUTHORIZED);

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly perms: PermissionService,
    private readonly settings: SettingsService,
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
    @InjectModel(PasswordResetToken.name) private readonly resets: Model<PasswordResetToken>,
    private readonly emailCodes: EmailCodeService,
  ) {}

  async createSession(userId: Types.ObjectId, meta: Meta) {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + env().SESSION_TTL_HOURS * 3600_000);
    await this.sessions.create({ tokenHash: sha256(token), userId, expiresAt, ...meta });
    return { token, expiresAt };
  }

  async resolveSession(token: string) {
    const s = await this.sessions.findOne({ tokenHash: sha256(token), revokedAt: null, expiresAt: { $gt: new Date() } });
    if (!s) return null;
    const user = await this.users.findById(s.userId);
    if (!user || user.status !== 'ACTIVE') return null;
    if (Date.now() - s.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.sessions.updateOne({ _id: s._id }, { lastSeenAt: new Date() });
    }
    return { userId: String(user._id), sessionId: String(s._id) };
  }

  async revokeSession(sessionId: string) {
    await this.sessions.updateOne({ _id: sessionId }, { revokedAt: new Date() });
  }

  async revokeAllSessions(userId: Types.ObjectId | string, exceptSessionId?: string) {
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(String(userId)), revokedAt: null };
    if (exceptSessionId) filter._id = { $ne: new Types.ObjectId(exceptSessionId) };
    await this.sessions.updateMany(filter, { revokedAt: new Date() });
  }

  /** Envoi d'un code par e-mail (inscription ou mot de passe oublié). */
  async requestEmailCode(email: string, purpose: 'REGISTER' | 'RESET', meta: Meta) {
    if (purpose === 'REGISTER') {
      if (await this.users.findByEmail(email)) {
        throw new HttpException({ statusCode: 409, error: 'EMAIL_TAKEN', message: 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous ou utilisez « Mot de passe oublié ».' }, HttpStatus.CONFLICT);
      }
      await this.emailCodes.send(email, 'REGISTER');
      return;
    }
    // Mot de passe oublié : réponse identique que le compte existe ou non (pas d'énumération).
    const user = await this.users.findByEmail(email);
    if (!user || user.status !== 'ACTIVE') return;
    await this.emailCodes.send(email, 'RESET');
    await this.audit.record({ actorUserId: String(user._id), scope: 'self', action: 'auth.password_reset_requested', entity: 'user', entityId: String(user._id), ...meta });
  }

  async register(input: { fullName: string; phone: string; email: string; code: string; password: string }, meta: Meta) {
    // Vérifications d'unicité avant de consommer le code (un échec ne doit pas « brûler » le code).
    if (await this.users.findByPhone(input.phone)) throw new HttpException({ statusCode: 409, error: 'PHONE_TAKEN', message: 'Un compte existe déjà avec ce numéro.' }, HttpStatus.CONFLICT);
    if (await this.users.findByEmail(input.email)) throw new HttpException({ statusCode: 409, error: 'EMAIL_TAKEN', message: 'Un compte existe déjà avec cette adresse e-mail.' }, HttpStatus.CONFLICT);
    await this.emailCodes.consume(input.email, 'REGISTER', input.code);
    const user = await this.users.create({ fullName: input.fullName, phone: input.phone, email: input.email, password: input.password, emailVerified: true });
    await this.audit.record({ actorUserId: String(user._id), scope: 'self', action: 'auth.register', entity: 'user', entityId: String(user._id), ...meta });
    return { user, session: await this.createSession(user._id, meta) };
  }

  async login(identifier: string, password: string, meta: Meta) {
    const user = await this.users.findByIdentifierWithPassword(identifier);
    if (!user) {
      // Temps de réponse comparable pour ne pas révéler l'existence d'un compte.
      this.dummyHash ??= this.users.hashPassword(randomToken());
      await this.users.verifyPassword(await this.dummyHash, password).catch(() => false);
      await this.audit.record({ scope: 'system', action: 'auth.login_failed', entity: 'user', after: { reason: 'unknown_identifier' }, ...meta });
      throw invalidCredentials();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException(
        { statusCode: 423, error: 'ACCOUNT_LOCKED', message: 'Trop de tentatives. Réessayez plus tard ou réinitialisez votre mot de passe.' },
        HttpStatus.LOCKED,
      );
    }
    const ok = await this.users.verifyPassword(user.passwordHash, password);
    if (!ok) {
      const max = (await this.settings.get('auth.max_failed_logins')) ?? DEFAULT_MAX_FAILED;
      const count = user.failedLoginCount + 1;
      const lock = count >= max;
      user.failedLoginCount = lock ? 0 : count;
      user.lockedUntil = lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
      await user.save();
      await this.audit.record({
        actorUserId: String(user._id), scope: 'self', action: lock ? 'auth.account_locked' : 'auth.login_failed',
        entity: 'user', entityId: String(user._id), ...meta,
      });
      throw invalidCredentials();
    }
    if (user.status !== 'ACTIVE') {
      throw new HttpException({ statusCode: 403, error: 'ACCOUNT_SUSPENDED', message: 'Ce compte est suspendu. Contactez le support.' }, HttpStatus.FORBIDDEN);
    }
    if (user.failedLoginCount || user.lockedUntil) {
      user.failedLoginCount = 0;
      user.lockedUntil = null;
      await user.save();
    }
    await this.audit.record({ actorUserId: String(user._id), scope: 'self', action: 'auth.login', entity: 'user', entityId: String(user._id), ...meta });
    return { user, session: await this.createSession(user._id, meta) };
  }

  /**
   * Lien d'activation / de réinitialisation à usage unique (même mécanisme que « mot de passe oublié »).
   * Tant qu'aucun canal SMS n'est configuré (F42), il est remis à la personne qui crée le compte.
   */
  async createActivationLink(userId: Types.ObjectId, hours: number) {
    const token = randomToken();
    await this.resets.updateMany({ userId, usedAt: null }, { usedAt: new Date() }); // un seul lien valide à la fois
    await this.resets.create({ tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + hours * 3600_000) });
    return `${env().APP_PUBLIC_URL}/reinitialiser?token=${token}&bienvenue=1`;
  }

  async resetPassword(token: string, password: string, meta: Meta) {
    const rec = await this.resets.findOneAndUpdate(
      { tokenHash: sha256(token), usedAt: null, expiresAt: { $gt: new Date() } },
      { usedAt: new Date() },
    );
    if (!rec) {
      throw new HttpException({ statusCode: 400, error: 'RESET_TOKEN_INVALID', message: 'Lien invalide ou expiré.' }, HttpStatus.BAD_REQUEST);
    }
    await this.users.setPassword(rec.userId, password);
    await this.revokeAllSessions(rec.userId);
    await this.audit.record({ actorUserId: String(rec.userId), scope: 'self', action: 'auth.password_reset', entity: 'user', entityId: String(rec.userId), ...meta });
  }

  /** Réinitialisation par le code reçu par e-mail : toutes les sessions sont fermées. */
  async resetWithCode(email: string, code: string, password: string, meta: Meta) {
    const user = await this.users.findByEmail(email);
    if (!user || user.status !== 'ACTIVE') throw new HttpException({ statusCode: 400, error: 'CODE_EXPIRED', message: 'Code expiré ou introuvable. Demandez un nouveau code.' }, HttpStatus.BAD_REQUEST);
    await this.emailCodes.consume(email, 'RESET', code);
    await this.users.setPassword(user._id, password);
    await this.revokeAllSessions(user._id);
    await this.audit.record({ actorUserId: String(user._id), scope: 'self', action: 'auth.password_reset', entity: 'user', entityId: String(user._id), after: { via: 'email_code' }, ...meta });
  }

  /** Code pour modifier le mot de passe (utilisateur connecté, envoyé à son adresse e-mail). */
  async requestChangeCode(userId: string) {
    const user = await this.users.findById(userId);
    if (!user?.email) throw new HttpException({ statusCode: 422, error: 'NO_EMAIL', message: 'Aucune adresse e-mail sur ce compte : utilisez votre mot de passe actuel.' }, HttpStatus.UNPROCESSABLE_ENTITY);
    await this.emailCodes.send(user.email, 'CHANGE_PASSWORD');
    return { sentTo: user.email.replace(/^(.).*(@.*)$/, '$1•••$2') };
  }

  async changePassword(userId: string, sessionId: string, proof: { code?: string; currentPassword?: string }, next: string, meta: Meta) {
    const user = await this.users.findByIdWithPassword(userId);
    if (!user) throw new HttpException({ statusCode: 400, error: 'WRONG_PASSWORD', message: 'Mot de passe actuel incorrect.' }, HttpStatus.BAD_REQUEST);
    if (proof.code) {
      if (!user.email) throw new HttpException({ statusCode: 422, error: 'NO_EMAIL', message: 'Aucune adresse e-mail sur ce compte.' }, HttpStatus.UNPROCESSABLE_ENTITY);
      await this.emailCodes.consume(user.email, 'CHANGE_PASSWORD', proof.code);
    } else if (!proof.currentPassword || !(await this.users.verifyPassword(user.passwordHash, proof.currentPassword))) {
      throw new HttpException({ statusCode: 400, error: 'WRONG_PASSWORD', message: 'Mot de passe actuel incorrect.' }, HttpStatus.BAD_REQUEST);
    }
    await this.users.setPassword(user._id, next);
    await this.revokeAllSessions(user._id, sessionId);
    await this.audit.record({ actorUserId: userId, scope: 'self', action: 'auth.password_changed', entity: 'user', entityId: userId, ...meta });
  }

  async me(user: UserDocument): Promise<MeResponse> {
    const platform = await this.perms.platform(String(user._id));
    const restaurants = await this.perms.memberships(String(user._id));
    return {
      id: String(user._id),
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      phoneVerified: !!user.phoneVerifiedAt,
      avatarUrl: null,
      platformRoles: platform.roleCode ? [platform.roleCode] : [],
      platformPermissions: [...platform.permissions],
      restaurants: restaurants.map(({ status: _s, ...r }) => r),
    };
  }
}
