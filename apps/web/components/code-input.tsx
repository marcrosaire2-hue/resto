'use client';
import { useEffect, useState } from 'react';
import { Field } from './ui';

/** Saisie du code à 6 chiffres reçu par e-mail (remplissage automatique proposé par le téléphone). */
export function CodeInput({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field label="Code reçu par e-mail" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••"
      value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} error={error}
      className="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.5em]" />
  );
}

/** Bouton « Renvoyer le code » avec compte à rebours (le serveur impose aussi le délai). */
export function ResendButton({ onResend, seconds = 60 }: { onResend: () => Promise<boolean>; seconds?: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <button type="button" disabled={left > 0} onClick={async () => { if (await onResend()) setLeft(seconds); }}
      className="text-sm font-semibold text-brand-600 disabled:text-ink-muted">
      {left > 0 ? `Renvoyer le code dans ${left} s` : 'Renvoyer le code'}
    </button>
  );
}
