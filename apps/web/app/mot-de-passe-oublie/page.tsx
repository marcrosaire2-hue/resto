'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { emailSchema, PASSWORD_MIN, resetWithCodeSchema } from '@plateforme/contracts';
import { AuthShell } from '@/components/auth-shell';
import { CodeInput, ResendButton } from '@/components/code-input';
import { Alert, Button, Field } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { validate } from '@/lib/forms';

/** Mot de passe oublié : code à 6 chiffres envoyé à l'adresse e-mail du compte, puis nouveau mot de passe. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [values, setValues] = useState({ code: '', password: '', passwordConfirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    setError(null);
    try { await api('/auth/email-code', { method: 'POST', body: { email, purpose: 'RESET' } }); return true; }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.'); return false; }
  }

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    if (!emailSchema.safeParse(email).success) return setErrors({ email: 'Adresse e-mail invalide.' });
    setErrors({});
    setLoading(true);
    if (await send()) setStep('code');
    setLoading(false);
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    const v = validate(resetWithCodeSchema, { email, ...values });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setError(null);
    setLoading(true);
    try {
      await api('/auth/password/reset-code', { method: 'POST', body: { email, ...values } });
      setStep('done');
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fieldErrors()); setError(err.issues.length ? null : err.message); }
      else setError('Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell backHref="/connexion" title="Mot de passe oublié"
      subtitle={step === 'email' ? 'Indiquez l’adresse e-mail de votre compte : vous recevrez un code à 6 chiffres.' : step === 'code' ? `Si un compte correspond à ${email}, un code vient d’y être envoyé (valable 10 minutes).` : undefined}
      footer={<Link href="/connexion" className="font-semibold text-brand-600 hover:underline">Retour à la connexion</Link>}>
      {step === 'done' ? (
        <div className="space-y-4">
          <Alert tone="success" title="Mot de passe modifié">Vous pouvez vous connecter avec votre nouveau mot de passe. Vos autres sessions ont été fermées.</Alert>
          <Link href="/connexion" className="block"><Button block size="lg">Se connecter</Button></Link>
        </div>
      ) : step === 'email' ? (
        <form onSubmit={onEmail} noValidate className="space-y-5">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Adresse e-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
          <Button type="submit" block size="lg" loading={loading}>Recevoir le code</Button>
        </form>
      ) : (
        <form onSubmit={onReset} noValidate className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <CodeInput value={values.code} onChange={(code) => setValues({ ...values, code })} error={errors.code} />
          <Field label="Nouveau mot de passe" type="password" autoComplete="new-password" value={values.password}
            onChange={(e) => setValues({ ...values, password: e.target.value })} error={errors.password} hint={`${PASSWORD_MIN} caractères minimum, avec lettres et chiffres.`} />
          <Field label="Confirmer" type="password" autoComplete="new-password" value={values.passwordConfirm}
            onChange={(e) => setValues({ ...values, passwordConfirm: e.target.value })} error={errors.passwordConfirm} />
          <Button type="submit" block size="lg" loading={loading}>Changer le mot de passe</Button>
          <div className="flex items-center justify-between">
            <button type="button" className="text-sm text-ink-muted" onClick={() => setStep('email')}>← Autre adresse</button>
            <ResendButton onResend={send} />
          </div>
        </form>
      )}
    </AuthShell>
  );
}
