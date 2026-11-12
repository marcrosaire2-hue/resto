import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import {
  changePasswordSchema, requestEmailCodeSchema, resetWithCodeSchema, loginSchema, registerSchema, resetPasswordSchema, updateProfileSchema,
} from '@plateforme/contracts';
import { randomToken } from '../../common/crypto';
import { env } from '../../common/env';
import { notFound } from '../../common/errors';
import { AppRequest, AuthContext, CurrentAuth, Public, requestMeta } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { clearSessionCookie, CSRF_COOKIE, setCsrfCookie, setSessionCookie } from './cookies';

const authLimit = () => env().THROTTLE_AUTH_LIMIT_PER_MIN;

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly users: UsersService) {}

  /** À appeler au chargement de l'application : fournit le jeton CSRF. */
  @Public()
  @Get('auth/csrf')
  csrf(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const existing = req.cookies?.[CSRF_COOKIE];
    const token = typeof existing === 'string' && existing.length >= 20 ? existing : randomToken();
    setCsrfCookie(res, token);
    return { csrfToken: token };
  }

  @Public()
  @Throttle({ default: { limit: authLimit, ttl: 60_000 } })
  @Post('auth/register')
  async register(
    @Body(new ZodPipe(registerSchema)) body: z.output<typeof registerSchema>,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, session } = await this.auth.register(body, requestMeta(req));
    setSessionCookie(res, session.token, session.expiresAt);
    return this.auth.me(user);
  }

  @Public()
  @Throttle({ default: { limit: authLimit, ttl: 60_000 } })
  @HttpCode(200)
  @Post('auth/login')
  async login(
    @Body(new ZodPipe(loginSchema)) body: z.output<typeof loginSchema>,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, session } = await this.auth.login(body.identifier, body.password, requestMeta(req));
    setSessionCookie(res, session.token, session.expiresAt);
    return this.auth.me(user);
  }

  @HttpCode(204)
  @Post('auth/logout')
  async logout(@CurrentAuth() a: AuthContext, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.revokeSession(a.sessionId);
    clearSessionCookie(res);
  }

  /** Code à 6 chiffres par e-mail : inscription (avant la création du compte) ou mot de passe oublié. */
  @Public()
  @Throttle({ default: { limit: () => Math.max(1, Math.floor(authLimit() / 2)), ttl: 60_000 } })
  @HttpCode(202)
  @Post('auth/email-code')
  async emailCode(@Body(new ZodPipe(requestEmailCodeSchema)) body: z.output<typeof requestEmailCodeSchema>, @Req() req: AppRequest) {
    await this.auth.requestEmailCode(body.email, body.purpose, requestMeta(req));
    return { message: body.purpose === 'REGISTER' ? 'Un code vient d’être envoyé à votre adresse e-mail.' : 'Si un compte correspond à cette adresse, un code vient d’être envoyé.' };
  }

  @Public()
  @Throttle({ default: { limit: authLimit, ttl: 60_000 } })
  @HttpCode(204)
  @Post('auth/password/reset-code')
  async resetWithCode(@Body(new ZodPipe(resetWithCodeSchema)) body: z.output<typeof resetWithCodeSchema>, @Req() req: AppRequest) {
    await this.auth.resetWithCode(body.email, body.code, body.password, requestMeta(req));
  }

  @Public()
  @Throttle({ default: { limit: authLimit, ttl: 60_000 } })
  @HttpCode(204)
  @Post('auth/password/reset')
  async reset(@Body(new ZodPipe(resetPasswordSchema)) body: z.output<typeof resetPasswordSchema>, @Req() req: AppRequest) {
    await this.auth.resetPassword(body.token, body.password, requestMeta(req));
  }

  @Get('auth/me')
  async me(@CurrentAuth() a: AuthContext) {
    const user = await this.users.findById(a.userId);
    if (!user) throw notFound();
    return this.auth.me(user);
  }

  @Patch('users/me')
  async updateMe(@CurrentAuth() a: AuthContext, @Body(new ZodPipe(updateProfileSchema)) body: z.output<typeof updateProfileSchema>) {
    const user = await this.users.updateProfile(a.userId, body);
    if (!user) throw notFound();
    return this.auth.me(user);
  }

  @HttpCode(204)
  @Post('users/me/password')
  async changePassword(
    @CurrentAuth() a: AuthContext,
    @Body(new ZodPipe(changePasswordSchema)) body: z.output<typeof changePasswordSchema>,
    @Req() req: AppRequest,
  ) {
    await this.auth.changePassword(a.userId, a.sessionId, { code: body.code, currentPassword: body.currentPassword }, body.password, requestMeta(req));
  }

  @Throttle({ default: { limit: () => Math.max(1, Math.floor(authLimit() / 2)), ttl: 60_000 } })
  @HttpCode(202)
  @Post('users/me/password/code')
  passwordCode(@CurrentAuth() a: AuthContext) {
    return this.auth.requestChangeCode(a.userId);
  }
}
