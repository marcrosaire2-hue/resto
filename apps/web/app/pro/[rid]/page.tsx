'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { StatusPill } from '@/components/console/form';
import { DashboardPanel } from '@/components/console/dashboard-panel';
import { AppIcon, Card, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useProRestaurant } from '@/lib/pro';
import type { ProMenu, ProProfile } from '@/lib/pro-types';
import { useApi } from '@/lib/use-api';

/** Vue d'ensemble : état réel du restaurant et étapes restantes avant la mise en ligne (aucun chiffre inventé). */
export default function ProOverview() {
  const { rid, can } = useProRestaurant();
  const profile = useApi<ProProfile>(can('restaurant.profile.view') ? `/restaurants/${rid}/profile` : null);
  const menu = useApi<ProMenu>(can('menu.view') ? `/restaurants/${rid}/menu` : null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const p = profile.data;

  async function toggle() {
    if (!p) return;
    setBusy(true);
    try {
      await api(`/restaurants/${rid}/accepting-orders`, { method: 'PATCH', body: { acceptingOrders: !p.acceptingOrders } });
      profile.reload();
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erreur.' });
    } finally {
      setBusy(false);
    }
  }

  if (profile.loading || menu.loading) return <div className="grid place-items-center py-20 text-brand"><Spinner /></div>;
  const published = menu.data?.products.filter((x) => x.status === 'PUBLISHED').length ?? 0;
  const steps = p ? [
    { done: p.status === 'ACTIVE', label: 'Candidature validée par la plateforme', hint: p.status === 'REJECTED' ? `Refusée : ${p.statusReason ?? ''}` : p.status === 'PENDING_REVIEW' ? 'En cours d’examen' : undefined },
    { done: p.openingHours.length > 0, label: 'Horaires renseignés', href: 'horaires' },
    { done: !!p.publishedAt, label: 'Vitrine publiée', href: 'profil' },
    { done: published > 0, label: 'Au moins un plat publié', href: 'menu' },
  ] : [];

  const allDone = steps.length > 0 && steps.every((x) => x.done);
  const shortcuts = [
    { href: `/pro/${rid}/commandes`, label: 'Commandes', hint: 'Suivre les commandes clients', icon: 'receipt-text' as const, image: '/demo/commande.jpg', show: can('orders.view') },
    { href: `/pro/${rid}/menu`, label: 'Votre menu', hint: 'Plats et catégories', icon: 'chef-hat' as const, image: '/demo/menu-2.jpg', show: can('menu.view') },
    { href: `/pro/${rid}/profil`, label: 'Votre vitrine', hint: 'Photos et informations', icon: 'store' as const, image: '/demo/resto-3.jpg', show: can('restaurant.profile.view') },
    { href: `/pro/${rid}/horaires`, label: 'Horaires', hint: 'Disponibilité et zones', icon: 'clock-3' as const, image: '/demo/resto-4.jpg', show: can('restaurant.profile.view') },
  ].filter((x) => x.show);
  return (
    <>
      {p && (
        <section className="relative isolate mb-6 min-h-[220px] overflow-hidden rounded-[26px] bg-[#153d2d] text-white shadow-[0_16px_38px_rgb(23_48_36/0.18)] sm:min-h-[270px] sm:rounded-[32px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.preview.coverUrl || '/demo/resto-2.jpg'} alt="" className="absolute inset-0 -z-20 size-full object-cover object-center" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#102f24]/95 via-[#153d2d]/76 to-[#153d2d]/20" aria-hidden />
          <div className="relative flex min-h-[220px] flex-col justify-between p-5 sm:min-h-[270px] sm:p-8">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#def0ae] backdrop-blur-md">
                <span className={`size-2 rounded-full ${p.status === 'ACTIVE' && p.acceptingOrders ? 'bg-[#b9e36b]' : 'bg-amber-300'}`} />
                {p.status === 'ACTIVE' ? p.acceptingOrders ? 'Ouvert aux commandes' : 'Commandes suspendues' : 'Configuration du restaurant'}
              </span>
              {p.publishedAt && p.status === 'ACTIVE' && <a href={`/restaurants/${p.slug}`} target="_blank" rel="noreferrer" className="hidden items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold backdrop-blur transition-colors hover:bg-white/20 sm:inline-flex">Voir ma vitrine <AppIcon name="arrow-up-right" className="size-4" /></a>}
            </div>
            <div className="max-w-[620px]">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#d9efaa]">Bienvenue dans votre espace</p>
              <h1 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl">{p.preview.name || 'Votre restaurant'}</h1>
              <p className="mt-2 line-clamp-2 max-w-[500px] text-xs leading-relaxed text-white/80 sm:text-sm">{p.preview.description || 'Gérez votre vitrine, vos plats et vos commandes depuis un seul endroit.'}</p>
            </div>
          </div>
        </section>
      )}
      {shortcuts.length > 0 && (
        <section className="mb-7">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand">Accès rapide</p>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight sm:text-xl">Tout pour faire tourner votre restaurant</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
            {shortcuts.map((item) => (
              <Link key={item.href} href={item.href} className="group relative isolate flex min-h-[142px] flex-col justify-end overflow-hidden rounded-[20px] bg-[#153d2d] p-4 text-white shadow-[var(--shadow-card)] transition-transform hover:-translate-y-1 sm:min-h-[170px] sm:rounded-[24px] sm:p-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image} alt="" className="absolute inset-0 -z-20 size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#102f24]/95 via-[#153d2d]/40 to-[#153d2d]/10" aria-hidden />
                <span className="mb-auto grid size-9 place-items-center rounded-xl border border-white/20 bg-white/15 backdrop-blur-md"><AppIcon name={item.icon} className="size-[18px]" /></span>
                <span className="mt-5 block text-sm font-extrabold sm:text-base">{item.label}</span>
                <span className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-white/75 sm:text-xs">
                  {item.hint}<AppIcon name="arrow-up-right" className="size-4 shrink-0" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {can('orders.view') && p?.status === 'ACTIVE' && <div className="mb-6"><PageTitle title="Tableau de bord" actions={can('kitchen.view') ? <a href={`/cuisine/${rid}`} className="text-sm font-semibold text-brand">Ouvrir l’écran cuisine ↗</a> : undefined} /><DashboardPanel rid={rid} /></div>}
      {!allDone && <PageTitle title="Mise en ligne" actions={p?.publishedAt && p.status === 'ACTIVE' ? <a href={`/restaurants/${p.slug}`} target="_blank" className="text-sm font-semibold text-brand">Voir ma vitrine ↗</a> : undefined} />}
      <Notice msg={msg} />
      {p && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center justify-between"><p className="font-bold">Statut</p><StatusPill status={p.status} /></div>
            {p.isDemo && <p className="mt-2 text-xs text-ink-muted">Restaurant de démonstration.</p>}
            <ul className="mt-4 space-y-3 text-sm">
              {steps.map((s) => (
                <li key={s.label} className="flex items-start gap-3">
                  <span className={`mt-0.5 grid size-5 place-items-center rounded-full text-[11px] text-white ${s.done ? 'bg-success' : 'bg-line'}`}>{s.done ? '✓' : ''}</span>
                  <span>
                    {s.href && !s.done ? <Link href={`/pro/${rid}/${s.href}`} className="font-semibold text-brand">{s.label}</Link> : s.label}
                    {s.hint && <span className="block text-xs text-ink-muted">{s.hint}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <p className="font-bold">Réception des commandes</p>
            <p className="mt-1 text-sm text-ink-muted">Suspendez temporairement la réception des commandes en cas d’affluence ou de rupture. La carte reste visible.</p>
            <label className="mt-4 flex items-center justify-between rounded-[12px] bg-canvas p-3">
              <span className="text-sm font-semibold">{p.acceptingOrders ? 'Commandes acceptées' : 'Commandes suspendues'}</span>
              <input type="checkbox" className="size-5 accent-[var(--color-brand)]" checked={p.acceptingOrders} disabled={busy || !can('restaurant.open_toggle')} onChange={toggle} />
            </label>
            <p className="mt-4 text-sm"><b>{published}</b> plat(s) publié(s) · <b>{menu.data?.categories.length ?? 0}</b> catégorie(s)</p>
          </Card>
        </div>
      )}
      {!p && !can('orders.view') && <p className="text-sm text-ink-muted">Bienvenue. Utilisez le menu pour accéder à vos outils.</p>}
      {!p && can('orders.view') && <><PageTitle title="Tableau de bord" actions={can('kitchen.view') ? <a href={`/cuisine/${rid}`} className="text-sm font-semibold text-brand">Ouvrir l’écran cuisine ↗</a> : undefined} /><DashboardPanel rid={rid} /></>}
    </>
  );
}
