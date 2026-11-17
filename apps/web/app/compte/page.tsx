'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { changePasswordSchema, PERMISSIONS, PLATFORM_ROLES, RESTAURANT_ROLES, updateProfileSchema, type MeResponse, type Permission } from '@plateforme/contracts';
import { CodeInput, ResendButton } from '@/components/code-input';
import { CustomerNavigation } from '@/components/client/customer-navigation';
import { CircleButton, MobileScreen } from '@/components/mobile';
import { Alert, AppIcon, Badge, Button, Card, Field, IconArrowLeft, IconLogout, Spinner } from '@/components/ui';
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

  return (
    <MobileScreen wide>
      {/* En-tête pêche (maquette 1, écran 2) */}
      <header className="client-profile-hero relative isolate overflow-hidden px-5 pb-7 pt-6 text-white md:min-h-[300px] md:px-12 md:pb-10 md:pt-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/demo/resto-2.jpg" alt="" className="absolute inset-0 -z-20 size-full object-cover object-center" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#102f24]/95 via-[#153d2d]/82 to-[#153d2d]/48" aria-hidden />
        <div className="mx-auto max-w-[760px] md:max-w-[1180px]">
          <div className="flex items-center gap-3">
            <CircleButton href="/accueil" label="Retour à l’accueil"><IconArrowLeft className="size-5" /></CircleButton>
            <span className="text-sm font-bold text-white">Mon compte</span>
          </div>
          <div className="mt-7 flex items-center gap-4 md:mt-12 md:gap-6">
            <span className="grid size-[68px] shrink-0 place-items-center rounded-[22px] border-2 border-white/75 bg-[#d8ef9b] text-xl font-extrabold text-[#173c2d] shadow-[0_12px_30px_rgb(0_0_0/0.2)] md:size-24 md:rounded-[30px] md:text-3xl">{initials}</span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d8ef9b]">Mon espace personnel</p>
              <h1 className="truncate text-xl font-extrabold md:text-4xl">{me.fullName}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-white/80"><AppIcon name="user-round" className="size-4" /> {me.phone}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[760px] space-y-5 px-4 pb-28 pt-5 md:max-w-[1180px] md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(280px,.7fr)] md:items-start md:gap-7 md:space-y-0 md:px-8 md:pt-8">
        {(me.platformRoles.length > 0 || me.restaurants.length > 0) && (
          <Card className="p-4 md:col-span-2 md:p-6">
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
        <section className="space-y-3 md:col-start-1 md:space-y-5">
          <div className="px-1">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand">Réglages du compte</p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight">Que souhaitez-vous modifier ?</h2>
          </div>
          <div className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]">
            <button type="button" aria-expanded={openSection === 'personal'} aria-controls="profile-personal-panel"
              onClick={() => setOpenSection(openSection === 'personal' ? null : 'personal')}
              className="flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas md:px-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand"><AppIcon name="user-round" className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold">Modifier mes informations personnelles</span>
                <span className="mt-0.5 block truncate text-xs text-ink-muted">{me.fullName} · {me.phone}</span>
              </span>
              <AppIcon name="chevron-down" className={`size-5 text-ink-muted transition-transform ${openSection === 'personal' ? 'rotate-180' : ''}`} />
            </button>
            {openSection === 'personal' && (
              <div id="profile-personal-panel" className="border-t border-line bg-canvas/70 p-4 md:px-5 md:py-5">
                <div className="mb-4">
                  <h3 className="font-bold">Informations personnelles</h3>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">Modifiez votre nom. Les changements de téléphone ou d’adresse e-mail nécessitent une vérification.</p>
                </div>
                <ProfileForm me={me} onSaved={setMe} />
              </div>
            )}
            <div className="mx-4 border-t border-line md:mx-5" />
            <button type="button" aria-expanded={openSection === 'security'} aria-controls="profile-security-panel"
              onClick={() => setOpenSection(openSection === 'security' ? null : 'security')}
              className="flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas md:px-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#fff4df] text-[#9a650f]"><AppIcon name="settings" className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold">Changer mon mot de passe</span>
                <span className="mt-0.5 block text-xs text-ink-muted">{me.email ? 'Confirmation par code envoyé par e-mail' : 'Confirmez votre mot de passe actuel'}</span>
              </span>
              <AppIcon name="chevron-down" className={`size-5 text-ink-muted transition-transform ${openSection === 'security' ? 'rotate-180' : ''}`} />
            </button>
            {openSection === 'security' && (
              <div id="profile-security-panel" className="border-t border-line bg-canvas/70 p-4 md:px-5 md:py-5">
                <div className="mb-4">
                  <h3 className="font-bold">Sécurité du compte</h3>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">Suivez les étapes pour vérifier votre identité puis choisir un nouveau mot de passe.</p>
                </div>
                <PasswordForm hasEmail={!!me.email} />
              </div>
            )}
          </div>
        </section>
        <aside className="space-y-4 md:col-start-2">
          <section>
            <h2 className="mb-2 px-1 text-sm font-extrabold">Votre activité</h2>
            <div className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]">
              <Link href="/commandes" className="flex min-h-[68px] items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand"><AppIcon name="receipt-text" className="size-5" /></span>
                <span className="flex-1"><span className="block text-sm font-bold">Mes commandes</span><span className="text-xs text-ink-muted">Suivre mes livraisons</span></span>
                <AppIcon name="arrow-right" className="size-4 text-ink-muted" />
              </Link>
              <div className="mx-4 border-t border-line" />
              <Link href="/compte/adresses" className="flex min-h-[68px] items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand"><AppIcon name="map-pin" className="size-5" /></span>
                <span className="flex-1"><span className="block text-sm font-bold">Mes adresses</span><span className="text-xs text-ink-muted">Gérer mes lieux de livraison</span></span>
                <AppIcon name="arrow-right" className="size-4 text-ink-muted" />
              </Link>
              <div className="mx-4 border-t border-line" />
              <Link href="/notifications" className="flex min-h-[68px] items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand"><AppIcon name="bell" className="size-5" /></span>
                <span className="flex-1"><span className="block text-sm font-bold">Notifications</span><span className="text-xs text-ink-muted">Les nouvelles de vos commandes</span></span>
                <AppIcon name="arrow-right" className="size-4 text-ink-muted" />
              </Link>
            </div>
          </section>
          <Link href="/aide" className="flex min-h-[68px] items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] transition-colors hover:bg-canvas">
            <span className="grid size-10 place-items-center rounded-xl bg-[#eaf4ea] text-brand"><AppIcon name="headset" className="size-5" /></span>
            <span className="flex-1"><span className="block text-sm font-bold">Besoin d’aide ?</span><span className="text-xs text-ink-muted">Contacter l’assistance Miamigo</span></span>
            <AppIcon name="arrow-right" className="size-4 text-ink-muted" />
          </Link>
          {me.restaurants.length === 0 && <Link href="/devenir-partenaire" className="block px-2 text-center text-sm font-semibold text-brand">Vous êtes restaurateur ? Inscrivez votre établissement</Link>}
          <Link href="/livreur" className="block px-2 text-center text-sm font-semibold text-brand">Espace livreur</Link>
        </aside>
        <div className="border-t border-line pt-4 md:col-span-2 md:pt-6">
          <Button variant="outline" block onClick={logout} loading={loggingOut}
            className="h-12 rounded-2xl border-danger/20 bg-danger-50 font-extrabold text-danger shadow-none hover:bg-danger-50 md:mx-auto md:max-w-sm">
            <IconLogout className="size-4" /> Se déconnecter
          </Button>
        </div>
      </main>
      <CustomerNavigation />
    </MobileScreen>
  );
}
