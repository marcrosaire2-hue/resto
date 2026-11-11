'use client';
import { useState } from 'react';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { Button, Card, Chip, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { OpsOrder } from '@/lib/ops-types';
import { useLive } from '@/lib/realtime';
import { fcfa, useApi } from '@/lib/use-api';

/** Toutes les commandes : filtres, contacts, réattribution, nouvelle tentative, annulation (permissions vérifiées par l'API). */
export default function OpsOrdersPage() {
  const [scope, setScope] = useState<'active' | 'all'>('active');
  const [q, setQ] = useState('');
  const list = useApi<OpsOrder[]>(`/ops/orders?scope=${scope}`);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [action, setAction] = useState<{ id: string; kind: 'unassign' | 'cancel'; reason: string } | null>(null);
  useLive({ type: 'ops', id: 'ops' }, ['order.created', 'order.updated', 'delivery.updated'], list.reload, 30_000);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try { await fn(); setMsg({ tone: 'success', text: ok }); setAction(null); }
    catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erreur.' }); }
    finally { list.reload(); }
  }
  const rows = (list.data ?? []).filter((o) => !q || `${o.number} ${o.restaurant.name} ${o.customer.name} ${o.dropoff.neighborhood}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageTitle title="Commandes" />
      <Notice msg={msg} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip selected={scope === 'active'} onClick={() => setScope('active')}>En cours</Chip>
        <Chip selected={scope === 'all'} onClick={() => setScope('all')}>Toutes (récentes)</Chip>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="N°, restaurant, client, quartier…" aria-label="Filtrer" className="h-10 flex-1 rounded-[10px] border border-line px-3 text-sm" />
      </div>
      {list.loading && !list.data ? <Spinner /> : (
        <Card className="divide-y divide-line">
          {rows.length === 0 && <p className="p-4 text-sm text-ink-muted">Aucune commande.</p>}
          {rows.map((o) => (
            <div key={o.id} className="p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p><b>{o.number}</b> · {o.restaurant.name} → {o.dropoff.neighborhood} · {fcfa(o.total)}</p>
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand">{o.statusLabel}</span>
              </div>
              <p className="text-xs text-ink-muted">
                Client {o.customer.name}{o.customer.phone && <> · <a className="text-brand" href={`tel:${o.customer.phone}`}>{o.customer.phone}</a></>}
                {o.restaurant.phone && <> · Restaurant <a className="text-brand" href={`tel:${o.restaurant.phone}`}>{o.restaurant.phone}</a></>}
                {o.courier && <> · Livreur {o.courier.name}{o.courier.phone && <> <a className="text-brand" href={`tel:${o.courier.phone}`}>{o.courier.phone}</a></>}</>}
                {o.delayMinutes > 0 && ` · retard annoncé +${o.delayMinutes} min`}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
                {o.status === 'COURIER_ASSIGNED' && <button type="button" className="text-warning" onClick={() => setAction({ id: o.id, kind: 'unassign', reason: '' })}>Réattribuer</button>}
                {o.status === 'DELIVERY_FAILED' && <button type="button" className="text-brand" onClick={() => run(() => api(`/ops/orders/${o.id}/retry`, { method: 'POST' }), 'Commande remise en attente de livreur.')}>Nouvelle tentative</button>}
                {['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'WAITING_FOR_COURIER', 'DELIVERY_FAILED'].includes(o.status) && <button type="button" className="text-danger" onClick={() => setAction({ id: o.id, kind: 'cancel', reason: '' })}>Annuler</button>}
              </div>
              {action?.id === o.id && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input autoFocus value={action.reason} onChange={(e) => setAction({ ...action, reason: e.target.value })} placeholder={action.kind === 'cancel' ? 'Motif de l’annulation' : 'Motif de la réattribution'} aria-label="Motif" className="h-9 flex-1 rounded-[8px] border border-line px-2" />
                  <Button size="sm" variant={action.kind === 'cancel' ? 'danger' : 'primary'} disabled={action.reason.trim().length < 3}
                    onClick={() => run(() => api(action.kind === 'cancel' ? `/ops/orders/${o.id}/cancel` : `/ops/orders/${o.id}/unassign`, { method: 'POST', body: { reason: action.reason } }), action.kind === 'cancel' ? 'Commande annulée.' : 'Livreur retiré : la commande est de nouveau à attribuer.')}>Confirmer</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAction(null)}>Fermer</Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
