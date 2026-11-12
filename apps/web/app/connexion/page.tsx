'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { loginSchema, type MeResponse } from '@plateforme/contracts';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, Field } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { validate } from '@/lib/forms';
import { useSession } from '@/lib/session';

/** Espace d'arrivée par défaut selon le compte : salariés → administration, restaurateurs → espace restaurant, sinon accueil. */
function homeFor(me: MeResponse) {
  if (me.platformRoles.length > 0) return '/admin';
  if (me.restaurants.length > 0) return '/pro';
  return '/accueil';
}

/** N'accepte qu'une redirection interne (évite les redirections ouvertes) ; sinon l'espace du compte. */
function safeNext(v: string | null, me: MeResponse) {
  return v && v.startsWith('/') && !v.startsWith('//') && v !== '/accueil' ? v : homeFor(me);
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setMe } = useSession();
  const [values, setValues] = useState({ identifier: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v = validate(loginSchema, values);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setLoading(true);
    try {
      const me = await api<MeResponse>('/auth/login', { method: 'POST', body: values });
      setMe(me);
      router.replace(safeNext(params.get('suite'), me));
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Field label="Téléphone ou e-mail" name="identifier" autoComplete="username" inputMode="text" placeholder="01 97 00 00 00"
        value={values.identifier} onChange={(e) => setValues({ ...values, identifier: e.target.value })} error={errors.identifier} />
      <Field label="Mot de passe" name="password" type="password" autoComplete="current-password"
        value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} error={errors.password} />
      <div className="flex justify-end">
        <Link href="/mot-de-passe-oublie" className="text-sm font-semibold text-brand-600 hover:underline">Mot de passe oublié ?</Link>
      </div>
      <Button type="submit" block size="lg" loading={loading}>Se connecter</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell title="Bon retour parmi nous" subtitle="Connectez-vous pour commander et suivre vos livraisons."
      footer={<>Pas encore de compte ? <Link href="/inscription" className="font-semibold text-brand-600 hover:underline">Créer un compte</Link></>}>
      <Suspense><LoginForm /></Suspense>
    </AuthShell>
  );
}
