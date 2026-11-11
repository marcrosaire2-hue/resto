'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { RestaurantDashboard } from '@plateforme/contracts';
import { Card, Chip, Spinner } from '../ui';
import { fcfa, useApi } from '@/lib/use-api';

const money = (v: number | null) => (v == null ? '—' : fcfa(v));

/** Tableau de bord : uniquement des chiffres issus des commandes réelles. Montants masqués sans permission financière. */
export function DashboardPanel({ rid }: { rid: string }) {
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const d = useApi<RestaurantDashboard>(`/restaurants/${rid}/dashboard?days=${days}`);
  if (d.loading && !d.data) return <div className="grid place-items-center py-10 text-brand"><Spinner /></div>;
  if (!d.data) return null;
  const x = d.data;
  const max = Math.max(1, ...x.series.map((s) => (x.canSeeMoney ? s.grossSales ?? 0 : s.orders)));
  const tiles = [
    ['Commandes du jour', String(x.today.orders)], ['En attente', String(x.today.pending)], ['En préparation', String(x.today.preparing)], ['Livrées', String(x.today.delivered)],
    ...(x.canSeeMoney ? [['Chiffre d’affaires du jour', money(x.today.grossSales)], ['Net estimé du jour', money(x.today.netEstimate)]] : []),
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([l, v]) => <Card key={l} className="p-4"><p className="text-xs text-ink-muted">{l}</p><p className="mt-1 text-xl font-extrabold tabular-nums">{v}</p></Card>)}
      </div>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold">{x.canSeeMoney ? 'Ventes livrées' : 'Commandes'} — {x.period.label}</p>
          <div className="flex gap-2">{([1, 7, 30] as const).map((n) => <Chip key={n} selected={days === n} onClick={() => setDays(n)}>{n === 1 ? 'Jour' : `${n} j`}</Chip>)}</div>
        </div>
        <div className="mt-4 flex h-40 items-end gap-1" role="img" aria-label="Graphique des ventes par jour">
          {x.series.map((s) => {
            const v = x.canSeeMoney ? s.grossSales ?? 0 : s.orders;
            return (
              <div key={s.day} className="group flex flex-1 flex-col items-center gap-1" title={`${s.day} : ${x.canSeeMoney ? money(s.grossSales) : `${s.orders} commande(s)`}`}>
                <div className="w-full rounded-t-[6px] bg-brand/80 transition-all group-hover:bg-brand" style={{ height: `${Math.max(2, (v / max) * 140)}px` }} />
                {x.series.length <= 7 && <span className="text-[10px] text-ink-muted">{s.day.slice(8)}/{s.day.slice(5, 7)}</span>}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-ink-muted">{x.periodTotals.orders} commande(s), {x.periodTotals.delivered} livrée(s){x.canSeeMoney && ` · ventes ${money(x.periodTotals.grossSales)} · net ${money(x.periodTotals.netEstimate)} · panier moyen ${money(x.periodTotals.averageBasket)}`}</p>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <p className="mb-2 font-bold">Plats populaires</p>
          {x.topProducts.length === 0 ? <p className="text-sm text-ink-muted">Pas encore de commandes sur la période.</p> : (
            <ol className="space-y-1 text-sm">{x.topProducts.map((p, i) => <li key={p.name} className="flex justify-between"><span>{i + 1}. {p.name}</span><b>{p.qty}</b></li>)}</ol>
          )}
        </Card>
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between"><p className="font-bold">Dernières commandes</p><Link href={`/pro/${rid}/commandes`} className="text-sm font-semibold text-brand">Tout voir</Link></div>
          {x.latest.length === 0 ? <p className="text-sm text-ink-muted">Aucune commande.</p> : (
            <ul className="divide-y divide-line text-sm">{x.latest.map((o) => <li key={o.id} className="flex justify-between py-1.5"><span>{o.number} · {o.statusLabel}</span><span>{money(o.total)}</span></li>)}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
