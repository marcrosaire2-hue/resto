import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { safeEqual } from '../../common/crypto';
import { AppRequest, IS_PUBLIC, SKIP_CSRF } from '../../common/request-context';
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from './cookies';
import { AuthService } from './auth.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Protection CSRF par double soumission : en-tête x-csrf-token == cookie csrf, pour toute requête modifiante. */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [ctx.getHandler(), ctx.getClass()])) return true;
    const cookie = req.cookies?.[CSRF_COOKIE];
    const header = req.get(CSRF_HEADER);
    if (typeof cookie !== 'string' || !header || cookie.length < 20 || !safeEqual(cookie, header)) {
      throw new ForbiddenException({ statusCode: 403, error: 'CSRF_INVALID', message: 'Jeton de sécurité manquant ou invalide. Rechargez la page.' });
    }
    return true;
  }
}

/** Charge la session depuis le cookie ; exige une session sauf sur les routes @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token.length > 20) {
      const s = await this.auth.resolveSession(token);
      if (s) req.auth = s;
    }
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (!isPublic && !req.auth) {
      throw new UnauthorizedException({ statusCode: 401, error: 'UNAUTHENTICATED', message: 'Veuillez vous connecter.' });
    }
    return true;
  }
}
