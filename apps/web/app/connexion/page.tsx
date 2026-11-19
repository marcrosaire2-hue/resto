'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { loginSchema, type MeResponse } from '@plateforme/contracts';
import { AuAlert, AuField, AuPage, AuPassword } from '@/components/auth/au';
import { GoogleSignIn } from '@/components/google-sign-in';
import { api, ApiError } from '@/lib/api';
import { validate } from '@/lib/forms';
import { useSession } from '@/lib/session';

/** N'accepte qu'une redirection interne (évite les redirections ouvertes). */
function safeNext(v: string | null) {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/accueil';
}

/** Connexion client — modèle épuré : logo, titre centré, champs gris clair, bouton plein. */
function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const { setMe } = useSession();
  const [values, setValues] = useState({ identifier: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const next = safeNext(params.get('suite'));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v = validate(loginSchema, values);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setLoading(true);
    try {
      setMe(await api<MeResponse>('/auth/login', { method: 'POST', body: values }));
      router.replace(next);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuPage>
      <form onSubmit={onSubmit} noValidate>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="au-illus" src="/brand/miamigo-logo.png" alt="Miamigo" width={900} height={716} />
        <h1 className="au-title" style={{ marginTop: 0 }}>Connexion</h1>
        <p className="au-lead">Bon retour !</p>
        <p>Connectez-vous à votre compte</p>

        <AuAlert>{formError}</AuAlert>
        <AuField id="identifier" label="Téléphone ou e-mail" error={errors.identifier}>
          <input id="identifier" name="identifier" autoComplete="username" placeholder="01 97 00 00 00 ou exemple@gmail.com"
            value={values.identifier} aria-invalid={!!errors.identifier || undefined} onChange={(e) => setValues({ ...values, identifier: e.target.value })} />
        </AuField>
        <AuField id="password" label="Mot de passe" error={errors.password}>
          <AuPassword id="password" value={values.password} placeholder="Votre mot de passe" invalid={!!errors.password}
            onChange={(v) => setValues({ ...values, password: v })} />
        </AuField>
        <Link href="/mot-de-passe-oublie" className="au-forgot">Mot de passe oublié ?</Link>
        <button className="au-btn" disabled={loading}>{loading ? 'Connexion…' : 'Se connecter'}</button>
      </form>

      <div className="au-or" style={{ marginTop: 18 }}>ou</div>
      <GoogleSignIn onAuthenticated={(user) => { setMe(user); router.replace(next); }} />

      <p className="au-alt">
        Pas encore de compte ?{' '}
        <Link href={`/inscription${next !== '/accueil' ? `?suite=${encodeURIComponent(next)}` : ''}`}>S’inscrire</Link>
      </p>
    </AuPage>
  );
}

export default function LoginPage() {
  return <Suspense><Login /></Suspense>;
}
