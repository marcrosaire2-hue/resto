'use client';
import { useState } from 'react';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { Button, Card, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { OpsCourier, OpsOrder, OpsOverview } from '@/lib/ops-types';
import { useLive } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { fcfa, useApi } from '@/lib/use-api';

const ago = (iso: string) => `${Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))} min`;

/** Dispatch : commandes sans livreur, livreurs disponibles, affectation manuelle assistée ou offre. */
export default function DispatchPage() {
  const { me } = useSession();
  const overview = useApi<OpsOverview>('/ops/overview');
  const orders = useApi<OpsOrder[]>('/ops/orders?scope=unassigned');
  const couriers = useApi<OpsCourier[]>('/ops/couriers');
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const reload = () => { overview.reload(); orders.reload(); couriers.reload(); };
  useLive(me ? { type: 'ops', id: 'ops' } : null, ['order.created', 'order.updated', 'delivery.updated', 'courier.updated'], reload, 30_000);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key); setMsg(null);
    try { await fn(); setMsg({ tone: 'success', text: ok }); setSelected(null); }
    catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erreur.' }); }
    finally { setBusy(null); reload(); }
  }
  const o = overview.data;
  const available = (couriers.data ?? []).filter((c) => c.isOnline && !c.busy && !c.overLimit);

  return (
    <>
      <PageTitle title="Dispatch">Affectation manuelle assistée. Les distances ne sont affichées que lorsque les positions réelles sont connues.</PageTitle>
      <Notice msg={msg} />
      {o && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {[['En attente', o.pending], ['En cuisine', o.inKitchen], ['Sans livreur', o.withoutCourier], ['En livraison', o.inDelivery], ['Retards', o.late], ['Échecs', o.deliveryFailed], ['Livreurs dispo.', `${o.couriersAvailable}/${o.couriersOnline}`], ['Incidents', o.openIncidents]].map(([l, v]) => (
            <Card key={l as string} className={`p-3 ${(l === 'Sans livreur' || l === 'Retards') && Number(v) > 0 ? 'ring-2 ring-danger' : ''}`}><p className="text-xs text-ink-muted">{l}</p><p className="text-2xl font-extrabold">{v}</p></Card>
          ))}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <p className="font-bold">Commandes à attribuer</p>
          {orders.loading && !orders.data ? <Spinner /> : orders.data?.length === 0 ? <Card className="p-5 text-sm text-ink-muted">Aucune commande en attente de livreur.</Card> : orders.data?.map((x) => (
            <Card key={x.id} className={`p-4 ${selected === x.id ? 'ring-2 ring-brand' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{x.number} <span className="ml-1 text-xs font-normal text-ink-muted">{x.statusLabel} depuis {ago(x.statusChangedAt)}</span></p>
                  <p className="text-sm">🍽️ {x.restaurant.name} — {x.restaurant.address ?? 'adresse non renseignée'}{x.restaurant.phone && <a className="ml-2 text-brand" href={`tel:${x.restaurant.phone}`}>Appeler</a>}</p>
                  <p className="text-sm">📍 {x.dropoff.neighborhood}, {x.dropoff.commune} · {x.dropoff.streetLandmark}{x.customer.phone && <a className="ml-2 text-brand" href={`tel:${x.customer.phone}`}>Client</a>}</p>
                  <p className="text-xs text-ink-muted">À encaisser {fcfa(x.total)} · rémunération livreur {fcfa(x.courierPay)} · distance : non disponible{x.delivery?.offers ? ` · ${x.delivery.offers} offre(s) en cours` : ''}</p>
                </div>
                <Button size="sm" variant={selected === x.id ? 'secondary' : 'primary'} onClick={() => setSelected(selected === x.id ? null : x.id)}>{selected === x.id ? 'Annuler' : 'Choisir un livreur'}</Button>
              </div>
              {selected === x.id && (
                <div className="mt-3 space-y-2 border-t border-line pt-3">
                  {available.length === 0 && <p className="text-sm text-danger">Aucun livreur disponible. La commande reste en attente ; vous serez alerté.</p>}
                  {available.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-canvas p-2 text-sm">
                      <span><b>{c.fullName}</b> · {c.vehicle} · espèces {fcfa(c.cashHeld)}{c.position ? ` · position il y a ${ago(c.position.at)}` : ' · position inconnue'}</span>
                      <span className="flex gap-2">
                        <Button size="sm" variant="outline" loading={busy === `o-${x.id}-${c.id}`} onClick={() => run(`o-${x.id}-${c.id}`, () => api(`/ops/orders/${x.id}/offer`, { method: 'POST', body: { courierIds: [c.id] } }), `Course proposée à ${c.fullName}.`)}>Proposer</Button>
                        <Button size="sm" loading={busy === `a-${x.id}-${c.id}`} onClick={() => run(`a-${x.id}-${c.id}`, () => api(`/ops/orders/${x.id}/assign`, { method: 'POST', body: { courierId: c.id } }), `Course attribuée à ${c.fullName}.`)}>Attribuer</Button>
                      </span>
                    </div>
                  ))}
                  {available.length > 1 && <Button size="sm" variant="secondary" onClick={() => run(`all-${x.id}`, () => api(`/ops/orders/${x.id}/offer`, { method: 'POST', body: { courierIds: available.map((c) => c.id) } }), 'Course proposée à tous les livreurs disponibles.')}>Proposer à tous ({available.length})</Button>}
                </div>
              )}
            </Card>
          ))}
        </div>
        <div className="space-y-3">
          <p className="font-bold">Livreurs actifs</p>
          <Card className="divide-y divide-line">
            {(couriers.data ?? []).length === 0 && <p className="p-4 text-sm text-ink-muted">Aucun livreur validé.</p>}
            {couriers.data?.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span><span className={`mr-2 inline-block size-2.5 rounded-full ${c.isOnline ? (c.busy ? 'bg-warning' : 'bg-success') : 'bg-line'}`} />{c.fullName} <span className="text-xs text-ink-muted">· {c.vehicle}</span>
                  <span className="block text-xs text-ink-muted">{c.isOnline ? (c.busy ? 'En course' : 'Disponible') : 'Hors ligne'} · espèces {fcfa(c.cashHeld)}{c.cashLimit != null ? ` / ${fcfa(c.cashLimit)}` : ''}</span></span>
                {c.overLimit && <span className="rounded-full bg-danger-50 px-2 py-0.5 text-xs text-danger">Plafond atteint</span>}
                {c.phone && <a href={`tel:${c.phone}`} className="text-brand">Appeler</a>}
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
