'use client';
import Link from 'next/link';
import { useState } from 'react';
import { CustomerNavigation } from '@/components/client/customer-navigation';
import { PlainHeader } from '@/components/client/plain-header';
import { MobileScreen } from '@/components/mobile';
import { AppIcon } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { useSession } from '@/lib/session';
import { fcfa } from '@/lib/use-api';

interface Row { key: string; name: string; imageUrl: string | null; qty: number; lineTotal: number; detail: string; problem: string | null }

/** Panier — maquette « Your Cart » : plats, quantités, code promo, récapitulatif. Panier serveur (prix calculés par l'API) pour un client connecté, local sinon. */
export default function CartPage() {
  const cart = useCart();
  const { me } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const rows: Row[] = cart.mode === 'server'
    ? (cart.quote?.lines ?? []).map((l) => ({ key: l.key, name: l.name, imageUrl: l.imageUrl, qty: l.qty, lineTotal: l.lineTotal, detail: l.optionLabels.join(' · '), problem: l.problem }))
    : cart.local.lines.map((l) => ({ key: l.key, name: l.name, imageUrl: l.imageUrl, qty: l.qty, lineTotal: l.qty * l.unitPrice, detail: l.optionLabels.join(' · '), problem: null }));
  const hasProblem = rows.some((r) => r.problem);
  const act = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } finally { setBusy(null); } };
  const q = cart.mode === 'server' ? cart.quote : null;

  async function coupon(remove = false) {
    setCouponMsg(null);
    setApplying(true);
    try {
      if (remove) await api('/cart/coupon', { method: 'DELETE' });
      else await api('/cart/coupon', { method: 'PUT', body: { code: code.trim() } });
      await cart.refresh();
      if (remove) setCode('');
    } catch (e) {
      setCouponMsg(e instanceof ApiError ? e.message : 'Code non enregistré.');
    } finally {
      setApplying(false);
    }
  }

  return (
    <MobileScreen wide className="client-brand bg-white" contentClassName="md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(300px,.8fr)] md:grid-rows-[auto_auto_1fr] md:items-start md:gap-x-6 md:px-8">
      <PlainHeader title="Mon panier" backHref={cart.restaurantSlug ? `/restaurants/${cart.restaurantSlug}` : '/accueil'} className="md:col-span-2 md:!w-full" />
      {cart.restaurantName && <p className="px-5 pb-2 text-sm text-ink-muted md:col-span-2 md:px-0">Restaurant : <span className="font-bold text-ink">{cart.restaurantName}</span></p>}
      <main className={`min-w-0 flex-1 space-y-3 px-5 pb-4 ${rows.length ? 'md:col-start-1 md:row-start-3 md:w-full md:px-6' : 'md:col-span-2 md:row-start-3'}`}>
        {rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-50 text-2xl" aria-hidden>🛒</span>
            <p className="mt-3 font-bold">{cart.loading ? 'Chargement…' : 'Votre panier est vide'}</p>
            <Link href="/accueil" className="mt-4 inline-flex h-10 items-center rounded-full bg-brand px-5 text-sm font-bold text-white">Découvrir les restaurants</Link>
          </div>
        )}
        {rows.map((l) => (
          <div key={l.key} className={`flex items-center gap-3 rounded-2xl border bg-white p-3 shadow-[var(--shadow-card)] ${l.problem ? 'border-danger' : 'border-line'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {l.imageUrl ? <img src={l.imageUrl} alt={l.name} className="size-[68px] shrink-0 rounded-xl object-cover" /> : <span className="grid size-[68px] shrink-0 place-items-center rounded-xl bg-brand-50 text-xl" aria-hidden>🍽️</span>}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-[15px] font-bold">{l.name}</p>
                <button type="button" aria-label={`Retirer ${l.name}`} disabled={busy === l.key} onClick={() => act(l.key, () => cart.remove(l.key))}
                  className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-ink-muted hover:text-danger disabled:opacity-40">
                  <AppIcon name="trash-2" className="size-[18px]" />
                </button>
              </div>
              {l.detail && <p className="truncate text-[11px] text-ink-muted">{l.detail}</p>}
              {l.problem && <p className="text-[11px] font-semibold text-danger">{l.problem}</p>}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[15px] font-extrabold">{fcfa(l.lineTotal)}</span>
                <div className="inline-flex items-center rounded-full border border-line bg-white" role="group" aria-label={`Quantité de ${l.name}`}>
                  <button type="button" aria-label="Diminuer" disabled={l.qty <= 1 || busy === l.key} onClick={() => act(l.key, () => cart.setQty(l.key, l.qty - 1))}
                    className="grid size-8 place-items-center rounded-full text-ink disabled:opacity-35"><AppIcon name="minus" className="size-4" /></button>
                  <span className="w-6 text-center text-sm font-bold tabular-nums" aria-live="polite">{l.qty}</span>
                  <button type="button" aria-label="Augmenter" disabled={busy === l.key} onClick={() => act(l.key, () => cart.setQty(l.key, Math.min(99, l.qty + 1)))}
                    className="grid size-8 place-items-center rounded-full bg-brand text-white"><AppIcon name="plus" className="size-4" /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </main>

      {rows.length > 0 && (
        <footer className="sticky bottom-0 space-y-3 border-t border-line bg-white px-5 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 md:static md:col-start-2 md:row-start-3 md:top-24 md:self-start md:rounded-2xl md:border md:px-5 md:py-5 md:shadow-[var(--shadow-card)]">
          {me ? (
            q?.coupon ? (
              <div className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-sm ${q.coupon.applied ? 'border-success bg-success-50' : 'border-danger bg-danger-50'}`}>
                <span className="min-w-0"><AppIcon name="tag" className="mr-1.5 inline size-4" /><b>{q.coupon.code}</b>{q.coupon.applied ? <span className="text-success"> — appliqué</span> : <span className="block text-danger">{q.coupon.message}</span>}</span>
                <button type="button" disabled={applying} onClick={() => coupon(true)} className="shrink-0 text-sm font-bold text-brand">Retirer</button>
              </div>
            ) : (
              <div>
                <p className="mb-1.5 text-[13px] font-bold">Code promo</p>
                <div className="flex gap-2">
                  <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Entrez votre code" aria-label="Code promo" autoCapitalize="characters"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-[#F6F6F8] px-4 text-sm outline-none focus:border-brand focus:bg-white" />
                  <button type="button" disabled={applying || code.trim().length < 3} onClick={() => coupon()}
                    className="h-11 shrink-0 rounded-xl bg-brand px-5 text-sm font-bold text-white disabled:opacity-50">Appliquer</button>
                </div>
              </div>
            )
          ) : <p className="text-[13px] text-ink-muted">Connectez-vous pour utiliser un code promo.</p>}
          {couponMsg && <p className="text-xs text-danger">{couponMsg}</p>}

          <dl className="space-y-1.5 pt-1 text-sm">
            <div className="flex justify-between"><dt className="text-ink-muted">Sous-total</dt><dd className="font-bold">{fcfa(cart.subtotal)}</dd></div>
            {q && q.restaurantDiscount > 0 && <div className="flex justify-between text-success"><dt>Promotions</dt><dd className="font-bold">−{fcfa(q.restaurantDiscount)}</dd></div>}
            {q && q.platformDiscount > 0 && <div className="flex justify-between text-success"><dt>Code promo</dt><dd className="font-bold">−{fcfa(q.platformDiscount)}</dd></div>}
            <div className="flex justify-between"><dt className="text-ink-muted">Frais de livraison</dt><dd className="text-xs text-ink-muted">calculés à l’étape suivante</dd></div>
          </dl>
          {hasProblem && <p className="text-sm text-danger">Retirez les plats signalés pour continuer.</p>}
          <Link href={me ? '/paiement' : '/connexion?suite=/paiement'} aria-disabled={hasProblem}
            className={`bg-cta flex h-14 w-full items-center justify-center rounded-2xl text-[16px] font-bold text-white shadow-[var(--shadow-raised)] ${hasProblem ? 'pointer-events-none opacity-50' : ''}`}>
            {me ? 'Passer à la commande' : 'Se connecter pour commander'}
          </Link>
        </footer>
      )}
      <CustomerNavigation />
    </MobileScreen>
  );
}
