'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Quote } from '@plateforme/contracts';
import { AddressForm, SavedAddress } from '@/components/client/address-form';
import { PlainHeader } from '@/components/client/plain-header';
import { LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { api, ApiError } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { useSession } from '@/lib/session';
import { fcfa, useApi } from '@/lib/use-api';

type Method = 'CASH' | 'MOBILE_MONEY';
// Seuls les moyens réellement configurés côté serveur sont proposés (aucun faux bouton).
const OPTIONS: { id: Method; label: string; hint: string; icon: string }[] = [
  { id: 'MOBILE_MONEY', label: 'Mobile Money', hint: 'MTN MoMo ou Moov Money, paiement sécurisé FedaPay', icon: '📱' },
  { id: 'CASH', label: 'Paiement à la livraison', hint: 'En espèces, à la remise de la commande', icon: '💵' },
];
const newKey = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, '').padEnd(16, '0').slice(0, 64);

/** Validation et paiement — maquette 3 « Payment ». Le total affiché est celui calculé par le serveur. */
export default function CheckoutPage() {
  const router = useRouter();
  const { me, loading: sessionLoading } = useSession();
  const cart = useCart();
  const addresses = useApi<SavedAddress[]>(me ? '/me/addresses' : null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const methods = useApi<Record<Method, boolean>>('/payments/methods');
  const [method, setMethod] = useState<Method>('CASH');
  const [code, setCode] = useState('');
  const idemKey = useRef(newKey()); // même clé en cas de double clic ou de nouvel essai

  useEffect(() => { if (!sessionLoading && !me) router.replace('/connexion?suite=/paiement'); }, [sessionLoading, me, router]);
  const autoOpened = useRef(false);
  useEffect(() => {
    if (addresses.data && !addressId) setAddressId(addresses.data.find((a) => a.isDefault)?.id ?? addresses.data[0]?.id ?? null);
    // Ouvre le formulaire une seule fois si le client n'a aucune adresse.
    if (addresses.data?.length === 0 && !autoOpened.current) { autoOpened.current = true; setAdding(true); }
  }, [addresses.data, addressId]);
  useEffect(() => {
    if (!me) return;
    void cart.refresh(addressId ?? undefined).then((q) => setQuote(q)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressId, me?.id]);

  async function applyCoupon(remove = false) {
    setMsg(null);
    try {
      if (remove) await api('/cart/coupon', { method: 'DELETE' });
      else await api('/cart/coupon', { method: 'PUT', body: { code } });
      setQuote(await cart.refresh(addressId ?? undefined));
      if (remove) setCode('');
    } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Code non enregistré.'); }
  }

  async function place() {
    if (!quote || quote.total == null || !addressId) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ orderId: string; paymentRequired?: boolean }>('/orders', { method: 'POST', body: { addressId, paymentMethod: method, customerNote: note, expectedTotal: quote.total, idempotencyKey: idemKey.current } });
      await cart.refresh();
      if (r.paymentRequired) {
        // Redirection vers la page de paiement sécurisée FedaPay ; le paiement n'est validé qu'après vérification serveur.
        try {
          const p = await api<{ url: string | null }>(`/orders/${r.orderId}/payments`, { method: 'POST' });
          if (p.url) { window.location.assign(p.url); return; }
        } catch { /* la page commande propose de relancer le paiement */ }
      }
      router.replace(`/commandes/${r.orderId}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PRICE_CHANGED') {
        idemKey.current = newKey();
        setQuote(await cart.refresh(addressId));
        setMsg('Le montant a changé depuis votre consultation. Vérifiez le nouveau total puis confirmez.');
      } else setMsg(e instanceof ApiError ? e.message : 'La commande n’a pas pu être envoyée. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  if (!me || addresses.loading) return <MobileScreen className="bg-surface"><LoadingBlock /></MobileScreen>;
  const blocking = (quote?.blocking ?? []).filter((b) => b.code !== 'ADDRESS_REQUIRED' || !adding);

  return (
    <MobileScreen className="bg-surface">
      <PlainHeader title="Paiement" backHref="/panier" />
      <main className="flex-1 space-y-5 px-4 pb-4">
        <section>
          <p className="mb-2 font-semibold">Adresse de livraison</p>
          <div className="space-y-2" role="radiogroup" aria-label="Adresse de livraison">
            {addresses.data?.map((a) => (
              <button key={a.id} type="button" role="radio" aria-checked={addressId === a.id} onClick={() => setAddressId(a.id)}
                className={`flex w-full items-start gap-3 rounded-[8px] border p-3 text-left text-sm ${addressId === a.id ? 'border-success' : 'border-line'}`}>
                <span className="flex-1"><span className="block font-semibold">{a.label}</span><span className="text-ink-muted">{a.neighborhood}, {a.commune} · {a.streetLandmark}</span></span>
                {addressId === a.id && <span className="grid size-6 place-items-center rounded-full bg-success text-sm text-white" aria-hidden>✓</span>}
              </button>
            ))}
          </div>
          {adding ? (
            <div className="mt-3 rounded-[8px] border border-line p-3">
              <AddressForm onSaved={(id) => { setAdding(false); addresses.reload(); setAddressId(id); }} onCancel={addresses.data?.length ? () => setAdding(false) : undefined} />
            </div>
          ) : <button type="button" className="mt-2 text-sm font-semibold text-brand" onClick={() => setAdding(true)}>+ Nouvelle adresse</button>}
          <p className="mt-2 text-xs text-ink-muted">Téléphone pour le livreur : {me.phone}</p>
        </section>

        <section role="radiogroup" aria-label="Mode de paiement" className="space-y-3">
          <p className="font-semibold">Mode de paiement</p>
          {OPTIONS.filter((o) => o.id === 'CASH' || methods.data?.[o.id]).map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={method === o.id} onClick={() => setMethod(o.id)}
              className={`flex w-full items-center gap-4 rounded-[8px] border p-4 text-left ${method === o.id ? 'border-success' : 'border-line'}`}>
              <span className="text-3xl" aria-hidden>{o.icon}</span>
              <span className="flex-1"><span className="block text-[14px] font-semibold">{o.label}</span><span className="block text-xs text-ink-muted">{o.hint}</span></span>
              {method === o.id ? <span className="grid size-6 place-items-center rounded-full bg-success text-sm text-white" aria-hidden>✓</span> : <span className="size-6 rounded-full border border-line" aria-hidden />}
            </button>
          ))}
        </section>

        <section className="space-y-2">
          <p className="font-semibold">Code promo</p>
          {quote?.coupon ? (
            <div className={`flex items-center justify-between rounded-[8px] border p-3 text-sm ${quote.coupon.applied ? 'border-success' : 'border-danger'}`}>
              <span><b>{quote.coupon.code}</b>{quote.coupon.applied ? <span className="text-success"> — appliqué</span> : <span className="block text-danger">{quote.coupon.message}</span>}</span>
              <button type="button" className="text-sm font-semibold text-brand" onClick={() => applyCoupon(true)}>Retirer</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} placeholder="Saisissez votre code" aria-label="Code promo" className="h-11 min-w-0 flex-1 rounded-[8px] border border-line px-3 text-sm uppercase" />
              <button type="button" disabled={code.trim().length < 3} onClick={() => applyCoupon()} className="h-11 rounded-[8px] border border-brand px-4 text-sm font-semibold text-brand disabled:opacity-50">Appliquer</button>
            </div>
          )}
        </section>

        <label className="block text-sm"><span className="font-semibold">Note pour le restaurant (facultatif)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className="mt-1 w-full rounded-[8px] border border-line p-2" placeholder="Ex. sans piment" />
        </label>

        {quote && quote.lines.length > 0 && (
          <section className="rounded-[8px] border border-line p-3 text-sm">
            <p className="mb-2 font-semibold">{quote.restaurant?.name}</p>
            {quote.lines.map((l) => <div key={l.key} className="flex justify-between"><span>{l.qty} × {l.name}</span><span>{fcfa(l.lineTotal)}</span></div>)}
          </section>
        )}
      </main>
      <footer className="sticky bottom-0 space-y-2 bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-sm">
        {quote && <>
          <div className="flex justify-between"><span>Sous-total</span><span className="tabular-nums">{fcfa(quote.itemsSubtotal)}</span></div>
          {quote.restaurantDiscount > 0 && <div className="flex justify-between text-success"><span>Promotions</span><span>−{fcfa(quote.restaurantDiscount)}</span></div>}
          {quote.platformDiscount > 0 && <div className="flex justify-between text-success"><span>Code promo</span><span>−{fcfa(quote.platformDiscount)}</span></div>}
          <div className="flex justify-between"><span>Frais de livraison</span><span>{quote.deliveryFee != null ? fcfa(quote.deliveryFee) : '—'}</span></div>
          {quote.serviceFee ? <div className="flex justify-between"><span>Frais de service</span><span>{fcfa(quote.serviceFee)}</span></div> : null}
          <div className="flex justify-between border-t border-line pt-3 text-base"><span className="font-bold">Total</span><span className="text-xl font-semibold text-brand tabular-nums">{quote.total != null ? fcfa(quote.total) : '—'}</span></div>
        </>}
        {blocking.map((b) => <p key={b.code} className="rounded-[8px] bg-danger-50 p-2 text-danger">{b.message}</p>)}
        {msg && <p className="rounded-[8px] bg-brand-50 p-2">{msg}</p>}
        <button type="button" onClick={place} disabled={busy || !quote || quote.total == null || blocking.length > 0 || !addressId}
          className="mt-1 h-12 w-full rounded-[8px] bg-brand font-semibold text-white disabled:opacity-50">{busy ? 'Envoi…' : method === 'MOBILE_MONEY' ? 'Payer par Mobile Money' : 'Passer la commande'}</button>
        <p className="text-center text-[11px] text-ink-muted">{method === 'MOBILE_MONEY' ? 'Vous serez redirigé vers la page sécurisée FedaPay. Le restaurant reçoit la commande dès le paiement confirmé.' : 'Vous payez en espèces à la remise de la commande.'}</p>
      </footer>
    </MobileScreen>
  );
}
