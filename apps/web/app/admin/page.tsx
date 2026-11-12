'use client';
import Link from 'next/link';
import { useState } from 'react';
import { STATUS_LABELS_FR, OrderStatus } from '@plateforme/contracts';
import { PageTitle } from '@/components/console/console-shell';
import { Stat } from '@/components/console/kit';
import { Card, Chip, Spinner } from '@/components/ui';
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
      <PageTitle title="Vue d’ensemble" actions={<div className="flex gap-2">{[1, 7, 30, 90].map((n) => <Chip key={n} selected={days === n} onClick={() => setDays(n)}>{n === 1 ? '24 h' : `${n} j`}</Chip>)}</div>}>
        Commandes livrées et montants sur les {x.periodDays} derniers jours.
      </PageTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Volume d’affaires (livré)" value={fcfa(x.money.gmv)} hint={x.money.averageBasket != null ? `Panier moyen ${fcfa(x.money.averageBasket)}` : 'Aucune commande livrée'} />
        <Stat label="Commissions" value={fcfa(x.money.commission)} />
        <Stat label="Frais de livraison facturés" value={fcfa(x.money.deliveryFees)} hint={`Frais de service : ${fcfa(x.money.serviceFees)}`} />
        <Stat label="Remboursements payés" value={fcfa(x.money.refunds)} hint={`Codes promo : ${fcfa(x.money.platformDiscounts)}`} />
        <Stat label="Commandes passées" value={x.orders.created} hint={`${x.orders.delivered} livrées`} />
        <Stat label="Taux d’annulation / refus" value={x.orders.cancellationRate == null ? '—' : `${x.orders.cancellationRate} %`} />
        <Stat label="Clients" value={x.counts.customers} hint={`+${x.counts.newCustomers} sur la période`} />
        <Stat label="Livreurs en ligne" value={`${x.counts.onlineCouriers} / ${x.counts.activeCouriers}`} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Link href="/admin/restaurants?statut=PENDING_REVIEW"><Card className="p-4 text-sm"><b>{x.counts.pendingRestaurants}</b> candidature(s) restaurant à examiner · <b>{x.counts.activeRestaurants}</b> actifs</Card></Link>
        <Link href="/admin/livreurs"><Card className="p-4 text-sm"><b>{x.counts.pendingCouriers}</b> dossier(s) livreur à valider</Card></Link>
      </div>
      <Card className="mt-4 p-5">
        <p className="font-bold">Volume livré par jour</p>
        {x.daily.length === 0 ? <p className="mt-4 text-sm text-ink-muted">Aucune commande livrée sur la période.</p> : (
          <div className="mt-4 flex h-44 items-end gap-1" role="img" aria-label="Histogramme du volume livré par jour">
            {x.daily.map((p) => (
              <div key={p.day} className="group relative flex-1">
                <div className="rounded-t bg-brand" style={{ height: `${Math.max(3, (p.gmv / max) * 160)}px` }} title={`${p.day} : ${fcfa(p.gmv)} (${p.orders} commandes)`} />
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
