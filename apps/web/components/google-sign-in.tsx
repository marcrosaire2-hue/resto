'use client';

import Script from 'next/script';
import { FormEvent, useEffect, useRef, useState } from 'react';
import type { MeResponse } from '@plateforme/contracts';
import { Alert, Button, Field } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

interface GoogleIdentityResponse {
  credential: string;
}

interface GoogleIdentity {
  accounts: {
    id: {
      initialize(options: { client_id: string; callback: (response: GoogleIdentityResponse) => void }): void;
      renderButton(parent: HTMLElement, options: {
        theme: 'outline';
        size: 'large';
        shape: 'rectangular';
        text: 'continue_with';
        width: number;
        locale: 'fr';
      }): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

/** Connexion Google via le bouton Google officiel et vérification serveur du jeton. */
export function GoogleSignIn({ onAuthenticated }: { onAuthenticated: (user: MeResponse) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const sendCredential = useRef<(credential: string, phone?: string) => Promise<void>>(async () => {});
  const [clientId, setClientId] = useState<string | null | undefined>(undefined);
  const [scriptReady, setScriptReady] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitCredential(credential: string, phoneNumber?: string) {
    setError(null);
    setLoading(true);
    try {
      const user = await api<MeResponse>('/auth/google', {
        method: 'POST',
        body: { credential, ...(phoneNumber ? { phone: phoneNumber } : {}) },
      });
      setChallenge(null);
      onAuthenticated(user);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'GOOGLE_PHONE_REQUIRED') {
        setChallenge(credential);
      } else {
        setError(e instanceof ApiError ? e.message : 'La connexion Google a échoué. Réessayez.');
      }
    } finally {
      setLoading(false);
    }
  }
  sendCredential.current = submitCredential;

  useEffect(() => {
    let active = true;
    api<{ googleClientId: string | null }>('/auth/providers')
      .then(({ googleClientId: id }) => active && setClientId(id))
      .catch(() => active && setClientId(null));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!clientId || !scriptReady || !host.current || !window.google) return;
    const target = host.current;
    target.replaceChildren();
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: ({ credential }) => { void sendCredential.current(credential); },
    });
    window.google.accounts.id.renderButton(target, {
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      text: 'continue_with',
      width: Math.min(400, Math.max(200, Math.floor(target.getBoundingClientRect().width))),
      locale: 'fr',
    });
    return () => target.replaceChildren();
  }, [clientId, scriptReady]);

  function onPhoneSubmit(event: FormEvent) {
    event.preventDefault();
    if (challenge) void submitCredential(challenge, phone);
  }

  return (
    <div className="space-y-3">
      {clientId && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onReady={() => setScriptReady(true)}
          onError={() => setError('Le service de connexion Google est temporairement inaccessible.')}
        />
      )}
      {clientId ? (
        <div ref={host} className="flex min-h-10 justify-center" aria-label="Se connecter avec Google">
          {!scriptReady && <p className="self-center text-sm text-ink-muted">Chargement de Google…</p>}
        </div>
      ) : clientId === null ? (
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-center text-xs text-ink-muted">
          Connexion Google indisponible pour le moment.
        </p>
      ) : null}
      {challenge && (
        <form onSubmit={onPhoneSubmit} className="auth-reveal space-y-3 rounded-2xl border border-line bg-canvas p-4">
          <p className="text-sm font-semibold text-ink">Encore une étape : indiquez le numéro utilisé par le livreur.</p>
          <Field
            label="Numéro de téléphone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="01 97 00 00 00"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
          />
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" block loading={loading}>Terminer avec Google</Button>
          <button type="button" className="w-full text-sm font-medium text-ink-muted hover:text-ink" onClick={() => { setChallenge(null); setPhone(''); setError(null); }}>
            Annuler
          </button>
        </form>
      )}
      {error && !challenge && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
