'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { OrderStatus, OrderView, STATUS_LABELS_FR } from '@plateforme/contracts';
import { PlainHeader } from '@/components/client/plain-header';
import { ErrorBlock, LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { api, ApiError } from '@/lib/api';
import { useLive } from '@/lib/realtime';
import { fcfa, useApi } from '@/lib/use-api';

const PATH: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'WAITING_FOR_COURIER', 'COURIER_ASSIGNED', 'IN_DELIVERY', 'DELIVERED'];
const BADGE: Partial<Record<OrderStatus, string>> = { REJECTED: 'bg-danger', CANCELLED: 'bg-danger', DELIVERY_FAILED: 'bg-danger', DELIVERED: 'bg-success' };

/** Détails et suivi de commande — maquette 3 « Order details », mis à jour en temps réel. */
export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const order = useApi<OrderView>(`/orders/${encodeURIComponent(id)}`);
  useLive({ type: 'order', id }, ['order.updated'], order.reload);
  const [cancelling, setCancelling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (order.loading && !order.data) return <MobileScreen className="bg-surface"><LoadingBlock /></MobileScreen>;
  if (order.error || !order.data) return <MobileScreen className="bg-surface">{order.error && <ErrorBlock error={order.error} onRetry={order.reload} />}</MobileScreen>;
  const o = order.data;
  const reached = new Map(o.history.map((h) => [h.status, h.at]));
  const failed = ['REJECTED', 'CANCELLED', 'DELIVERY_FAILED'].includes(o.status);
  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const steps = PATH.filter((s) => s !== 'COURIER_ASSIGNED' || reached.has('COURIER_ASSIGNED') || ['PICKED_UP', 'IN_DELIVERY', 'DELIVERED'].includes(o.status));

  async function cancel() {
    const reason = window.prompt('Pourquoi souhaitez-vous annuler ?');
    if (!reason || reason.trim().length < 3) return;
    setCancelling(true);
    try { await api(`/orders/${o.id}/cancel`, { method: 'POST', body: { reason } }); order.reload(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Annulation impossible.'); }
    finally { setCancelling(false); }
  }

  return (
    <MobileScreen className="bg-surface">
      <PlainHeader title="Détails de la commande" backHref="/commandes" />
      <main className="flex-1 space-y-4 px-4 pb-6">
        {o.items[0]?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.items[0].imageUrl} alt="" className="aspect-[2.2/1] w-full rounded-[6px] object-cover" />
        )}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-ink-muted">{o.number} · {o.restaurant.name}</p>
            <p className="text-lg font-semibold">Articles</p>
            <ul className="text-sm">{o.items.map((i, k) => <li key={k}>{i.qty} × {i.name}{i.optionLabels.length ? <span className="text-ink-muted"> ({i.optionLabels.join(', ')})</span> : null}</li>)}</ul>
          </div>
          <span className={`shrink-0 rounded-[3px] px-3 py-1 text-xs font-semibold text-white ${BADGE[o.status] ?? 'bg-brand'}`}>{o.statusLabel}</span>
        </div>

        {o.delayMinutes > 0 && !failed && o.status !== 'DELIVERED' && <p className="rounded-[6px] bg-warning-50 p-3 text-sm text-warning">Le restaurant annonce un retard d’environ {o.delayMinutes} minutes.</p>}
        {(o.rejectReason || o.cancelReason) && <p className="rounded-[6px] bg-danger-50 p-3 text-sm text-danger">Motif : {o.rejectReason ?? o.cancelReason}</p>}
        {o.deliveryCode && !failed && o.status !== 'DELIVERED' && (
          <div className="rounded-[6px] bg-brand-50 p-3 text-sm">
            <p>Code de livraison à donner au livreur <b>uniquement à la remise</b> :</p>
            <p className="mt-1 text-2xl font-extrabold tracking-[0.3em] text-brand">{o.deliveryCode}</p>
          </div>
        )}

        <div className="space-y-2 rounded-[6px] border border-brand p-3 text-sm">
          <div className="flex justify-between"><span>Sous-total</span><span>{fcfa(o.itemsSubtotal)}</span></div>
          {o.restaurantDiscount > 0 && <div className="flex justify-between text-success"><span>Promotions</span><span>−{fcfa(o.restaurantDiscount)}</span></div>}
          <div className="flex justify-between"><span>Frais de livraison</span><span>{fcfa(o.deliveryFee)}</span></div>
          {o.serviceFee > 0 && <div className="flex justify-between"><span>Frais de service</span><span>{fcfa(o.serviceFee)}</span></div>}
          <div className="flex justify-between border-t border-line pt-3 text-base"><span className="font-semibold">Total</span><span className="text-lg text-brand">{fcfa(o.total)}</span></div>
          <p className="text-xs text-ink-muted">Paiement à la livraison (espèces) · {o.address.label} : {o.address.neighborhood}, {o.address.streetLandmark}</p>
        </div>

        <div>
          <p className="mb-3 text-lg font-semibold">Suivi</p>
          <ol>
            {(failed ? o.history.map((h) => h.status) : steps).map((s, i, arr) => {
              const done = reached.has(s);
              const nextDone = i < arr.length - 1 && reached.has(arr[i + 1]);
              return (
                <li key={`${s}-${i}`} className="relative flex gap-3 pb-4">
                  {i < arr.length - 1 && <span className={`absolute left-[7px] top-4 h-full w-0.5 ${done && nextDone ? 'bg-success' : 'bg-line'}`} aria-hidden />}
                  <span className={`relative grid size-4 shrink-0 place-items-center rounded-[3px] border text-[10px] text-white ${done ? (['REJECTED', 'CANCELLED', 'DELIVERY_FAILED'].includes(s) ? 'border-danger bg-danger' : 'border-success bg-success') : 'border-ink-muted bg-surface'}`}>{done ? '✓' : ''}</span>
                  <div className="-mt-0.5 text-xs"><p className={done ? 'text-ink' : 'text-ink-muted'}>{STATUS_LABELS_FR[s]}</p><p className="text-ink-muted">{fmt(reached.get(s))}</p></div>
                </li>
              );
            })}
          </ol>
        </div>
        {msg && <p className="rounded-[6px] bg-danger-50 p-3 text-sm text-danger">{msg}</p>}
        <div className="grid grid-cols-2 gap-3">
          {o.status === 'PENDING'
            ? <button type="button" disabled={cancelling} onClick={cancel} className="h-11 rounded-[6px] border border-brand font-semibold text-brand">Annuler</button>
            : <a href={o.restaurant.phone ? `tel:${o.restaurant.phone}` : undefined} className={`grid h-11 place-items-center rounded-[6px] border border-brand font-semibold text-brand ${o.restaurant.phone ? '' : 'pointer-events-none opacity-50'}`}>Appeler le restaurant</a>}
          <Link href="/accueil" className="grid h-11 place-items-center rounded-[6px] bg-brand font-semibold text-white">Commander encore</Link>
        </div>
      </main>
    </MobileScreen>
  );
}
