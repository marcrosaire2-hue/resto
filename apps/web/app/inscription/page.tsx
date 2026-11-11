'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { PASSWORD_MIN, registerSchema, type MeResponse } from '@plateforme/contracts';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, Field } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { validate } from '@/lib/forms';
import { useSession } from '@/lib/session';

const EMPTY = { fullName: '', phone: '', email: '', password: '', passwordConfirm: '' };

export default function RegisterPage() {
  const router = useRouter();
  const { setMe } = useSession();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [k]: e.target.value });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v = validate(registerSchema, values);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setLoading(true);
    try {
      setMe(await api<MeResponse>('/auth/register', { method: 'POST', body: values }));
      router.replace('/accueil');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        setFormError(err.issues.length ? null : err.message);
      } else setFormError('Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Créer votre compte" subtitle="Quelques informations suffisent pour commander."
      footer={<>Déjà inscrit ? <Link href="/connexion" className="font-semibold text-brand-600 hover:underline">Se connecter</Link></>}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Nom complet" autoComplete="name" value={values.fullName} onChange={set('fullName')} error={errors.fullName} />
        <Field label="Numéro de téléphone" type="tel" inputMode="tel" autoComplete="tel" placeholder="01 97 00 00 00"
          value={values.phone} onChange={set('phone')} error={errors.phone} hint="Utilisé par le livreur pour vous joindre." />
        <Field label="E-mail (facultatif)" type="email" autoComplete="email" value={values.email} onChange={set('email')} error={errors.email} />
        <Field label="Mot de passe" type="password" autoComplete="new-password" value={values.password} onChange={set('password')}
          error={errors.password} hint={`${PASSWORD_MIN} caractères minimum, avec lettres et chiffres.`} />
        <Field label="Confirmer le mot de passe" type="password" autoComplete="new-password" value={values.passwordConfirm}
          onChange={set('passwordConfirm')} error={errors.passwordConfirm} />
        <Button type="submit" block size="lg" loading={loading} className="!mt-6">Créer mon compte</Button>
      </form>
    </AuthShell>
  );
}
