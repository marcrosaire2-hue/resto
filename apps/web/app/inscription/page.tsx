'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { PASSWORD_MIN, registerSchema, type MeResponse } from '@plateforme/contracts';
import { AuthShell } from '@/components/auth-shell';
import { CodeInput, ResendButton } from '@/components/code-input';
import { Alert, Button, Field } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { validate } from '@/lib/forms';
import { useSession } from '@/lib/session';

const EMPTY = { fullName: '', phone: '', email: '', password: '', passwordConfirm: '' };

/** Inscription en deux étapes : informations, puis code à 6 chiffres reçu par e-mail (le compte n'est créé qu'après). */
export default function RegisterPage() {
  const router = useRouter();
  const { setMe } = useSession();
  const [values, setValues] = useState(EMPTY);
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [k]: e.target.value });

  const fail = (err: unknown) => {
    if (err instanceof ApiError) {
      setErrors(err.fieldErrors());
      setFormError(err.issues.length ? null : err.message);
    } else setFormError('Une erreur est survenue.');
  };

  async function sendCode() {
    setFormError(null);
    try {
      await api('/auth/email-code', { method: 'POST', body: { email: values.email, purpose: 'REGISTER' } });
      return true;
    } catch (err) { fail(err); return false; }
  }

  async function onDetails(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v = validate(registerSchema, { ...values, code: '000000' }); // le code est demandé à l'étape suivante
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setLoading(true);
    if (await sendCode()) { setCode(''); setStep('code'); }
    setLoading(false);
  }

  async function onCode(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return setErrors({ code: 'Le code contient 6 chiffres.' });
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      setMe(await api<MeResponse>('/auth/register', { method: 'POST', body: { ...values, code } }));
      router.replace('/accueil');
    } catch (err) {
      fail(err);
      if (err instanceof ApiError && ['PHONE_TAKEN', 'EMAIL_TAKEN'].includes(err.code)) setStep('details');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title={step === 'details' ? 'Créer votre compte' : 'Vérifiez votre e-mail'}
      subtitle={step === 'details' ? 'Quelques informations suffisent pour commander.' : `Saisissez le code à 6 chiffres envoyé à ${values.email}. Il est valable 10 minutes.`}
      footer={<>Déjà inscrit ? <Link href="/connexion" className="font-semibold text-brand-600 hover:underline">Se connecter</Link></>}>
      {step === 'details' ? (
        <form onSubmit={onDetails} noValidate className="space-y-4">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Field label="Nom complet" autoComplete="name" value={values.fullName} onChange={set('fullName')} error={errors.fullName} />
          <Field label="Adresse e-mail" type="email" autoComplete="email" value={values.email} onChange={set('email')} error={errors.email} />
          <Field label="Numéro de téléphone" type="tel" inputMode="tel" autoComplete="tel" placeholder="01 97 00 00 00"
            value={values.phone} onChange={set('phone')} error={errors.phone} hint="Utilisé par le livreur pour vous joindre." />
          <Field label="Mot de passe" type="password" autoComplete="new-password" value={values.password} onChange={set('password')}
            error={errors.password} hint={`${PASSWORD_MIN} caractères minimum, avec lettres et chiffres.`} />
          <Field label="Confirmer le mot de passe" type="password" autoComplete="new-password" value={values.passwordConfirm}
            onChange={set('passwordConfirm')} error={errors.passwordConfirm} />
          <Button type="submit" block size="lg" loading={loading} className="!mt-6">Recevoir le code</Button>
        </form>
      ) : (
        <form onSubmit={onCode} noValidate className="space-y-5">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <CodeInput value={code} onChange={setCode} error={errors.code} />
          <Button type="submit" block size="lg" loading={loading} disabled={code.length !== 6}>Créer mon compte</Button>
          <div className="flex items-center justify-between">
            <button type="button" className="text-sm text-ink-muted" onClick={() => { setStep('details'); setFormError(null); }}>← Modifier mes informations</button>
            <ResendButton onResend={sendCode} />
          </div>
          <p className="text-xs text-ink-muted">Pensez à vérifier vos courriers indésirables.</p>
        </form>
      )}
    </AuthShell>
  );
}
