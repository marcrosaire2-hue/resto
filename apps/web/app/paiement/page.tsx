'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Quote } from '@plateforme/contracts';
import { AddressForm, SavedAddress } from '@/components/client/address-form';
import { CustomerNavigation } from '@/components/client/customer-navigation';
import { PlainHeader } from '@/components/client/plain-header';
import { LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { AppIcon } from '@/components/ui';
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

/** Commande — maquette « Checkout » : adresse, heure, paiement, récapitulatif. Le total affiché est celui calculé par le serveur. */
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

  if (!me || addresses.loading) return <MobileScreen wide className="client-brand bg-white"><LoadingBlock /></MobileScreen>;
  const blocking = (quote?.blocking ?? []).filter((b) => b.code !== 'ADDRESS_REQUIRED' || !adding);
  const radio = (on: boolean) => (on
    ? <span className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-brand" aria-hidden><span className="size-3 rounded-full bg-brand" /></span>
    : <span className="size-6 shrink-0 rounded-full border-2 border-line" aria-hidden />);

  return (
    <MobileScreen wide className="client-brand bg-white" contentClassName="md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(320px,.7fr)] md:items-start md:gap-x-6 md:px-8">
      <PlainHeader title="Commande" backHref="/panier" className="md:col-span-2 md:!w-full" />
      <main className="min-w-0 flex-1 space-y-6 px-5 pb-6 md:col-start-1 md:row-start-2 md:w-full md:px-6">
        <section>
          <h2 className="mb-2.5 text-[16px] font-extrabold">Adresse de livraison</h2>
          <div className="space-y-2.5" role="radiogroup" aria-label="Adresse de livraison">
            {addresses.data?.map((a) => (
              <button key={a.id} type="button" role="radio" aria-checked={addressId === a.id} onClick={() => setAddressId(a.id)}
                className={`flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left text-sm ${addressId === a.id ? 'border-brand bg-brand-50/50' : 'border-line bg-white'}`}>
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand" aria-hidden><AppIcon name="map-pin" className="size-5" /></span>
                <span className="min-w-0 flex-1"><span className="block font-bold">{a.label}</span><span className="block text-[13px] text-ink-muted">{[a.neighborhood, a.commune].filter(Boolean).join(', ')}{a.neighborhood || a.commune ? ' · ' : ''}{a.streetLandmark}</span></span>
                {radio(addressId === a.id)}
              </button>
            ))}
          </div>
          {adding ? (
            <div className="mt-3 rounded-2xl border border-line bg-white p-4">
              <AddressForm onSaved={(id) => { setAdding(false); addresses.reload(); setAddressId(id); }} onCancel={addresses.data?.length ? () => setAdding(false) : undefined} />
            </div>
          ) : <button type="button" className="mt-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand/50 text-sm font-bold text-brand" onClick={() => setAdding(true)}><AppIcon name="plus" className="size-4" /> Nouvelle adresse</button>}
          <p className="mt-2 text-xs text-ink-muted">Téléphone pour le livreur : {me.phone}</p>
        </section>

        <section>
          <h2 className="mb-2.5 text-[16px] font-extrabold">Heure de livraison</h2>
          <div className="flex items-center gap-3 rounded-2xl border-2 border-brand bg-brand-50/50 p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand" aria-hidden><AppIcon name="clock-3" className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Dès que possible</span><span className="block text-[13px] text-ink-muted">Le restaurant prépare votre commande dès réception.</span></span>
            {radio(true)}
          </div>
        </section>

        <section role="radiogroup" aria-label="Mode de paiement" className="space-y-2.5">
          <h2 className="text-[16px] font-extrabold">Mode de paiement</h2>
          {OPTIONS.filter((o) => o.id === 'CASH' || methods.data?.[o.id]).map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={method === o.id} onClick={() => setMethod(o.id)}
              className={`flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left ${method === o.id ? 'border-brand bg-brand-50/50' : 'border-line bg-white'}`}>
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#F3F3F5] text-2xl" aria-hidden>{o.icon}</span>
              <span className="min-w-0 flex-1"><span className="block text-[14px] font-bold">{o.label}</span><span className="block text-xs text-ink-muted">{o.hint}</span></span>
              {radio(method === o.id)}
            </button>
          ))}
        </section>

        <section className="space-y-2">
          <h2 className="text-[16px] font-extrabold">Code promo</h2>
          {quote?.coupon ? (
            <div className={`flex items-center justify-between gap-3 rounded-2xl border p-3 text-sm ${quote.coupon.applied ? 'border-success bg-success-50' : 'border-danger bg-danger-50'}`}>
              <span className="min-w-0"><b>{quote.coupon.code}</b>{quote.coupon.applied ? <span className="text-success"> — appliqué</span> : <span className="block text-danger">{quote.coupon.message}</span>}</span>
              <button type="button" className="shrink-0 text-sm font-bold text-brand" onClick={() => applyCoupon(true)}>Retirer</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} placeholder="Entrez votre code" aria-label="Code promo" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-[#F6F6F8] px-4 text-sm uppercase outline-none focus:border-brand focus:bg-white" />
              <button type="button" disabled={code.trim().length < 3} onClick={() => applyCoupon()} className="h-11 shrink-0 rounded-xl bg-brand px-5 text-sm font-bold text-white disabled:opacity-50">Appliquer</button>
            </div>
          )}
        </section>

        <label className="block text-sm"><span className="text-[16px] font-extrabold">Note pour le restaurant</span> <span className="text-xs text-ink-muted">(facultatif)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className="mt-2 w-full rounded-2xl border border-line bg-[#F6F6F8] p-3 text-sm outline-none focus:border-brand focus:bg-white" placeholder="Ex. sans piment" />
        </label>

        {quote && quote.lines.length > 0 && (
          <section className="rounded-2xl bg-[#F6F6F8] p-4 text-sm">
            <p className="mb-2 font-bold">{quote.restaurant?.name}</p>
            {quote.lines.map((l) => <div key={l.key} className="flex justify-between gap-3 py-0.5"><span className="min-w-0 truncate">{l.qty} × {l.name}</span><span className="shrink-0 font-semibold">{fcfa(l.lineTotal)}</span></div>)}
          </section>
        )}
      </main>
      <footer className="sticky bottom-0 space-y-2 border-t border-line bg-white px-5 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 text-sm md:static md:col-start-2 md:row-start-2 md:top-24 md:self-start md:rounded-2xl md:border md:px-5 md:py-5 md:shadow-[var(--shadow-card)]">
        {quote && <>
          <div className="flex justify-between"><span className="text-ink-muted">Sous-total</span><span className="font-bold tabular-nums">{fcfa(quote.itemsSubtotal)}</span></div>
          {quote.restaurantDiscount > 0 && <div className="flex justify-between text-success"><span>Promotions</span><span className="font-bold">−{fcfa(quote.restaurantDiscount)}</span></div>}
          {quote.platformDiscount > 0 && <div className="flex justify-between text-success"><span>Code promo</span><span className="font-bold">−{fcfa(quote.platformDiscount)}</span></div>}
          <div className="flex justify-between"><span className="text-ink-muted">Frais de livraison</span><span className="font-bold tabular-nums">{quote.deliveryFee != null ? fcfa(quote.deliveryFee) : '—'}</span></div>
          {quote.serviceFee ? <div className="flex justify-between"><span className="text-ink-muted">Frais de service</span><span className="font-bold tabular-nums">{fcfa(quote.serviceFee)}</span></div> : null}
          <div className="flex items-baseline justify-between border-t border-line pt-3"><span className="text-base font-extrabold">Total</span><span className="text-xl font-extrabold tabular-nums text-brand">{quote.total != null ? fcfa(quote.total) : '—'}</span></div>
        </>}
        {blocking.map((b) => <p key={b.code} className="rounded-xl bg-danger-50 p-2.5 text-danger">{b.message}</p>)}
        {msg && <p className="rounded-xl bg-brand-50 p-2.5">{msg}</p>}
        <button type="button" onClick={place} disabled={busy || !quote || quote.total == null || blocking.length > 0 || !addressId}
          className="bg-cta mt-1 flex h-14 w-full items-center justify-center rounded-2xl text-[16px] font-bold text-white shadow-[var(--shadow-raised)] disabled:opacity-50">{busy ? 'Envoi…' : method === 'MOBILE_MONEY' ? 'Payer par Mobile Money' : 'Passer la commande'}</button>
        <p className="text-center text-[11px] text-ink-muted">{method === 'MOBILE_MONEY' ? 'Vous serez redirigé vers la page sécurisée FedaPay. Le restaurant reçoit la commande dès le paiement confirmé.' : 'Vous payez en espèces à la remise de la commande.'}</p>
      </footer>
      <CustomerNavigation />
    </MobileScreen>
  );
}
