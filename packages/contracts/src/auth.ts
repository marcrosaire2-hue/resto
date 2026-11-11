import { z } from 'zod';
import { normalizePhone } from './phone';

export const PASSWORD_MIN = 10;

export const phoneSchema = z.string().transform((v, ctx) => {
  const r = normalizePhone(v);
  if (!r.ok) {
    ctx.addIssue({ code: 'custom', message: r.error });
    return z.NEVER;
  }
  return r.e164;
});

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`)
  .max(128, 'Mot de passe trop long.')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Le mot de passe doit contenir des lettres et des chiffres.');

const optionalEmail = z
  .union([z.literal(''), z.email('Adresse e-mail invalide.')])
  .optional()
  .transform((v) => (v ? v.toLowerCase() : undefined));

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Nom complet requis.').max(120),
    phone: phoneSchema,
    email: optionalEmail,
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'Les mots de passe ne correspondent pas.',
  });
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Téléphone ou e-mail requis.'),
  password: z.string().min(1, 'Mot de passe requis.'),
});
export type LoginInput = z.input<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ identifier: z.string().trim().min(3) });

export const resetPasswordSchema = z
  .object({ token: z.string().min(20), password: passwordSchema, passwordConfirm: z.string() })
  .refine((d) => d.password === d.passwordConfirm, { path: ['passwordConfirm'], message: 'Les mots de passe ne correspondent pas.' });

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1), password: passwordSchema, passwordConfirm: z.string() })
  .refine((d) => d.password === d.passwordConfirm, { path: ['passwordConfirm'], message: 'Les mots de passe ne correspondent pas.' });

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  email: optionalEmail,
});

/** Réponse publique « moi ». */
export interface MeResponse {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  phoneVerified: boolean;
  avatarUrl: string | null;
  platformRoles: string[];
  platformPermissions: string[];
  restaurants: { restaurantId: string; name: string; slug: string; role: string; permissions: string[] }[];
}
