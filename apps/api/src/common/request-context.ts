import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Permission } from '@plateforme/contracts';

export interface AuthContext {
  userId: string;
  sessionId: string;
}

export interface TenantContext {
  restaurantId: string;
  permissions: ReadonlySet<Permission>;
}

export type AppRequest = Request & { auth?: AuthContext; tenant?: TenantContext };

export const IS_PUBLIC = 'isPublic';
/** Route accessible sans session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const SKIP_CSRF = 'skipCsrf';
/** Réservé aux webhooks signés des prestataires (vérification par signature). */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);

export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.auth) throw new Error('CurrentAuth utilisé sur une route publique');
  return req.auth;
});

export const CurrentTenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.tenant) throw new Error('CurrentTenant utilisé sans RequirePermission de périmètre restaurant');
  return req.tenant;
});

export function requestMeta(req: Request) {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 300) ?? null };
}
