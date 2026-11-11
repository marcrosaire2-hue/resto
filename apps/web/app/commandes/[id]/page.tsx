'use client';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { OrderStatus, OrderView, PublicReview, STATUS_LABELS_FR } from '@plateforme/contracts';
import { PlainHeader } from '@/components/client/plain-header';
import { ErrorBlock, LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { api, ApiError } from '@/lib/api';
import { useLive } from '@/lib/realtime';
import { fcfa, useApi } from '@/lib/use-api';

const PATH: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'WAITING_FOR_COURIER', 'COURIER_ASSIGNED', 'IN_DELIVERY', 'DELIVERED'];
const BADGE: Partial<Record<OrderStatus, string>> = { AWAITING_PAYMENT: 'bg-warning', REJECTED: 'bg-danger', CANCELLED: 'bg-danger', DELIVERY_FAILED: 'bg-danger', DELIVERED: 'bg-success' };

export default function OrderPage() {
  return <Suspense fallback={<MobileScreen className="bg-surface"><LoadingBlock /></MobileScreen>}><OrderDetails /></Suspense>;
}

/** Avis : uniquement après livraison, une fois par commande. */
function ReviewBox({ orderId }: { orderId: string }) {
  const mine = useApi<{ review: PublicReview | null }>(`/orders/${orderId}/review`);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState<string | null>(null);
  if (!mine.data) return null;
  if (mine.data.review) {
    const r = mine.data.review;
    return (
      <div className="rounded-[6px] border border-line p-3 text-sm">
        <p className="font-semibold">Votre avis : <span className="text-warning">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span></p>
        {r.comment && <p className="mt-1 text-ink-muted">{r.comment}</p>}
        {r.reply && <p className="mt-2 rounded-[6px] bg-brand-50 p-2"><b>Réponse du restaurant :</b> {r.reply}</p>}
      </div>
    );
  }
  async function send() {
    setErr(null);
    try { await api(`/orders/${orderId}/review`, { method: 'POST', body: { rating, comment } }); mine.reload(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Avis non envoyé.'); }
  }
  return (
    <div className="space-y-2 rounded-[6px] border border-brand p-3 text-sm">
      <p className="font-semibold">Comment s’est passée votre commande ?</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Note">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} étoile${n > 1 ? 's' : ''}`} onClick={() => setRating(n)} className={`text-3xl ${n <= rating ? 'text-warning' : 'text-line'}`}>★</button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={2} placeholder="Votre commentaire (facultatif)" className="w-full rounded-[6px] border border-line p-2" />
      {err && <p className="text-danger">{err}</p>}
      <button type="button" disabled={!rating} onClick={send} className="h-10 w-full rounded-[6px] bg-brand font-semibold text-white disabled:opacity-50">Publier mon avis</button>
    </div>
  );
}

/** Détails et suivi de commande — maquette 3 « Order details », mis à jour en temps réel. */
function OrderDetails() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const order = useApi<OrderView>(`/orders/${encodeURIComponent(id)}`);
  useLive({ type: 'order', id }, ['order.updated'], order.reload);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const checked = useRef(false);

  // Retour de la page FedaPay : l'état du paiement est vérifié côté serveur auprès de FedaPay.
  useEffect(() => {
    if (checked.current || search.get('paiement') !== 'retour') return;
    checked.current = true;
    void api<{ status: string | null }>(`/orders/${encodeURIComponent(id)}/payments/refresh`, { method: 'POST' })
      .then((r) => {
        if (r.status === 'FAILED' || r.status === 'EXPIRED') setMsg('Le paiement n’a pas abouti. Vous pouvez réessayer.');
        else if (r.status === 'PENDING') setMsg('Paiement en cours de confirmation… Cette page se met à jour automatiquement.');
        order.reload();
      })
      .catch(() => undefined);
  }, [id, search, order]);

  if (order.loading && !order.data) return <MobileScreen className="bg-surface"><LoadingBlock /></MobileScreen>;
  if (order.error || !order.data) return <MobileScreen className="bg-surface">{order.error && <ErrorBlock error={order.error} onRetry={order.reload} />}</MobileScreen>;
  const o = order.data;
  const reached = new Map(o.history.map((h) => [h.status, h.at]));
  const failed = ['REJECTED', 'CANCELLED', 'DELIVERY_FAILED'].includes(o.status);
  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const steps = PATH.filter((s) => s !== 'COURIER_ASSIGNED' || reached.has('COURIER_ASSIGNED') || ['PICKED_UP', 'IN_DELIVERY', 'DELIVERED'].includes(o.status));

  async function pay() {
    setPaying(true);
    setMsg(null);
    try {
      const p = await api<{ url: string | null; paid: boolean }>(`/orders/${o.id}/payments`, { method: 'POST' });
      if (p.url) window.location.assign(p.url); else order.reload();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Paiement indisponible pour le moment.'); setPaying(false); }
  }

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

        {o.status === 'AWAITING_PAYMENT' && (
          <div className="space-y-2 rounded-[6px] bg-warning-50 p-3 text-sm">
            <p>Votre commande sera transmise au restaurant dès que le paiement Mobile Money sera confirmé.</p>
            <button type="button" onClick={pay} disabled={paying} className="h-11 w-full rounded-[6px] bg-brand font-semibold text-white disabled:opacity-50">{paying ? 'Redirection…' : `Payer ${fcfa(o.total)}`}</button>
          </div>
        )}
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
          {o.platformDiscount > 0 && <div className="flex justify-between text-success"><span>Code promo</span><span>−{fcfa(o.platformDiscount)}</span></div>}
          <div className="flex justify-between"><span>Frais de livraison</span><span>{fcfa(o.deliveryFee)}</span></div>
          {o.serviceFee > 0 && <div className="flex justify-between"><span>Frais de service</span><span>{fcfa(o.serviceFee)}</span></div>}
          <div className="flex justify-between border-t border-line pt-3 text-base"><span className="font-semibold">Total</span><span className="text-lg text-brand">{fcfa(o.total)}</span></div>
          <p className="text-xs text-ink-muted">{o.paymentMethod === 'MOBILE_MONEY' ? `Mobile Money · ${o.paymentStatus === 'SUCCEEDED' ? 'payé' : 'non payé'}` : 'Paiement à la livraison (espèces)'} · {o.address.label} : {o.address.neighborhood}, {o.address.streetLandmark}</p>
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
        {o.status === 'DELIVERED' && <ReviewBox orderId={o.id} />}
        {msg && <p className="rounded-[6px] bg-danger-50 p-3 text-sm text-danger">{msg}</p>}
        <div className="grid grid-cols-2 gap-3">
          {o.status === 'PENDING' || o.status === 'AWAITING_PAYMENT'
            ? <button type="button" disabled={cancelling} onClick={cancel} className="h-11 rounded-[6px] border border-brand font-semibold text-brand">Annuler</button>
            : <a href={o.restaurant.phone ? `tel:${o.restaurant.phone}` : undefined} className={`grid h-11 place-items-center rounded-[6px] border border-brand font-semibold text-brand ${o.restaurant.phone ? '' : 'pointer-events-none opacity-50'}`}>Appeler le restaurant</a>}
          <Link href="/accueil" className="grid h-11 place-items-center rounded-[6px] bg-brand font-semibold text-white">Commander encore</Link>
        </div>
        <Link href={`/aide?commande=${o.id}`} className="block text-center text-sm font-semibold text-brand">Un problème avec cette commande ?</Link>
      </main>
    </MobileScreen>
  );
}
