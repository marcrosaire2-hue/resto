'use client';

export interface ApiIssue { path: string; message: string }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public issues: ApiIssue[] = []) {
    super(message);
  }
  /** Erreurs par champ, pour les formulaires. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.issues.map((i) => [i.path, i.message]));
  }
}

let csrfToken: string | null = null;

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const r = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  if (!r.ok) throw new ApiError(r.status, 'CSRF_UNAVAILABLE', 'Service indisponible. Vérifiez votre connexion.');
  csrfToken = (await r.json()).csrfToken as string;
  return csrfToken;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['x-csrf-token'] = await ensureCsrf();
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Connexion impossible. Vérifiez votre accès Internet et réessayez.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (data?.error === 'CSRF_INVALID') csrfToken = null;
    throw new ApiError(
      res.status,
      data?.error ?? 'ERROR',
      typeof data?.message === 'string' ? data.message : 'Une erreur est survenue. Réessayez.',
      Array.isArray(data?.issues) ? data.issues : [],
    );
  }
  return data as T;
}
