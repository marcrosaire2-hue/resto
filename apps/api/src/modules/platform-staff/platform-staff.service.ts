import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { normalizePhone, platformRole } from '@plateforme/contracts';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { PlatformStaff } from '../rbac/platform-staff.schema';
import { User } from '../users/user.schema';

interface Meta { ip: string | null; userAgent: string | null }

@Injectable()
export class PlatformStaffService {
  constructor(
    @InjectModel(PlatformStaff.name) private readonly staff: Model<PlatformStaff>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const list = await this.staff.find().sort({ createdAt: 1 }).lean();
    const users = await this.users.find({ _id: { $in: list.map((s) => s.userId) } }, { fullName: 1, phone: 1 }).lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    return list.map((s) => ({
      id: String(s._id), userId: String(s.userId), roleCode: s.roleCode, status: s.status,
      fullName: byId.get(String(s.userId))?.fullName ?? '—', phone: byId.get(String(s.userId))?.phone ?? null,
    }));
  }

  /** Utilisé par la commande create-superadmin et par l'administration. */
  async assign(userId: Types.ObjectId, roleCode: string, actorUserId: string | null, meta: Meta) {
    if (!platformRole(roleCode)) throw unprocessable('INVALID_ROLE', 'Rôle inconnu.');
    const existing = await this.staff.findOne({ userId });
    if (existing?.status === 'ACTIVE' && existing.roleCode === roleCode) throw conflict('ALREADY_STAFF', 'Ce salarié a déjà ce rôle.');
    const doc = await this.staff.findOneAndUpdate(
      { userId },
      { roleCode, status: 'ACTIVE', $setOnInsert: { createdBy: actorUserId ? new Types.ObjectId(actorUserId) : null } },
      { upsert: true, new: true },
    );
    await this.audit.record({
      actorUserId, scope: actorUserId ? 'platform' : 'system', action: 'platform_staff.assign', entity: 'platform_staff',
      entityId: String(doc._id), before: existing ? { roleCode: existing.roleCode, status: existing.status } : null,
      after: { userId: String(userId), roleCode }, ...meta,
    });
    return { id: String(doc._id) };
  }

  async add(input: { phone: string; roleCode: string }, actorUserId: string, meta: Meta) {
    const p = normalizePhone(input.phone);
    if (!p.ok) throw unprocessable('INVALID_PHONE', p.error);
    const user = await this.users.findOne({ phone: p.e164 });
    if (!user) throw notFound("Aucun compte avec ce numéro. La personne doit d'abord créer son compte.");
    return this.assign(user._id, input.roleCode, actorUserId, meta);
  }

  async update(id: Types.ObjectId, patch: { roleCode?: string; status?: 'ACTIVE' | 'DISABLED' }, actorUserId: string, meta: Meta) {
    const s = await this.staff.findById(id);
    if (!s) throw notFound();
    if (patch.roleCode && !platformRole(patch.roleCode)) throw unprocessable('INVALID_ROLE', 'Rôle inconnu.');
    const losesSuper = s.roleCode === 'super_admin' && s.status === 'ACTIVE' &&
      ((patch.roleCode && patch.roleCode !== 'super_admin') || patch.status === 'DISABLED');
    if (losesSuper && (await this.staff.countDocuments({ roleCode: 'super_admin', status: 'ACTIVE' })) <= 1) {
      throw unprocessable('LAST_SUPER_ADMIN', 'La plateforme doit conserver au moins un super-administrateur actif.');
    }
    const before = { roleCode: s.roleCode, status: s.status };
    await this.staff.updateOne({ _id: id }, { ...patch });
    await this.audit.record({
      actorUserId, scope: 'platform', action: 'platform_staff.update', entity: 'platform_staff', entityId: String(id),
      before, after: { ...before, ...patch }, ...meta,
    });
    return { id: String(id) };
  }
}
