'use client';
import { ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Éléments des écrans de connexion / inscription (même construction que Dépano Express).
 * Les styles sont dans globals.css (.au*) ; la couleur d'accent suit le thème client.
 */

/** Page : fond blanc, colonne centrée de 460 px. */
export function AuPage({ children }: { children: ReactNode }) {
  return <main className="au client-brand"><div className="au-wrap">{children}</div></main>;
}

const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

/** Barre du haut : flèche retour, titre centré. */
export function AuTop({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="au-top">
      <button type="button" className="au-back" aria-label="Retour" onClick={onBack}><Svg><path d="m15 18-6-6 6-6" /></Svg></button>
      <h1>{title}</h1>
      <span />
    </div>
  );
}

/** Champ : libellé au-dessus, case grise, message d'erreur ou aide dessous. */
export function AuField({ id, label, error, hint, hintTone, children }: {
  id: string; label: string; error?: string; hint?: string; hintTone?: 'ok' | 'bad'; children: ReactNode;
}) {
  return (
    <div className="au-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <p className="au-err" role="alert">{error}</p> : hint ? <p className={`au-hint${hintTone ? ` ${hintTone}` : ''}`}>{hint}</p> : null}
    </div>
  );
}

/** Mot de passe avec œil pour afficher / masquer. */
export function AuPassword({ id, value, onChange, placeholder = 'Mot de passe', autoComplete = 'current-password', invalid }: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string; invalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="finput pw">
      <input id={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} placeholder={placeholder} value={value}
        aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={show}>
        {show
          ? <Svg><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></Svg>
          : <Svg><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /><path d="M4 20 20 4" /></Svg>}
      </button>
    </div>
  );
}

/** Message d'erreur général du formulaire. */
export function AuAlert({ children }: { children?: ReactNode }) {
  return children ? <div className="au-alert" role="alert">{children}</div> : null;
}

/** Code à 6 chiffres en cases séparées (collage et remplissage automatique acceptés). */
export function AuOtp({ value, onChange, autoFocus = true }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');
  const setAt = (i: number, d: string) => { const arr = [...digits]; arr[i] = d; onChange(arr.join('').slice(0, 6)); };
  return (
    <div className="otp" role="group" aria-label="Code à 6 chiffres">
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6}
          aria-label={`Chiffre ${i + 1}`} autoFocus={autoFocus && i === 0} value={d}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            if (v.length > 1) { onChange(v.slice(0, 6)); refs.current[Math.min(v.length, 5)]?.focus(); return; }
            setAt(i, v);
            if (v && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !d && i > 0) { setAt(i - 1, ''); refs.current[i - 1]?.focus(); } }} />
      ))}
    </div>
  );
}

/** Compte à rebours (secondes) pour « Renvoyer le code » et la validité du code. */
export function useCountdown(initial = 0) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft] as const;
}

/** Adresse masquée : « mari*****@gmail.com ». */
export function maskEmail(email: string) {
  const [u, d] = email.split('@');
  return `${u.slice(0, Math.min(4, Math.max(1, u.length - 1)))}*****@${d ?? ''}`;
}
