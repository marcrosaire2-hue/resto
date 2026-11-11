import type { CookieOptions, Response } from 'express';
import { env } from '../../common/env';

export const SESSION_COOKIE = 'sid';
export const CSRF_COOKIE = 'csrf';
export const CSRF_HEADER = 'x-csrf-token';

function base(): CookieOptions {
  return { secure: env().COOKIE_SECURE, sameSite: 'lax', path: '/' };
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, { ...base(), httpOnly: true, expires: expiresAt });
}
export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { ...base(), httpOnly: true });
}
/** Cookie lisible par le front (double soumission) : il ne donne aucun droit à lui seul. */
export function setCsrfCookie(res: Response, token: string) {
  res.cookie(CSRF_COOKIE, token, { ...base(), httpOnly: false, maxAge: 1000 * 60 * 60 * 24 * 30 });
}
