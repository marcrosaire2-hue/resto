'use client';
import Link from 'next/link';
import { useState } from 'react';
import { STATUS_LABELS_FR, OrderStatus } from '@plateforme/contracts';
import { PageTitle } from '@/components/console/console-shell';
import { Stat } from '@/components/console/kit';
import { AppIcon, Card, Chip, Spinner } from '@/components/ui';
import { useSession } from '@/lib/session';
import { fcfa, useApi } from '@/lib/use-api';

interface Dash {
  periodDays: number;
  orders: { created: number; delivered: number; byStatus: Record<string, number>; cancellationRate: number | null };
  money: { gmv: number; commission: number; deliveryFees: number; serviceFees: number; platformDiscounts: number; refunds: number; averageBasket: number | null };
  counts: { customers: number; newCustomers: number; activeRestaurants: number; pendingRestaurants: number; activeCouriers: number; onlineCouriers: number; pendingCouriers: number };
  daily: { day: string; orders: number; gmv: number }[];
  topRestaurants: { id: string; name: string; orders: number; gmv: number }[];
}

/** Tableau de bord global : tous les chiffres sont calculés à partir des commandes et du grand livre réels. */
export default function AdminHome() {
  const { me } = useSession();
  const canSee = !!me?.platformPermissions.includes('admin.restaurants.view');
  const [days, setDays] = useState(30);
  const d = useApi<Dash>(canSee ? `/admin/dashboard?days=${days}` : null);
  if (!canSee) return <PageTitle title="Vue d’ensemble">Utilisez le menu pour accéder à vos outils.</PageTitle>;
  if (!d.data) return <div className="grid place-items-center py-10 text-brand"><Spinner /></div>;
  const x = d.data;
  const max = Math.max(1, ...x.daily.map((p) => p.gmv));
  return (
    <>
      <header className="admin-dashboard-hero relative isolate mb-6 overflow-hidden rounded-[26px] bg-[#143e30] p-5 text-white shadow-[0_16px_40px_rgb(19_61_45/0.18)] sm:p-7 lg:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/demo/resto-2.jpg" alt="" className="absolute inset-y-0 right-0 -z-20 h-full w-[62%] object-cover object-center" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#11392c] via-[#11392c]/95 to-[#11392c]/35" aria-hidden />
        <div className="absolute -right-10 -top-20 -z-10 size-64 rounded-full border border-white/10" aria-hidden />
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#def0ae]">
              <AppIcon name="sparkles" className="size-3.5" /> Miamigo · Pilotage
            </p>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Vue d’ensemble</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/75 sm:text-base">Commandes livrées et activité de la plateforme sur les {x.periodDays} derniers jours.</p>
          </div>
          <div className="flex gap-2" aria-label="Période du tableau de bord">
            {[1, 7, 30, 90].map((n) => (
              <Chip key={n} selected={days === n} onClick={() => setDays(n)}
                className={`border-white/30 px-3 text-xs ${days === n ? '!border-[#d9efaa] !bg-[#d9efaa] !text-[#163b2d]' : '!bg-white/10 !text-white hover:!bg-white/20'}`}>
                {n === 1 ? '24 h' : `${n} j`}
              </Chip>
            ))}
          </div>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="wallet" label="Volume d’affaires (livré)" value={fcfa(x.money.gmv)} hint={x.money.averageBasket != null ? `Panier moyen ${fcfa(x.money.averageBasket)}` : 'Aucune commande livrée'} />
        <Stat icon="chart-no-axes-combined" label="Commissions" value={fcfa(x.money.commission)} />
        <Stat icon="bike" label="Frais de livraison facturés" value={fcfa(x.money.deliveryFees)} hint={`Frais de service : ${fcfa(x.money.serviceFees)}`} />
        <Stat icon="arrow-right" label="Remboursements payés" value={fcfa(x.money.refunds)} hint={`Codes promo : ${fcfa(x.money.platformDiscounts)}`} />
        <Stat icon="receipt-text" label="Commandes passées" value={x.orders.created} hint={`${x.orders.delivered} livrées`} />
        <Stat icon="chart-no-axes-combined" label="Taux d’annulation / refus" value={x.orders.cancellationRate == null ? '—' : `${x.orders.cancellationRate} %`} />
        <Stat icon="users" label="Clients" value={x.counts.customers} hint={`+${x.counts.newCustomers} sur la période`} />
        <Stat icon="truck" label="Livreurs en ligne" value={`${x.counts.onlineCouriers} / ${x.counts.activeCouriers}`} />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link href="/admin/restaurants?statut=PENDING_REVIEW" className="group">
          <Card className="flex min-h-[96px] items-center gap-4 border border-line/70 p-4 transition-transform group-hover:-translate-y-0.5 sm:p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand"><AppIcon name="store" className="size-5" /></span>
            <span className="min-w-0 flex-1 text-sm leading-relaxed"><b>{x.counts.pendingRestaurants}</b> candidature(s) restaurant à examiner <span className="text-ink-muted">· {x.counts.activeRestaurants} actifs</span></span>
            <AppIcon name="arrow-up-right" className="size-4 text-ink-muted transition-colors group-hover:text-brand" />
          </Card>
        </Link>
        <Link href="/admin/livreurs" className="group">
          <Card className="flex min-h-[96px] items-center gap-4 border border-line/70 p-4 transition-transform group-hover:-translate-y-0.5 sm:p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand"><AppIcon name="truck" className="size-5" /></span>
            <span className="min-w-0 flex-1 text-sm leading-relaxed"><b>{x.counts.pendingCouriers}</b> dossier(s) livreur à valider</span>
            <AppIcon name="arrow-up-right" className="size-4 text-ink-muted transition-colors group-hover:text-brand" />
          </Card>
        </Link>
      </div>
      <Card className="mt-5 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand"><AppIcon name="chart-no-axes-combined" className="size-5" /></span>
          <div><p className="font-bold">Volume livré par jour</p><p className="mt-0.5 text-xs text-ink-muted">Chiffre d’affaires journalier sur la période choisie</p></div>
        </div>
        {x.daily.length === 0 ? <p className="mt-4 text-sm text-ink-muted">Aucune commande livrée sur la période.</p> : (
          <div className="mt-5 flex h-48 items-end gap-1 rounded-2xl bg-canvas/80 px-3 pt-4 sm:gap-2 sm:px-5" role="img" aria-label="Histogramme du volume livré par jour">
            {x.daily.map((p) => (
              <div key={p.day} className="group relative flex-1">
                <div className="rounded-t-md bg-gradient-to-t from-brand-600 to-[#82bd6d] transition-opacity group-hover:opacity-80" style={{ height: `${Math.max(3, (p.gmv / max) * 160)}px` }} title={`${p.day} : ${fcfa(p.gmv)} (${p.orders} commandes)`} />
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="mb-3 font-bold">Meilleurs restaurants</p>
          {x.topRestaurants.length === 0 ? <p className="text-sm text-ink-muted">—</p> : x.topRestaurants.map((r, i) => (
            <div key={r.id} className="flex justify-between border-b border-line py-2 text-sm last:border-0"><span>{i + 1}. {r.name} <span className="text-ink-muted">({r.orders})</span></span><span className="tabular-nums">{fcfa(r.gmv)}</span></div>
          ))}
        </Card>
        <Card className="p-5">
          <p className="mb-3 font-bold">Commandes par statut</p>
          {Object.keys(x.orders.byStatus).length === 0 ? <p className="text-sm text-ink-muted">—</p> : Object.entries(x.orders.byStatus).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
            <div key={s} className="flex justify-between border-b border-line py-2 text-sm last:border-0"><span>{STATUS_LABELS_FR[s as OrderStatus] ?? s}</span><span className="tabular-nums">{n}</span></div>
          ))}
        </Card>
      </div>
    </>
  );
}
