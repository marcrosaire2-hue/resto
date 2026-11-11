import { applyDecorators, CanActivate, ExecutionContext, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiCookieAuth } from '@nestjs/swagger';
import { Permission, PERMISSIONS } from '@plateforme/contracts';
import { forbidden, notFound } from '../../common/errors';
import { toObjectId } from '../../common/object-id';
import type { AppRequest } from '../../common/request-context';
import { PermissionService } from './permission.service';

interface Requirement {
  permissions: Permission[];
  /** Nom du paramètre d'URL portant l'identifiant du restaurant. */
  param: string;
}
const KEY = 'requiredPermissions';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly perms: PermissionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const reqmt = this.reflector.get<Requirement>(KEY, ctx.getHandler());
    if (!reqmt) return true;
    if (!req.auth) throw forbidden();
    const scope = PERMISSIONS[reqmt.permissions[0]].scope;

    if (scope === 'platform') {
      const { permissions } = await this.perms.platform(req.auth.userId);
      if (!reqmt.permissions.every((p) => permissions.has(p))) throw forbidden();
      return true;
    }

    // Périmètre restaurant : l'appartenance est vérifiée côté serveur à chaque requête.
    const raw = req.params[reqmt.param];
    if (typeof raw !== 'string') throw notFound();
    const restaurantId = toObjectId(raw);
    const access = await this.perms.restaurant(req.auth.userId, restaurantId);
    // Ne pas révéler l'existence d'un restaurant auquel l'utilisateur n'appartient pas.
    if (access.kind === 'none') throw notFound();
    if (access.kind === 'blocked') {
      throw forbidden('Ce restaurant est suspendu : les actions sont bloquées.', 'RESTAURANT_SUSPENDED');
    }
    if (!reqmt.permissions.every((p) => access.permissions.has(p))) throw forbidden();
    req.tenant = { restaurantId: String(restaurantId), permissions: access.permissions };
    return true;
  }
}

/**
 * Exige une ou plusieurs permissions d'un même périmètre.
 * Périmètre restaurant : l'identifiant est lu dans le paramètre d'URL `param` (défaut : restaurantId).
 */
export function RequirePermission(permissions: Permission | Permission[], opts: { param?: string } = {}) {
  const list = Array.isArray(permissions) ? permissions : [permissions];
  const scopes = new Set(list.map((p) => PERMISSIONS[p].scope));
  if (scopes.size !== 1) throw new Error('RequirePermission : permissions de périmètres différents');
  return applyDecorators(
    SetMetadata(KEY, { permissions: list, param: opts.param ?? 'restaurantId' } satisfies Requirement),
    UseGuards(PermissionGuard),
    ApiCookieAuth('sid'),
  );
}
