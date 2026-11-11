'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { PASSWORD_MIN, resetPasswordSchema } from '@plateforme/contracts';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, Field } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { validate } from '@/lib/forms';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [values, setValues] = useState({ password: '', passwordConfirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) return <Alert tone="danger" title="Lien incomplet">Ouvrez le lien reçu en entier ou refaites une demande.</Alert>;
  if (done) {
    return (
      <Alert tone="success" title="Mot de passe modifié">
        Vous pouvez maintenant <Link href="/connexion" className="font-semibold underline">vous connecter</Link>.
      </Alert>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = { token, ...values };
    const v = validate(resetPasswordSchema, body);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      await api('/auth/password/reset', { method: 'POST', body });
      setDone(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Field label="Nouveau mot de passe" type="password" autoComplete="new-password" value={values.password}
        onChange={(e) => setValues({ ...values, password: e.target.value })} error={errors.password}
        hint={`${PASSWORD_MIN} caractères minimum, avec lettres et chiffres.`} />
      <Field label="Confirmer" type="password" autoComplete="new-password" value={values.passwordConfirm}
        onChange={(e) => setValues({ ...values, passwordConfirm: e.target.value })} error={errors.passwordConfirm} />
      <Button type="submit" block size="lg" loading={loading}>Enregistrer</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell backHref={'/connexion'} title="Nouveau mot de passe" subtitle="Toutes vos sessions ouvertes seront fermées par sécurité.">
      <Suspense><ResetForm /></Suspense>
    </AuthShell>
  );
}
