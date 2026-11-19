'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { changePasswordSchema, PERMISSIONS, PLATFORM_ROLES, RESTAURANT_ROLES, updateProfileSchema, type MeResponse, type Permission } from '@plateforme/contracts';
import { CodeInput, ResendButton } from '@/components/code-input';
import { CustomerNavigation } from '@/components/client/customer-navigation';
import { MobileScreen } from '@/components/mobile';
import { Alert, AppIcon, Badge, Button, Field, IconLogout, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { validate } from '@/lib/forms';
import { useSession } from '@/lib/session';

const roleLabel = (code: string) =>
  [...RESTAURANT_ROLES, ...PLATFORM_ROLES].find((r) => r.code === code)?.label ?? code;

function ProfileForm({ me, onSaved }: { me: MeResponse; onSaved: (m: MeResponse) => void }) {
  const [values, setValues] = useState({ fullName: me.fullName });
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
      <Field label="E-mail" type="email" value={me.email ?? ''} disabled hint={me.email ? 'Adresse utilisée pour vos codes de sécurité. Pour la changer, contactez l’assistance.' : 'Aucune adresse e-mail sur ce compte.'} />
      <Button type="submit" loading={loading}>Enregistrer</Button>
    </form>
  );
}

function PasswordForm({ hasEmail }: { hasEmail: boolean }) {
  const empty = { currentPassword: '', code: '', password: '', passwordConfirm: '' };
  const [sentTo, setSentTo] = useState<string | null>(null);
  async function askCode() {
    setMsg(null);
    try { const r = await api<{ sentTo: string }>('/users/me/password/code', { method: 'POST' }); setSentTo(r.sentTo); return true; }
    catch (err) { setMsg({ tone: 'danger', text: err instanceof ApiError ? err.message : 'Erreur.' }); return false; }
  }
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = hasEmail ? { code: values.code, password: values.password, passwordConfirm: values.passwordConfirm } : { currentPassword: values.currentPassword, password: values.password, passwordConfirm: values.passwordConfirm };
    const v = validate(changePasswordSchema, body);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setLoading(true);
    try {
      await api('/users/me/password', { method: 'POST', body });
      setValues(empty);
      setSentTo(null);
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
      {hasEmail && !sentTo ? (
        <Button type="button" variant="secondary" onClick={() => void askCode()}>Recevoir un code par e-mail</Button>
      ) : hasEmail ? (
        <>
          <p className="text-sm text-ink-muted">Code envoyé à {sentTo} (valable 10 minutes).</p>
          <CodeInput value={values.code} onChange={(code) => setValues({ ...values, code })} error={errors.code} />
          <ResendButton onResend={askCode} />
        </>
      ) : (
        <Field label="Mot de passe actuel" type="password" autoComplete="current-password" value={values.currentPassword}
          onChange={(e) => setValues({ ...values, currentPassword: e.target.value })} error={errors.currentPassword} />
      )}
      {(!hasEmail || sentTo) && <>
      <Field label="Nouveau mot de passe" type="password" autoComplete="new-password" value={values.password}
        onChange={(e) => setValues({ ...values, password: e.target.value })} error={errors.password} />
      <Field label="Confirmer" type="password" autoComplete="new-password" value={values.passwordConfirm}
        onChange={(e) => setValues({ ...values, passwordConfirm: e.target.value })} error={errors.passwordConfirm} />
      <Button type="submit" variant="secondary" loading={loading}>Changer le mot de passe</Button>
      </>}
    </form>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { me, loading, setMe } = useSession();
  const [loggingOut, setLoggingOut] = useState(false);
  const [openSection, setOpenSection] = useState<'personal' | 'security' | null>(null);
  const leaving = useRef(false);

  useEffect(() => {
    if (!loading && !me && !leaving.current) router.replace('/connexion?suite=/compte');
  }, [loading, me, router]);

  if (loading || !me) {
    return <MobileScreen wide><div className="grid flex-1 place-items-center text-brand"><Spinner /></div></MobileScreen>;
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

  const rowCls = 'flex min-h-[64px] w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-[#F6F6F8]';
  const chevron = <AppIcon name="chevron-down" className="size-5 shrink-0 -rotate-90 text-ink-muted" />;
  const icon = (name: 'receipt-text' | 'map-pin' | 'bell' | 'user-round' | 'settings' | 'headset') => (
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand"><AppIcon name={name} className="size-5" /></span>
  );
  const Line = () => <div className="mx-4 border-t border-line" />;

  return (
    <MobileScreen wide className="client-brand bg-white">
      <div className="mx-auto w-full max-w-[640px] space-y-5 px-5 pb-28 pt-5 md:pt-8">
        <header className="flex items-center justify-between">
          <h1 className="text-[24px] font-extrabold tracking-tight">Profil</h1>
          <button type="button" aria-label="Réglages du compte" onClick={() => setOpenSection(openSection === 'personal' ? null : 'personal')}
            className="grid size-11 place-items-center rounded-2xl border border-line bg-white"><AppIcon name="settings" className="size-5" /></button>
        </header>

        <section className="flex items-center gap-4 rounded-3xl bg-brand-50 p-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-full bg-brand text-xl font-extrabold text-white shadow-[var(--shadow-raised)]" aria-hidden>{initials}</span>
          <div className="min-w-0">
            <h2 className="truncate text-[18px] font-extrabold">{me.fullName}</h2>
            <p className="mt-0.5 text-sm text-ink-muted">{me.phone}</p>
            {me.email && <p className="truncate text-xs text-ink-muted">{me.email}</p>}
          </div>
        </section>

        {(me.platformRoles.length > 0 || me.restaurants.length > 0) && (
          <section className="rounded-2xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-extrabold">Mes accès professionnels</h2>
              <div className="flex gap-3 text-sm font-bold">
                {me.restaurants.length > 0 && <a href="/pro" className="text-brand">Espace restaurant →</a>}
                {me.platformRoles.length > 0 && <a href="/admin" className="text-brand">Administration →</a>}
                {me.platformPermissions.includes('ops.orders.view_all') && <a href="/operations" className="text-brand">Opérations →</a>}
              </div></div>
            <ul className="mt-3 space-y-3">
              {me.platformRoles.map((r) => (
                <li key={r} className="flex flex-wrap items-center gap-2 text-sm"><Badge tone="dark">Plateforme</Badge> <span className="font-semibold">{roleLabel(r)}</span></li>
              ))}
              {me.restaurants.map((r) => (
                <li key={r.restaurantId} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge>Restaurant</Badge> <span className="font-semibold">{r.name}</span>
                  <span className="text-ink-muted">· {roleLabel(r.role)}</span>
                  {r.permissions.length === 0 && <Badge tone="danger">Suspendu</Badge>}
                  <details className="w-full text-ink-muted">
                    <summary className="cursor-pointer">Voir mes permissions ({r.permissions.length})</summary>
                    <ul className="mt-2 space-y-1">{r.permissions.map((p) => <li key={p}>• {PERMISSIONS[p as Permission]?.label ?? p}</li>)}</ul>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        )}

        <nav aria-label="Mon compte" className="overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]">
          <Link href="/commandes" className={rowCls}>{icon('receipt-text')}<span className="flex-1 text-[15px] font-bold">Mes commandes</span>{chevron}</Link>
          <Line />
          <Link href="/compte/adresses" className={rowCls}>{icon('map-pin')}<span className="flex-1 text-[15px] font-bold">Mes adresses</span>{chevron}</Link>
          <Line />
          <Link href="/notifications" className={rowCls}>{icon('bell')}<span className="flex-1 text-[15px] font-bold">Notifications</span>{chevron}</Link>
          <Line />
          <button type="button" className={rowCls} aria-expanded={openSection === 'personal'} aria-controls="profile-personal-panel" onClick={() => setOpenSection(openSection === 'personal' ? null : 'personal')}>
            {icon('user-round')}<span className="min-w-0 flex-1"><span className="block text-[15px] font-bold">Informations personnelles</span><span className="block truncate text-xs text-ink-muted">Modifier mon nom</span></span>
            <AppIcon name="chevron-down" className={`size-5 shrink-0 text-ink-muted transition-transform ${openSection === 'personal' ? 'rotate-180' : ''}`} />
          </button>
          {openSection === 'personal' && (
            <div id="profile-personal-panel" className="border-t border-line bg-[#FAFAFB] p-4">
              <p className="mb-3 text-xs leading-relaxed text-ink-muted">Modifiez votre nom. Les changements de téléphone ou d’adresse e-mail nécessitent une vérification.</p>
              <ProfileForm me={me} onSaved={setMe} />
            </div>
          )}
          <Line />
          <button type="button" className={rowCls} aria-expanded={openSection === 'security'} aria-controls="profile-security-panel" onClick={() => setOpenSection(openSection === 'security' ? null : 'security')}>
            {icon('settings')}<span className="min-w-0 flex-1"><span className="block text-[15px] font-bold">Mot de passe</span><span className="block truncate text-xs text-ink-muted">{me.email ? 'Confirmation par code envoyé par e-mail' : 'Confirmez votre mot de passe actuel'}</span></span>
            <AppIcon name="chevron-down" className={`size-5 shrink-0 text-ink-muted transition-transform ${openSection === 'security' ? 'rotate-180' : ''}`} />
          </button>
          {openSection === 'security' && (
            <div id="profile-security-panel" className="border-t border-line bg-[#FAFAFB] p-4">
              <p className="mb-3 text-xs leading-relaxed text-ink-muted">Suivez les étapes pour vérifier votre identité puis choisir un nouveau mot de passe.</p>
              <PasswordForm hasEmail={!!me.email} />
            </div>
          )}
          <Line />
          <Link href="/aide" className={rowCls}>{icon('headset')}<span className="min-w-0 flex-1"><span className="block text-[15px] font-bold">Aide et assistance</span><span className="block text-xs text-ink-muted">Contacter l’assistance Miamigo</span></span>{chevron}</Link>
        </nav>

        <div className="space-y-2 text-center">
          {me.restaurants.length === 0 && <Link href="/devenir-partenaire" className="block text-sm font-semibold text-brand">Vous êtes restaurateur ? Inscrivez votre établissement</Link>}
          <Link href="/livreur" className="block text-sm font-semibold text-brand">Espace livreur</Link>
        </div>

        <button type="button" onClick={logout} disabled={loggingOut}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-brand text-[16px] font-bold text-brand disabled:opacity-60">
          <IconLogout className="size-5" /> {loggingOut ? 'Déconnexion…' : 'Se déconnecter'}
        </button>
      </div>
      <CustomerNavigation />
    </MobileScreen>
  );
}
