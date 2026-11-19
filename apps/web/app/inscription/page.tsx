'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { PASSWORD_MIN, passwordSchema, registerSchema, type MeResponse } from '@plateforme/contracts';
import { AuAlert, AuField, AuOtp, AuPage, AuPassword, AuTop, maskEmail, useCountdown } from '@/components/auth/au';
import { GoogleSignIn } from '@/components/google-sign-in';
import { api, ApiError } from '@/lib/api';
import { validate } from '@/lib/forms';
import { useSession } from '@/lib/session';

const EMPTY = { fullName: '', phone: '', email: '', password: '' };

/** N'accepte qu'une redirection interne (évite les redirections ouvertes). */
function safeNext(v: string | null) {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/accueil';
}

/**
 * Inscription client — modèle épuré, en deux écrans : informations, puis code à 6 chiffres reçu par e-mail
 * (le compte n'est créé qu'une fois le code validé).
 */
function Register() {
  const router = useRouter();
  const params = useSearchParams();
  const { setMe } = useSession();
  const [values, setValues] = useState(EMPTY);
  const [accept, setAccept] = useState(false);
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [left, setLeft] = useCountdown(0);
  const [validity, setValidity] = useState(600);
  const [info, setInfo] = useState<string | null>(null);
  const next = safeNext(params.get('suite'));
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [k]: e.target.value });
  const pwOk = passwordSchema.safeParse(values.password).success;
  // Le serveur exige la confirmation du mot de passe : l'écran n'en demande qu'une (l'œil permet de vérifier la saisie).
  const payload = () => ({ ...values, passwordConfirm: values.password });

  useEffect(() => {
    if (step !== 'code') return;
    const t = setInterval(() => setValidity((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [step]);
  const mmss = `${String(Math.floor(validity / 60)).padStart(2, '0')}:${String(validity % 60).padStart(2, '0')}`;

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
      setLeft(60);
      setValidity(600);
      return true;
    } catch (err) { fail(err); return false; }
  }

  async function onDetails(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v = validate(registerSchema, { ...payload(), code: '000000' }); // le code est demandé à l'écran suivant
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setLoading(true);
    if (await sendCode()) { setCode(''); setInfo(null); setStep('code'); }
    setLoading(false);
  }

  async function onCode(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return setFormError('Le code contient 6 chiffres.');
    setFormError(null);
    setLoading(true);
    try {
      setMe(await api<MeResponse>('/auth/register', { method: 'POST', body: { ...payload(), code } }));
      router.replace(next);
    } catch (err) {
      fail(err);
      if (err instanceof ApiError && ['PHONE_TAKEN', 'EMAIL_TAKEN'].includes(err.code)) setStep('details');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setInfo(null);
    if (await sendCode()) setInfo('Un nouveau code vient de vous être envoyé.');
  }

  if (step === 'code') {
    return (
      <AuPage>
        <form onSubmit={onCode} noValidate>
          <AuTop title="Vérification" onBack={() => { setStep('details'); setFormError(null); }} />
          <h2 className="au-code-title">Saisissez votre<br />code de vérification</h2>
          <AuOtp value={code} onChange={setCode} />
          <p className="au-note" style={{ fontWeight: 600, color: 'var(--au-o)', marginBottom: 12 }}>{validity > 0 ? mmss : 'Code expiré : demandez-en un nouveau'}</p>
          <p className="au-note">Nous avons envoyé un code de vérification à votre adresse <b>{maskEmail(values.email)}</b>. Consultez votre boîte de réception (et les courriers indésirables).</p>
          <button type="button" className="au-resend" disabled={left > 0} onClick={resend}>
            {left > 0 ? `Je n’ai pas reçu le code ? Renvoyer dans ${left} s` : 'Je n’ai pas reçu le code ? Renvoyer'}
          </button>
          {info && <p className="au-hint ok" style={{ marginTop: -8, marginBottom: 12 }}>{info}</p>}
          <AuAlert>{formError}</AuAlert>
          <button className="au-btn" disabled={loading || code.length !== 6}>{loading ? 'Création…' : 'Vérifier'}</button>
        </form>
      </AuPage>
    );
  }

  return (
    <AuPage>
      <form onSubmit={onDetails} noValidate>
        <h1 className="au-title">Inscription</h1>
        <p className="au-lead">C’est parti !</p>
        <p>Créez votre compte</p>

        <AuAlert>{formError}</AuAlert>
        <AuField id="fullName" label="Nom complet" error={errors.fullName}>
          <input id="fullName" autoComplete="name" placeholder="Ex. : Koffi Agbo" value={values.fullName} aria-invalid={!!errors.fullName || undefined} onChange={set('fullName')} />
        </AuField>
        <AuField id="email" label="E-mail" error={errors.email}>
          <input id="email" type="email" autoComplete="email" placeholder="exemple@gmail.com" value={values.email} aria-invalid={!!errors.email || undefined} onChange={set('email')} />
        </AuField>
        <AuField id="phone" label="Numéro de téléphone" error={errors.phone}>
          <div className="au-row">
            <select className="cc" aria-label="Indicatif" defaultValue="+229"><option value="+229">+229</option></select>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="01 97 00 00 00" value={values.phone} aria-invalid={!!errors.phone || undefined} onChange={set('phone')} />
          </div>
        </AuField>
        <AuField id="password" label="Mot de passe" error={errors.password}
          hint={`${PASSWORD_MIN} caractères minimum, avec lettres et chiffres.`} hintTone={values.password ? (pwOk ? 'ok' : 'bad') : undefined}>
          <AuPassword id="password" value={values.password} autoComplete="new-password" placeholder="Créez un mot de passe" invalid={!!errors.password}
            onChange={(v) => setValues({ ...values, password: v })} />
        </AuField>
        <label className="au-check">
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          <span>J’accepte que mes données servent à traiter mes commandes et livraisons. <Link href="/confidentialite" className="au-link">Confidentialité</Link></span>
        </label>
        <button className="au-btn" disabled={loading || !accept}>{loading ? 'Envoi du code…' : 'S’inscrire'}</button>
      </form>

      <div className="au-or" style={{ marginTop: 18 }}>ou</div>
      <GoogleSignIn onAuthenticated={(user) => { setMe(user); router.replace(next); }} />

      <p className="au-alt">Déjà un compte ? <Link href="/connexion">Se connecter</Link></p>
    </AuPage>
  );
}

export default function RegisterPage() {
  return <Suspense><Register /></Suspense>;
}
