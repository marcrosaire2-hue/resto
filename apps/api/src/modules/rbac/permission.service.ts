import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { isPermission, Permission, PERMISSIONS, platformRole, restaurantRole } from '@plateforme/contracts';
import { Restaurant, RestaurantStatus } from '../restaurants/restaurant.schema';
import { PlatformStaff } from './platform-staff.schema';
import { RestaurantEmployee } from './restaurant-employee.schema';

/** Permissions réservées au rôle propriétaire, jamais attribuables par ajustement. */
export const OWNER_ONLY: readonly Permission[] = ['staff.manage'];

export function effectiveRestaurantPermissions(m: { roleCode: string; granted: string[]; revoked: string[] }): Set<Permission> {
  const role = restaurantRole(m.roleCode);
  const set = new Set<Permission>(role ? role.permissions : []);
  for (const g of m.granted) {
    if (isPermission(g) && PERMISSIONS[g].scope === 'restaurant' && !OWNER_ONLY.includes(g)) set.add(g);
  }
  for (const r of m.revoked) if (isPermission(r)) set.delete(r);
  if (m.roleCode !== 'owner') for (const p of OWNER_ONLY) set.delete(p);
  return set;
}

export type RestaurantAccess =
  | { kind: 'none' }
  | { kind: 'blocked'; status: RestaurantStatus }
  | { kind: 'ok'; permissions: Set<Permission>; roleCode: string };

@Injectable()
export class PermissionService {
  constructor(
    @InjectModel(PlatformStaff.name) private readonly staff: Model<PlatformStaff>,
    @InjectModel(RestaurantEmployee.name) private readonly employees: Model<RestaurantEmployee>,
    @InjectModel(Restaurant.name) private readonly restaurants: Model<Restaurant>,
  ) {}

  async platform(userId: string): Promise<{ roleCode: string | null; permissions: Set<Permission> }> {
    const s = await this.staff.findOne({ userId: new Types.ObjectId(userId), status: 'ACTIVE' }).lean();
    const role = s ? platformRole(s.roleCode) : undefined;
    return { roleCode: role?.code ?? null, permissions: new Set(role?.permissions ?? []) };
  }

  async restaurant(userId: string, restaurantId: Types.ObjectId): Promise<RestaurantAccess> {
    const m = await this.employees
      .findOne({ restaurantId, userId: new Types.ObjectId(userId), status: 'ACTIVE' })
      .lean();
    if (!m) return { kind: 'none' };
    const r = await this.restaurants.findById(restaurantId, { status: 1 }).lean();
    if (!r) return { kind: 'none' };
    if (r.status === 'SUSPENDED' || r.status === 'REJECTED') return { kind: 'blocked', status: r.status };
    return { kind: 'ok', permissions: effectiveRestaurantPermissions(m), roleCode: m.roleCode };
  }

  /** Tous les restaurants d'un utilisateur (requête transversale explicite). */
  async memberships(userId: string) {
    const list = await this.employees
      .find({ userId: new Types.ObjectId(userId), status: 'ACTIVE' })
      .setOptions({ crossTenant: true })
      .lean();
    if (!list.length) return [];
    const restos = await this.restaurants.find({ _id: { $in: list.map((m) => m.restaurantId) } }).lean();
    const byId = new Map(restos.map((r) => [String(r._id), r]));
    return list.flatMap((m) => {
      const r = byId.get(String(m.restaurantId));
      if (!r) return [];
      const blocked = r.status === 'SUSPENDED' || r.status === 'REJECTED';
      return [{
        restaurantId: String(r._id),
        name: r.name,
        slug: r.slug,
        status: r.status,
        role: m.roleCode,
        permissions: blocked ? [] : [...effectiveRestaurantPermissions(m)],
      }];
    });
  }
}
