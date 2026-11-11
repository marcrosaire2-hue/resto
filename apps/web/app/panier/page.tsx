'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PlainHeader } from '@/components/client/plain-header';
import { MobileScreen } from '@/components/mobile';
import { useCart } from '@/lib/cart';
import { useSession } from '@/lib/session';
import { fcfa } from '@/lib/use-api';

interface Row { key: string; name: string; imageUrl: string | null; qty: number; lineTotal: number; detail: string; problem: string | null }

/** Panier — maquette 3 « View cart ». Panier serveur pour un client connecté, local sinon. */
export default function CartPage() {
  const cart = useCart();
  const { me } = useSession();
  const [coupon, setCoupon] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const rows: Row[] = cart.mode === 'server'
    ? (cart.quote?.lines ?? []).map((l) => ({ key: l.key, name: l.name, imageUrl: l.imageUrl, qty: l.qty, lineTotal: l.lineTotal, detail: l.optionLabels.join(' · ') || 'Standard', problem: l.problem }))
    : cart.local.lines.map((l) => ({ key: l.key, name: l.name, imageUrl: l.imageUrl, qty: l.qty, lineTotal: l.qty * l.unitPrice, detail: l.optionLabels.join(' · ') || 'Standard', problem: null }));
  const hasProblem = rows.some((r) => r.problem);
  const act = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } finally { setBusy(null); } };

  return (
    <MobileScreen className="bg-surface">
      <PlainHeader title="Mon panier" backHref={cart.restaurantSlug ? `/restaurants/${cart.restaurantSlug}` : '/accueil'} />
      {cart.restaurantName && <p className="px-4 pb-2 text-sm text-ink-muted">Restaurant : <span className="font-semibold text-ink">{cart.restaurantName}</span></p>}
      <main className="flex-1 space-y-3 px-4">
        {rows.length === 0 && (
          <div className="rounded-[10px] border border-line p-6 text-center">
            <p className="font-semibold">{cart.loading ? 'Chargement…' : 'Votre panier est vide'}</p>
            <Link href="/accueil" className="mt-3 inline-block text-sm font-semibold text-brand">Découvrir les restaurants</Link>
          </div>
        )}
        {rows.map((l) => (
          <div key={l.key} className={`flex gap-3 rounded-[8px] border p-2 ${l.problem ? 'border-danger' : 'border-line'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {l.imageUrl ? <img src={l.imageUrl} alt={l.name} className="size-[68px] shrink-0 rounded-[6px] object-cover" /> : <span className="size-[68px] shrink-0 rounded-[6px] bg-peach" />}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-[14px] font-semibold">{l.name}</p>
                <button type="button" disabled={busy === l.key} onClick={() => act(l.key, () => cart.remove(l.key))} className="shrink-0 rounded-[4px] bg-danger-50 px-2 py-0.5 text-[11px] text-danger">Retirer</button>
              </div>
              <p className="truncate text-[11px] text-ink-muted">{l.detail}</p>
              {l.problem && <p className="text-[11px] font-semibold text-danger">{l.problem}</p>}
              <div className="mt-auto flex items-center justify-between">
                <span className="text-[17px] font-semibold text-brand">{fcfa(l.lineTotal)}</span>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Diminuer" disabled={l.qty <= 1 || busy === l.key} onClick={() => act(l.key, () => cart.setQty(l.key, l.qty - 1))} className="grid size-6 place-items-center rounded-full bg-[#eee] text-sm disabled:opacity-40">−</button>
                  <span className="w-5 text-center text-xs tabular-nums">{String(l.qty).padStart(2, '0')}</span>
                  <button type="button" aria-label="Augmenter" disabled={busy === l.key} onClick={() => act(l.key, () => cart.setQty(l.key, Math.min(99, l.qty + 1)))} className="grid size-6 place-items-center rounded-full bg-[#eee] text-sm">+</button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </main>
      {rows.length > 0 && (
        <footer className="sticky bottom-0 space-y-3 bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button type="button" onClick={() => setCoupon((v) => !v)} className="flex w-full items-center justify-between text-sm">
            <span>🏷️ Vous avez un code promo ?</span><span aria-hidden>›</span>
          </button>
          {coupon && <p className="text-xs text-ink-muted">Les codes promo seront disponibles avec le module commercial.</p>}
          {cart.mode === 'server' && (cart.quote?.restaurantDiscount ?? 0) > 0 && <div className="flex justify-between text-sm text-success"><span>Promotions</span><span>−{fcfa(cart.quote!.restaurantDiscount)}</span></div>}
          <div className="flex items-center justify-between border-t border-line pt-3">
            <span className="text-ink-muted">Sous-total</span>
            <span className="text-xl font-semibold text-brand">{fcfa(cart.subtotal)}</span>
          </div>
          {hasProblem && <p className="text-sm text-danger">Retirez les plats signalés pour continuer.</p>}
          <Link href={me ? '/paiement' : '/connexion?suite=/paiement'} aria-disabled={hasProblem}
            className={`flex h-12 w-full items-center justify-center rounded-[8px] bg-brand font-semibold text-white ${hasProblem ? 'pointer-events-none opacity-50' : ''}`}>
            {me ? 'Valider le panier' : 'Se connecter pour commander'}
          </Link>
        </footer>
      )}
    </MobileScreen>
  );
}
