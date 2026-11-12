import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI est requis'),
    WEB_ORIGIN: z.url().default('http://localhost:3000'),
    APP_PUBLIC_URL: z.url().default('http://localhost:3000'),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 14),
    COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    THROTTLE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(120),
    /** Limite des routes sensibles (connexion, inscription, réinitialisation). */
    THROTTLE_AUTH_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(10),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    MEDIA_FOLDER_PREFIX: z.string().regex(/^[a-z0-9_-]+$/).default('plateforme'),
    /** FedaPay (Mobile Money). Sans clé secrète, le paiement en ligne est indisponible et masqué. */
    FEDAPAY_ENV: z.enum(['sandbox', 'live']).default('sandbox'),
    FEDAPAY_SECRET_KEY: z.string().optional(),
    FEDAPAY_PUBLIC_KEY: z.string().optional(),
    FEDAPAY_WEBHOOK_SECRET: z.string().optional(),
    /** Brevo (e-mails transactionnels : codes de vérification). */
    BREVO_API_KEY: z.string().optional(),
    MAIL_FROM_EMAIL: z.string().optional(),
    MAIL_FROM_NAME: z.string().default('Marketplace Cotonou'),
    /** Réservé aux tests (serveur Brevo de test local). */
    BREVO_API_URL: z.url().optional(),
    /** Réservé aux tests (serveur FedaPay de test local). */
    FEDAPAY_API_URL: z.url().optional(),
  })
  .refine((e) => !e.FEDAPAY_SECRET_KEY || e.FEDAPAY_SECRET_KEY.startsWith(`sk_${e.FEDAPAY_ENV}_`) || !!e.FEDAPAY_API_URL, {
    message: 'La clé FedaPay ne correspond pas à FEDAPAY_ENV (sk_sandbox_… ou sk_live_…)',
    path: ['FEDAPAY_SECRET_KEY'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.COOKIE_SECURE, {
    message: 'COOKIE_SECURE doit valoir true en production',
    path: ['COOKIE_SECURE'],
  });

export type Env = z.output<typeof schema>;

let cached: Env | null = null;

/** Lit et valide les variables d'environnement (une seule fois). */
export function env(): Env {
  if (!cached) {
    const r = schema.safeParse(process.env);
    if (!r.success) {
      const details = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Configuration invalide : ${details}`);
    }
    cached = r.data;
  }
  return cached;
}

/** Réservé aux tests. */
export function resetEnvCache() {
  cached = null;
}
