import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { normalizePhone, restaurantRole } from '@plateforme/contracts';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { slugify } from '../../common/slug';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import { randomToken } from '../../common/crypto';
import { PlatformStaff } from '../rbac/platform-staff.schema';
import { effectiveRestaurantPermissions, OWNER_ONLY } from '../rbac/permission.service';
import { RestaurantEmployee } from '../rbac/restaurant-employee.schema';
import { User } from '../users/user.schema';
import { Restaurant, RestaurantStatus } from './restaurant.schema';

interface Meta { ip: string | null; userAgent: string | null }

@Injectable()
export class RestaurantsService {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(Restaurant.name) private readonly restaurants: Model<Restaurant>,
    @InjectModel(RestaurantEmployee.name) private readonly employees: Model<RestaurantEmployee>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly usersService: UsersService,
    @InjectModel(PlatformStaff.name) private readonly platformStaff: Model<PlatformStaff>,
  ) {}

  private async findUserByPhone(phone: string) {
    const p = normalizePhone(phone);
    if (!p.ok) throw unprocessable('INVALID_PHONE', p.error);
    const user = await this.users.findOne({ phone: p.e164 });
    if (!user) throw notFound("Aucun compte avec ce numéro. La personne doit d'abord créer son compte.");
    return user;
  }

  private async uniqueSlug(name: string) {
    const base = slugify(name) || 'restaurant';
    let slug = base;
    for (let i = 2; await this.restaurants.exists({ slug }); i++) slug = `${base}-${i}`;
    return slug;
  }

  /** Création par l'administration avec son propriétaire (transaction : tout ou rien). */
  async createWithOwner(input: { name: string; ownerPhone: string }, actorUserId: string, meta: Meta) {
    const owner = await this.findUserByPhone(input.ownerPhone);
    const slug = await this.uniqueSlug(input.name);
    const session = await this.conn.startSession();
    try {
      let created!: InstanceType<typeof this.restaurants>;
      await session.withTransaction(async () => {
        [created] = await this.restaurants.create(
          [{ name: input.name, slug, status: 'ACTIVE', createdBy: new Types.ObjectId(actorUserId) }],
          { session },
        );
        await this.employees.create(
          [{ restaurantId: created._id, userId: owner._id, roleCode: 'owner', createdBy: new Types.ObjectId(actorUserId) }],
          { session },
        );
        await this.audit.record({
          actorUserId, scope: 'platform', restaurantId: String(created._id), action: 'restaurant.create',
          entity: 'restaurant', entityId: String(created._id), after: { name: input.name, slug, ownerUserId: String(owner._id) }, ...meta,
        }, session);
      });
      return created.toObject();
    } finally {
      await session.endSession();
    }
  }

  list(status?: string) {
    const f = status ? { status } : {};
    return this.restaurants.find(f, { draft: 0, searchText: 0 }).sort({ createdAt: -1 }).limit(500).lean();
  }

  async setStatus(id: Types.ObjectId, status: RestaurantStatus, reason: string | null, actorUserId: string, meta: Meta) {
    const before = await this.restaurants.findById(id).lean();
    if (!before) throw notFound();
    await this.restaurants.updateOne({ _id: id }, { status, statusReason: reason });
    await this.audit.record({
      actorUserId, scope: 'platform', restaurantId: String(id), action: 'restaurant.status_change',
      entity: 'restaurant', entityId: String(id), before: { status: before.status }, after: { status, reason }, ...meta,
    });
    return { id: String(id), status };
  }

  // ---------- Personnel (toujours filtré par restaurantId) ----------

  async listStaff(restaurantId: string) {
    const rid = new Types.ObjectId(restaurantId);
    const list = await this.employees.find({ restaurantId: rid }).sort({ createdAt: 1 }).lean();
    const users = await this.users.find({ _id: { $in: list.map((m) => m.userId) } }, { fullName: 1, phone: 1 }).lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    return list.map((m) => ({
      id: String(m._id),
      userId: String(m.userId),
      fullName: byId.get(String(m.userId))?.fullName ?? '—',
      phone: byId.get(String(m.userId))?.phone ?? null,
      roleCode: m.roleCode,
      granted: m.granted,
      revoked: m.revoked,
      status: m.status,
      permissions: [...effectiveRestaurantPermissions(m)],
    }));
  }

  async addStaff(restaurantId: string, input: { phone: string; roleCode: string }, actorUserId: string, meta: Meta) {
    if (!restaurantRole(input.roleCode)) throw unprocessable('INVALID_ROLE', 'Rôle inconnu.');
    const user = await this.findUserByPhone(input.phone);
    const rid = new Types.ObjectId(restaurantId);
    const existing = await this.employees.findOne({ restaurantId: rid, userId: user._id });
    if (existing?.status === 'ACTIVE') throw conflict('ALREADY_MEMBER', 'Cette personne fait déjà partie du personnel.');
    const doc = existing
      ? await this.employees.findOneAndUpdate(
          { restaurantId: rid, _id: existing._id },
          { status: 'ACTIVE', roleCode: input.roleCode, granted: [], revoked: [] },
          { new: true },
        )
      : await this.employees.create({ restaurantId: rid, userId: user._id, roleCode: input.roleCode, createdBy: new Types.ObjectId(actorUserId) });
    await this.audit.record({
      actorUserId, scope: 'restaurant', restaurantId, action: 'staff.add', entity: 'restaurant_employee',
      entityId: String(doc!._id), after: { userId: String(user._id), roleCode: input.roleCode }, ...meta,
    });
    return { id: String(doc!._id) };
  }

  async updateStaff(
    restaurantId: string,
    employeeId: Types.ObjectId,
    patch: { roleCode?: string; granted?: string[]; revoked?: string[]; status?: 'ACTIVE' | 'DISABLED' },
    actorUserId: string,
    meta: Meta,
  ) {
    const rid = new Types.ObjectId(restaurantId);
    const m = await this.employees.findOne({ restaurantId: rid, _id: employeeId });
    if (!m) throw notFound();
    if (patch.roleCode && !restaurantRole(patch.roleCode)) throw unprocessable('INVALID_ROLE', 'Rôle inconnu.');
    if (patch.granted?.some((p) => (OWNER_ONLY as readonly string[]).includes(p))) {
      throw unprocessable('OWNER_ONLY_PERMISSION', 'La gestion du personnel est réservée au propriétaire.');
    }
    const losesOwner = m.roleCode === 'owner' && m.status === 'ACTIVE' &&
      ((patch.roleCode && patch.roleCode !== 'owner') || patch.status === 'DISABLED');
    if (losesOwner) {
      const owners = await this.employees.countDocuments({ restaurantId: rid, roleCode: 'owner', status: 'ACTIVE' });
      if (owners <= 1) throw unprocessable('LAST_OWNER', 'Le restaurant doit conserver au moins un propriétaire actif.');
    }
    const before = { roleCode: m.roleCode, granted: m.granted, revoked: m.revoked, status: m.status };
    if (patch.roleCode) m.roleCode = patch.roleCode;
    if (patch.granted) m.granted = [...new Set(patch.granted)];
    if (patch.revoked) m.revoked = [...new Set(patch.revoked)];
    if (patch.status) m.status = patch.status;
    await this.employees.updateOne(
      { restaurantId: rid, _id: m._id },
      { roleCode: m.roleCode, granted: m.granted, revoked: m.revoked, status: m.status },
    );
    await this.audit.record({
      actorUserId, scope: 'restaurant', restaurantId, action: 'staff.update', entity: 'restaurant_employee',
      entityId: String(m._id), before, after: { roleCode: m.roleCode, granted: m.granted, revoked: m.revoked, status: m.status }, ...meta,
    });
    return { id: String(m._id), permissions: [...effectiveRestaurantPermissions(m)] };
  }

  /** Crée le compte d'un salarié qui n'en a pas encore et renvoie son lien d'activation (72 h). */
  async inviteStaff(restaurantId: string, input: { fullName: string; phone: string; roleCode: string }, actorUserId: string, meta: Meta) {
    if (!restaurantRole(input.roleCode)) throw unprocessable('INVALID_ROLE', 'Rôle inconnu.');
    const p = normalizePhone(input.phone);
    if (!p.ok) throw unprocessable('INVALID_PHONE', p.error);
    if (await this.users.exists({ phone: p.e164 })) {
      throw conflict('ACCOUNT_EXISTS', 'Cette personne a déjà un compte : utilisez « Ajouter un salarié existant ».');
    }
    const rid = new Types.ObjectId(restaurantId);
    const user = await this.usersService.create({ fullName: input.fullName, phone: p.e164, password: randomToken(24) + 'A1' });
    await this.users.updateOne({ _id: user._id }, { invitedByRestaurantId: rid });
    const m = await this.employees.create({ restaurantId: rid, userId: user._id, roleCode: input.roleCode, createdBy: new Types.ObjectId(actorUserId) });
    const link = await this.auth.createActivationLink(user._id, 72);
    await this.audit.record({ actorUserId, scope: 'restaurant', restaurantId, action: 'staff.invite', entity: 'restaurant_employee', entityId: String(m._id), after: { userId: String(user._id), roleCode: input.roleCode }, ...meta });
    return { id: String(m._id), activationLink: link, expiresInHours: 72 };
  }

  /**
   * Réinitialise l'accès d'un salarié : uniquement pour un compte créé par CE restaurant et sans autre rattachement
   * (un client ou un salarié d'un autre établissement gère seul son compte via « mot de passe oublié »).
   */
  async resetStaffAccess(restaurantId: string, employeeId: Types.ObjectId, actorUserId: string, meta: Meta) {
    const rid = new Types.ObjectId(restaurantId);
    const m = await this.employees.findOne({ restaurantId: rid, _id: employeeId });
    if (!m) throw notFound();
    const user = await this.users.findById(m.userId);
    const others = await this.employees.countDocuments({ userId: m.userId, restaurantId: { $ne: rid } }).setOptions({ crossTenant: true });
    const isStaff = await this.platformStaff.exists({ userId: m.userId });
    if (!user || !user.invitedByRestaurantId?.equals(rid) || others > 0 || isStaff) {
      throw unprocessable('NOT_MANAGED_ACCOUNT', 'Cette personne gère elle-même son compte : elle doit utiliser « Mot de passe oublié ».');
    }
    await this.auth.revokeAllSessions(user._id);
    const link = await this.auth.createActivationLink(user._id, 72);
    await this.audit.record({ actorUserId, scope: 'restaurant', restaurantId, action: 'staff.reset_access', entity: 'restaurant_employee', entityId: String(m._id), ...meta });
    return { activationLink: link, expiresInHours: 72 };
  }
}
