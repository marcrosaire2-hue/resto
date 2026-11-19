'use client';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { OrderStatus, OrderTrackingView, OrderView, PublicReview, STATUS_LABELS_FR } from '@plateforme/contracts';
import { PlainHeader } from '@/components/client/plain-header';
import { TrackingMap } from '@/components/client/tracking-map';
import { CustomerNavigation } from '@/components/client/customer-navigation';
import { ErrorBlock, LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { api, ApiError } from '@/lib/api';
import { useLive } from '@/lib/realtime';
import { fcfa, useApi } from '@/lib/use-api';

const PATH: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'WAITING_FOR_COURIER', 'COURIER_ASSIGNED', 'IN_DELIVERY', 'DELIVERED'];
const BADGE: Partial<Record<OrderStatus, string>> = { AWAITING_PAYMENT: 'bg-warning', REJECTED: 'bg-danger', CANCELLED: 'bg-danger', DELIVERY_FAILED: 'bg-danger', DELIVERED: 'bg-success' };

export default function OrderPage() {
  return <Suspense fallback={<MobileScreen wide className="client-brand bg-white"><LoadingBlock /></MobileScreen>}><OrderDetails /></Suspense>;
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
  const tracking = useApi<OrderTrackingView>(order.data?.status === 'IN_DELIVERY' ? `/orders/${encodeURIComponent(id)}/tracking` : null);
  useLive({ type: 'order', id }, ['order.updated'], order.reload);
  useLive(order.data?.status === 'IN_DELIVERY' ? { type: 'order', id } : null, ['courier.position'], tracking.reload, 60_000);
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

  if (order.loading && !order.data) return <MobileScreen wide className="client-brand bg-white"><LoadingBlock /></MobileScreen>;
  if (order.error || !order.data) return <MobileScreen wide className="client-brand bg-white">{order.error && <ErrorBlock error={order.error} onRetry={order.reload} />}</MobileScreen>;
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

  const STAGES = ['Confirmée', 'Préparation', 'En route', 'Livrée'];
  const stage = failed || o.status === 'PENDING' || o.status === 'AWAITING_PAYMENT' ? -1
    : o.status === 'ACCEPTED' ? 0
      : ['PREPARING', 'READY', 'WAITING_FOR_COURIER'].includes(o.status) ? 1
        : o.status === 'DELIVERED' ? 3 : 2;
  const headline: Partial<Record<OrderStatus, string>> = {
    AWAITING_PAYMENT: 'Paiement en attente', PENDING: 'En attente du restaurant', ACCEPTED: 'Commande confirmée', PREPARING: 'En préparation',
    READY: 'Prête, un livreur arrive', WAITING_FOR_COURIER: 'Prête, un livreur arrive', COURIER_ASSIGNED: 'Un livreur récupère votre commande',
    PICKED_UP: 'Votre livreur est en route', IN_DELIVERY: 'Votre livreur est en route', DELIVERED: 'Commande livrée !',
  };
  const emoji = failed ? '⚠️' : ['⏳', '✅', '🍳', '🛵', '🎉'][stage + 1] ?? '⏳';
  const card = 'rounded-2xl border border-line bg-white p-4 text-sm';

  return (
    <MobileScreen wide className="client-brand bg-white">
      <PlainHeader title="Suivi de commande" backHref="/commandes" />
      <main className="mx-auto w-full max-w-[720px] flex-1 space-y-4 px-5 pb-28">
        <section className="overflow-hidden rounded-[28px] bg-[#1c1c1e] text-white">
          {o.status === 'IN_DELIVERY' && tracking.data?.position ? (
            <TrackingMap position={tracking.data.position} />
          ) : (
            <div className="grid h-40 place-items-center bg-[radial-gradient(circle_at_50%_40%,rgba(247,121,15,.28),transparent_65%)] text-6xl" aria-hidden>{emoji}</div>
          )}
          <div className="p-5">
            <p className="text-xs text-white/60">Commande {o.number} · {o.restaurant.name}</p>
            <h2 className="mt-1 text-[21px] font-extrabold leading-tight">{failed ? o.statusLabel : headline[o.status] ?? o.statusLabel}</h2>
            {o.status === 'IN_DELIVERY' && (
              <p className="mt-1 text-xs text-white/70">
                {tracking.loading && !tracking.data ? 'Connexion au suivi GPS…'
                  : tracking.data?.position ? `Position reçue à ${new Date(tracking.data.position.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                    : tracking.data?.available ? 'En attente du prochain partage de position du livreur…'
                      : tracking.data ? 'La position GPS n’est pas disponible pour le moment.' : ''}
              </p>
            )}
            {tracking.error && <p role="alert" className="mt-2 text-xs text-[#ffb4b4]">{tracking.error.message} <button type="button" onClick={tracking.reload} className="font-bold underline">Réessayer</button></p>}
          </div>
        </section>

        {stage >= 0 && (
          <ol className="grid grid-cols-4" aria-label="Avancement de la commande">
            {STAGES.map((label, i) => (
              <li key={label} className="relative flex flex-col items-center gap-1.5 text-center">
                {i > 0 && <span className={`absolute right-1/2 top-[11px] h-0.5 w-full ${i <= stage ? 'bg-brand' : 'bg-line'}`} aria-hidden />}
                <span className={`relative grid size-6 place-items-center rounded-full text-[11px] font-bold ${i <= stage ? 'bg-brand text-white' : 'border-2 border-line bg-white text-ink-muted'}`} aria-hidden>{i <= stage ? '✓' : ''}</span>
                <span className={`text-[11px] ${i === stage ? 'font-bold text-ink' : i < stage ? 'text-ink' : 'text-ink-muted'}`} aria-current={i === stage ? 'step' : undefined}>{label}</span>
              </li>
            ))}
          </ol>
        )}

        {o.status === 'AWAITING_PAYMENT' && (
          <div className="space-y-2 rounded-2xl bg-warning-50 p-4 text-sm">
            <p>Votre commande sera transmise au restaurant dès que le paiement Mobile Money sera confirmé.</p>
            <button type="button" onClick={pay} disabled={paying} className="bg-cta h-12 w-full rounded-2xl font-bold text-white shadow-[var(--shadow-raised)] disabled:opacity-50">{paying ? 'Redirection…' : `Payer ${fcfa(o.total)}`}</button>
          </div>
        )}
        {o.delayMinutes > 0 && !failed && o.status !== 'DELIVERED' && <p className="rounded-2xl bg-warning-50 p-4 text-sm text-warning">Le restaurant annonce un retard d’environ {o.delayMinutes} minutes.</p>}
        {(o.rejectReason || o.cancelReason) && <p className="rounded-2xl bg-danger-50 p-4 text-sm text-danger">Motif : {o.rejectReason ?? o.cancelReason}</p>}
        {o.deliveryCode && !failed && o.status !== 'DELIVERED' && (
          <div className="rounded-2xl bg-brand-50 p-4 text-sm">
            <p>Code de livraison à donner au livreur <b>uniquement à la remise</b> :</p>
            <p className="mt-1 text-2xl font-extrabold tracking-[0.3em] text-brand">{o.deliveryCode}</p>
          </div>
        )}

        <section className={card}>
          <p className="mb-2 text-[15px] font-extrabold">Articles</p>
          <ul className="space-y-1.5">{o.items.map((i, k) => (
            <li key={k} className="flex justify-between gap-3"><span className="min-w-0">{i.qty} × {i.name}{i.optionLabels.length ? <span className="text-ink-muted"> ({i.optionLabels.join(', ')})</span> : null}</span><span className="shrink-0 font-semibold">{fcfa(i.lineTotal)}</span></li>
          ))}</ul>
          <div className="mt-3 space-y-1.5 border-t border-line pt-3">
            <div className="flex justify-between"><span className="text-ink-muted">Sous-total</span><span className="font-bold">{fcfa(o.itemsSubtotal)}</span></div>
            {o.restaurantDiscount > 0 && <div className="flex justify-between text-success"><span>Promotions</span><span className="font-bold">−{fcfa(o.restaurantDiscount)}</span></div>}
            {o.platformDiscount > 0 && <div className="flex justify-between text-success"><span>Code promo</span><span className="font-bold">−{fcfa(o.platformDiscount)}</span></div>}
            <div className="flex justify-between"><span className="text-ink-muted">Frais de livraison</span><span className="font-bold">{fcfa(o.deliveryFee)}</span></div>
            {o.serviceFee > 0 && <div className="flex justify-between"><span className="text-ink-muted">Frais de service</span><span className="font-bold">{fcfa(o.serviceFee)}</span></div>}
            <div className="flex items-baseline justify-between border-t border-line pt-2.5"><span className="text-base font-extrabold">Total</span><span className="text-xl font-extrabold text-brand">{fcfa(o.total)}</span></div>
          </div>
          <p className="mt-2 text-xs text-ink-muted">{o.paymentMethod === 'MOBILE_MONEY' ? `Mobile Money · ${o.paymentStatus === 'SUCCEEDED' ? 'payé' : 'non payé'}` : 'Paiement à la livraison (espèces)'} · {o.address.label} : {o.address.neighborhood}, {o.address.streetLandmark}</p>
        </section>

        <details className={card}>
          <summary className="cursor-pointer text-[15px] font-extrabold">Historique détaillé</summary>
          <ol className="mt-3">
            {(failed ? o.history.map((h) => h.status) : steps).map((st, i, arr) => {
              const done = reached.has(st);
              const nextDone = i < arr.length - 1 && reached.has(arr[i + 1]);
              const bad = ['REJECTED', 'CANCELLED', 'DELIVERY_FAILED'].includes(st);
              return (
                <li key={`${st}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < arr.length - 1 && <span className={`absolute left-[7px] top-4 h-full w-0.5 ${done && nextDone ? 'bg-brand' : 'bg-line'}`} aria-hidden />}
                  <span className={`relative grid size-4 shrink-0 place-items-center rounded-full text-[10px] text-white ${done ? (bad ? 'bg-danger' : 'bg-brand') : 'border border-line bg-white'}`}>{done ? '✓' : ''}</span>
                  <div className="-mt-0.5 text-xs"><p className={done ? 'text-ink' : 'text-ink-muted'}>{STATUS_LABELS_FR[st]}</p><p className="text-ink-muted">{fmt(reached.get(st))}</p></div>
                </li>
              );
            })}
          </ol>
        </details>

        {o.status === 'DELIVERED' && <ReviewBox orderId={o.id} />}
        {msg && <p className="rounded-2xl bg-danger-50 p-4 text-sm text-danger">{msg}</p>}
        <div className="grid grid-cols-2 gap-3">
          {o.status === 'PENDING' || o.status === 'AWAITING_PAYMENT'
            ? <button type="button" disabled={cancelling} onClick={cancel} className="h-12 rounded-2xl border-2 border-brand font-bold text-brand">Annuler</button>
            : <a href={o.restaurant.phone ? `tel:${o.restaurant.phone}` : undefined} className={`grid h-12 place-items-center rounded-2xl border-2 border-brand font-bold text-brand ${o.restaurant.phone ? '' : 'pointer-events-none opacity-50'}`}>Appeler le restaurant</a>}
          <Link href="/accueil" className="bg-cta grid h-12 place-items-center rounded-2xl font-bold text-white shadow-[var(--shadow-raised)]">Commander encore</Link>
        </div>
        <Link href={`/aide?commande=${o.id}`} className="block text-center text-sm font-semibold text-brand">Un problème avec cette commande ?</Link>
      </main>
      <CustomerNavigation />
    </MobileScreen>
  );
}
