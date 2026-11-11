'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, Field } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (identifier.trim().length < 3) return setError('Saisissez votre téléphone ou votre e-mail.');
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ message: string }>('/auth/password/forgot', { method: 'POST', body: { identifier } });
      setDone(r.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell backHref={'/connexion'} title="Mot de passe oublié" subtitle="Indiquez le téléphone ou l’e-mail de votre compte."
      footer={<Link href="/connexion" className="font-semibold text-brand-600 hover:underline">Retour à la connexion</Link>}>
      {done ? (
        <Alert tone="success" title="Demande enregistrée">{done}</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Téléphone ou e-mail" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
          <Button type="submit" block size="lg" loading={loading}>Recevoir les instructions</Button>
        </form>
      )}
    </AuthShell>
  );
}
