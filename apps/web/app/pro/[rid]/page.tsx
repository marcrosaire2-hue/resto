'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { StatusPill } from '@/components/console/form';
import { DashboardPanel } from '@/components/console/dashboard-panel';
import { Card, Spinner } from '@/components/ui';
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
  return (
    <>
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
