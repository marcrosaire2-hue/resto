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

  async register(input: { fullName: string; phone: string; email?: string; password: string }, meta: Meta) {
    const user = await this.users.create(input);
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
   * Demande de réinitialisation. La réponse est toujours identique (pas d'énumération des comptes).
   * Aucun canal SMS/e-mail n'est encore branché (F42) : hors production, le lien est écrit dans les journaux
   * du serveur pour permettre les tests ; en production, il n'est jamais journalisé.
   */
  async requestPasswordReset(identifier: string, meta: Meta) {
    const user = await this.users.findByIdentifierWithPassword(identifier);
    if (!user || user.status !== 'ACTIVE') return;
    const token = randomToken();
    await this.resets.create({ tokenHash: sha256(token), userId: user._id, expiresAt: new Date(Date.now() + RESET_TTL_MIN * 60_000) });
    await this.audit.record({ actorUserId: String(user._id), scope: 'self', action: 'auth.password_reset_requested', entity: 'user', entityId: String(user._id), ...meta });
    const link = `${env().APP_PUBLIC_URL}/reinitialiser?token=${token}`;
    if (env().NODE_ENV === 'production') {
      this.logger.error('Réinitialisation demandée mais aucun canal de notification n’est configuré (F42).');
    } else {
      this.logger.warn(`[DEV] Aucun canal configuré — lien de réinitialisation : ${link}`);
    }
    return { devLink: env().NODE_ENV === 'production' ? undefined : link };
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

  async changePassword(userId: string, sessionId: string, current: string, next: string, meta: Meta) {
    const user = await this.users.findByIdWithPassword(userId);
    if (!user || !(await this.users.verifyPassword(user.passwordHash, current))) {
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
