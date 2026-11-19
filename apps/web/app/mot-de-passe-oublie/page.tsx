'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { emailSchema, PASSWORD_MIN, passwordSchema, resetWithCodeSchema } from '@plateforme/contracts';
import { AuAlert, AuField, AuOtp, AuPage, AuPassword, AuTop, maskEmail, useCountdown } from '@/components/auth/au';
import { api, ApiError } from '@/lib/api';
import { validate } from '@/lib/forms';

/** Mot de passe oublié : code à 6 chiffres envoyé à l'adresse e-mail du compte, puis nouveau mot de passe. */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [values, setValues] = useState({ code: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [left, setLeft] = useCountdown(0);
  const [info, setInfo] = useState<string | null>(null);
  const pwOk = passwordSchema.safeParse(values.password).success;

  async function send() {
    setError(null);
    try { await api('/auth/email-code', { method: 'POST', body: { email, purpose: 'RESET' } }); setLeft(60); return true; }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.'); return false; }
  }

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    if (!emailSchema.safeParse(email).success) return setErrors({ email: 'Adresse e-mail invalide.' });
    setErrors({});
    setLoading(true);
    if (await send()) { setInfo(null); setStep('code'); }
    setLoading(false);
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    const body = { email, ...values, passwordConfirm: values.password };
    const v = validate(resetWithCodeSchema, body);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setError(null);
    setLoading(true);
    try {
      await api('/auth/password/reset-code', { method: 'POST', body });
      setStep('done');
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fieldErrors()); setError(err.issues.length ? null : err.message); }
      else setError('Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'done') {
    return (
      <AuPage>
        <h1 className="au-title">Mot de passe modifié</h1>
        <p className="au-note" style={{ textAlign: 'center', marginBottom: 24 }}>Vous pouvez vous connecter avec votre nouveau mot de passe. Vos autres sessions ont été fermées.</p>
        <button className="au-btn" onClick={() => router.push('/connexion')}>Se connecter</button>
      </AuPage>
    );
  }

  if (step === 'code') {
    return (
      <AuPage>
        <form onSubmit={onReset} noValidate>
          <AuTop title="Nouveau mot de passe" onBack={() => { setStep('email'); setError(null); }} />
          <h2 className="au-code-title">Saisissez votre<br />code de vérification</h2>
          <AuOtp value={values.code} onChange={(code) => setValues({ ...values, code })} />
          {errors.code && <p className="au-err" style={{ marginTop: -8, marginBottom: 12 }}>{errors.code}</p>}
          <p className="au-note">Si un compte correspond à <b>{maskEmail(email)}</b>, un code vient d’y être envoyé (valable 10 minutes). Pensez à vérifier vos courriers indésirables.</p>
          <button type="button" className="au-resend" disabled={left > 0} onClick={async () => { setInfo(null); if (await send()) setInfo('Un nouveau code vient de vous être envoyé.'); }}>
            {left > 0 ? `Je n’ai pas reçu le code ? Renvoyer dans ${left} s` : 'Je n’ai pas reçu le code ? Renvoyer'}
          </button>
          {info && <p className="au-hint ok" style={{ marginTop: -8, marginBottom: 12 }}>{info}</p>}
          <AuField id="password" label="Nouveau mot de passe" error={errors.password}
            hint={`${PASSWORD_MIN} caractères minimum, avec lettres et chiffres.`} hintTone={values.password ? (pwOk ? 'ok' : 'bad') : undefined}>
            <AuPassword id="password" value={values.password} autoComplete="new-password" placeholder="Créez un mot de passe" invalid={!!errors.password}
              onChange={(v) => setValues({ ...values, password: v })} />
          </AuField>
          <AuAlert>{error}</AuAlert>
          <button className="au-btn" disabled={loading || values.code.length !== 6}>{loading ? 'Modification…' : 'Changer le mot de passe'}</button>
        </form>
      </AuPage>
    );
  }

  return (
    <AuPage>
      <form onSubmit={onEmail} noValidate>
        <AuTop title="Mot de passe oublié" onBack={() => router.push('/connexion')} />
        <p className="au-lead">Pas de souci !</p>
        <p>Indiquez l’adresse e-mail de votre compte : vous recevrez un code à 6 chiffres.</p>
        <AuAlert>{error}</AuAlert>
        <AuField id="email" label="E-mail" error={errors.email}>
          <input id="email" type="email" autoComplete="email" placeholder="exemple@gmail.com" value={email} aria-invalid={!!errors.email || undefined} onChange={(e) => setEmail(e.target.value)} />
        </AuField>
        <button className="au-btn" disabled={loading}>{loading ? 'Envoi du code…' : 'Recevoir le code'}</button>
        <p className="au-alt"><Link href="/connexion">Retour à la connexion</Link></p>
      </form>
    </AuPage>
  );
}
