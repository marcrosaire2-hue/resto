'use client';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { changePasswordSchema, PERMISSIONS, PLATFORM_ROLES, RESTAURANT_ROLES, updateProfileSchema, type MeResponse, type Permission } from '@plateforme/contracts';
import { CircleButton, MobileScreen } from '@/components/mobile';
import { Alert, Badge, Button, Card, Field, IconArrowLeft, IconLogout, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { validate } from '@/lib/forms';
import { useSession } from '@/lib/session';

const roleLabel = (code: string) =>
  [...RESTAURANT_ROLES, ...PLATFORM_ROLES].find((r) => r.code === code)?.label ?? code;

function ProfileForm({ me, onSaved }: { me: MeResponse; onSaved: (m: MeResponse) => void }) {
  const [values, setValues] = useState({ fullName: me.fullName, email: me.email ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validate(updateProfileSchema, values);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setLoading(true);
    try {
      onSaved(await api<MeResponse>('/users/me', { method: 'PATCH', body: values }));
      setMsg({ tone: 'success', text: 'Profil mis à jour.' });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setMsg({ tone: 'danger', text: err instanceof ApiError ? err.message : 'Erreur.' });
    } finally {
      setLoading(false);
    }
  }
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Field label="Nom complet" value={values.fullName} onChange={(e) => setValues({ ...values, fullName: e.target.value })} error={errors.fullName} />
      <Field label="Téléphone" value={me.phone} disabled hint={me.phoneVerified ? 'Numéro vérifié.' : 'La modification du numéro passera par une vérification par SMS (bientôt disponible).'} />
      <Field label="E-mail (facultatif)" type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} error={errors.email} />
      <Button type="submit" loading={loading}>Enregistrer</Button>
    </form>
  );
}

function PasswordForm() {
  const empty = { currentPassword: '', password: '', passwordConfirm: '' };
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validate(changePasswordSchema, values);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setLoading(true);
    try {
      await api('/users/me/password', { method: 'POST', body: values });
      setValues(empty);
      setMsg({ tone: 'success', text: 'Mot de passe modifié. Vos autres sessions ont été fermées.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof ApiError ? err.message : 'Erreur.' });
    } finally {
      setLoading(false);
    }
  }
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Field label="Mot de passe actuel" type="password" autoComplete="current-password" value={values.currentPassword}
        onChange={(e) => setValues({ ...values, currentPassword: e.target.value })} error={errors.currentPassword} />
      <Field label="Nouveau mot de passe" type="password" autoComplete="new-password" value={values.password}
        onChange={(e) => setValues({ ...values, password: e.target.value })} error={errors.password} />
      <Field label="Confirmer" type="password" autoComplete="new-password" value={values.passwordConfirm}
        onChange={(e) => setValues({ ...values, passwordConfirm: e.target.value })} error={errors.passwordConfirm} />
      <Button type="submit" variant="secondary" loading={loading}>Changer le mot de passe</Button>
    </form>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { me, loading, setMe } = useSession();
  const [loggingOut, setLoggingOut] = useState(false);
  const leaving = useRef(false);

  useEffect(() => {
    if (!loading && !me && !leaving.current) router.replace('/connexion?suite=/compte');
  }, [loading, me, router]);

  if (loading || !me) {
    return <MobileScreen><div className="grid flex-1 place-items-center text-brand"><Spinner /></div></MobileScreen>;
  }

  async function logout() {
    setLoggingOut(true);
    leaving.current = true;
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setMe(null);
      router.replace('/');
    }
  }

  const initials = me.fullName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

  return (
    <MobileScreen>
      {/* En-tête pêche (maquette 1, écran 2) */}
      <header className="bg-header-peach px-5 pb-6 pt-6">
        <div className="flex items-center justify-between">
          <CircleButton href="/accueil" label="Retour à l’accueil"><IconArrowLeft className="size-5" /></CircleButton>
          <span className="text-sm font-bold text-ink">Mon compte</span>
          <CircleButton label="Se déconnecter" onClick={logout}>
            {loggingOut ? <Spinner className="size-4 text-brand" /> : <IconLogout className="size-5" />}
          </CircleButton>
        </div>
        <div className="mt-6 flex items-center gap-4">
          <span className="grid size-16 place-items-center rounded-[18px] bg-cta text-xl font-extrabold text-white shadow-[var(--shadow-raised)]">{initials}</span>
          <div className="min-w-0">
            <p className="text-sm text-ink-muted">Bonjour,</p>
            <h1 className="truncate text-xl font-extrabold">{me.fullName}</h1>
            <p className="text-sm text-ink-muted">{me.phone}</p>
          </div>
        </div>
      </header>

      <main className="space-y-4 px-5 pb-10">
        {(me.platformRoles.length > 0 || me.restaurants.length > 0) && (
          <Card className="p-4">
            <div className="flex items-center justify-between"><h2 className="font-bold">Mes accès professionnels</h2>
              <div className="flex gap-3 text-sm font-semibold">
                {me.restaurants.length > 0 && <a href="/pro" className="text-brand">Espace restaurant →</a>}
                {me.platformRoles.length > 0 && <a href="/admin" className="text-brand">Administration →</a>}
                {me.platformPermissions.includes('ops.orders.view_all') && <a href="/operations" className="text-brand">Opérations →</a>}
              </div></div>
            <ul className="mt-3 space-y-3">
              {me.platformRoles.map((r) => (
                <li key={r} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="dark">Plateforme</Badge> <span className="font-semibold">{roleLabel(r)}</span>
                </li>
              ))}
              {me.restaurants.map((r) => (
                <li key={r.restaurantId} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge>Restaurant</Badge> <span className="font-semibold">{r.name}</span>
                  <span className="text-ink-muted">· {roleLabel(r.role)}</span>
                  {r.permissions.length === 0 && <Badge tone="danger">Suspendu</Badge>}
                  <details className="w-full text-ink-muted">
                    <summary className="cursor-pointer">Voir mes permissions ({r.permissions.length})</summary>
                    <ul className="mt-2 space-y-1">
                      {r.permissions.map((p) => <li key={p}>• {PERMISSIONS[p as Permission]?.label ?? p}</li>)}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <div className="grid grid-cols-2 gap-3">
          <a href="/commandes" className="rounded-[14px] bg-surface p-4 text-sm font-semibold shadow-[var(--shadow-card)]">🧾 Mes commandes</a>
          <a href="/compte/adresses" className="rounded-[14px] bg-surface p-4 text-sm font-semibold shadow-[var(--shadow-card)]">📍 Mes adresses</a>
        </div>
        <Card className="p-4">
          <h2 className="mb-4 font-bold">Informations personnelles</h2>
          <ProfileForm me={me} onSaved={setMe} />
        </Card>
        <Card className="p-4">
          <h2 className="mb-4 font-bold">Sécurité</h2>
          <PasswordForm />
        </Card>
        {me.restaurants.length === 0 && <a href="/devenir-partenaire" className="block text-center text-sm font-semibold text-brand">Vous êtes restaurateur ? Inscrivez votre établissement</a>}
        <a href="/livreur" className="block text-center text-sm font-semibold text-brand">Espace livreur</a>
        <Button variant="outline" block onClick={logout} loading={loggingOut}><IconLogout className="size-4" /> Se déconnecter</Button>
      </main>
    </MobileScreen>
  );
}
