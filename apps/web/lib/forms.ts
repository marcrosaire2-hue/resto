import type { ZodType } from 'zod';

/** Validation côté navigateur avec les mêmes schémas que l'API (le serveur revalide toujours). */
export function validate<T extends ZodType>(schema: T, data: unknown): { ok: true; data: unknown } | { ok: false; errors: Record<string, string> } {
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, data: r.data };
  const errors: Record<string, string> = {};
  for (const i of r.error.issues) {
    const k = i.path.join('.');
    if (!errors[k]) errors[k] = i.message;
  }
  return { ok: false, errors };
}
