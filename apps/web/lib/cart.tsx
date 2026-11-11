'use client';
/**
 * Panier : stocké côté serveur pour un client connecté (prix recalculés par l'API).
 * Un visiteur non connecté peut remplir un panier local ; il est transféré au serveur dès la connexion
 * (la connexion n'est exigée qu'au moment de commander).
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import type { ProductSelection, Quote } from '@plateforme/contracts';
import { api, ApiError } from './api';
import { useSession } from './session';

export interface LocalLine { key: string; productId: string; name: string; imageUrl: string | null; unitPrice: number; qty: number; selection: ProductSelection; optionLabels: string[] }
interface LocalCart { restaurantSlug: string | null; restaurantName: string | null; lines: LocalLine[] }
type AddLine = Omit<LocalLine, 'key'>;

interface CartState {
  mode: 'server' | 'local';
  quote: Quote | null;
  local: LocalCart;
  count: number;
  subtotal: number;
  restaurantName: string | null;
  restaurantSlug: string | null;
  loading: boolean;
  refresh: (addressId?: string) => Promise<Quote | null>;
  add: (restaurant: { slug: string; name: string }, line: AddLine, replace?: boolean) => Promise<{ conflict: boolean }>;
  setQty: (key: string, qty: number) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

const Ctx = createContext<CartState | null>(null);
const KEY = 'cart-v2';
const EMPTY: LocalCart = { restaurantSlug: null, restaurantName: null, lines: [] };
const localKey = (l: AddLine) => `${l.productId}|${JSON.stringify(l.selection.variants)}|${[...l.selection.addons].sort().join(',')}`;

export function CartProvider({ children }: { children: ReactNode }) {
  const { me, loading: sessionLoading } = useSession();
  const [local, setLocal] = useState<LocalCart>(EMPTY);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const mode = me ? 'server' : 'local';

  const saveLocal = (c: LocalCart) => {
    setLocal(c);
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* stockage indisponible */ }
  };
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setLocal(JSON.parse(raw)); } catch { /* ignoré */ }
  }, []);

  const refresh = useCallback(async (addressId?: string) => {
    if (!me) return null;
    setLoading(true);
    try {
      const q = await api<Quote>(`/cart${addressId ? `?addressId=${addressId}` : ''}`);
      setQuote(q);
      return q;
    } finally {
      setLoading(false);
    }
  }, [me]);

  // À la connexion : transfert du panier local vers le serveur, puis chargement.
  useEffect(() => {
    if (sessionLoading || !me) { if (!me) setQuote(null); return; }
    void (async () => {
      let stored: LocalCart = EMPTY;
      try { stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? EMPTY; } catch { /* ignoré */ }
      if (stored.lines.length) {
        for (const [i, l] of stored.lines.entries()) {
          await api('/cart/items', { method: 'POST', body: { replace: i === 0, item: { productId: l.productId, qty: l.qty, variants: l.selection.variants, addons: l.selection.addons } } }).catch(() => undefined);
        }
        saveLocal(EMPTY);
      }
      await refresh().catch(() => undefined);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, sessionLoading]);

  const value: CartState = {
    mode, quote, local, loading, refresh,
    count: mode === 'server' ? (quote?.lines.reduce((s, l) => s + l.qty, 0) ?? 0) : local.lines.reduce((s, l) => s + l.qty, 0),
    subtotal: mode === 'server' ? (quote?.itemsSubtotal ?? 0) : local.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0),
    restaurantName: mode === 'server' ? (quote?.restaurant?.name ?? null) : local.restaurantName,
    restaurantSlug: mode === 'server' ? (quote?.restaurant?.slug ?? null) : local.restaurantSlug,
    async add(restaurant, line, replace = false) {
      if (mode === 'server') {
        try {
          await api('/cart/items', { method: 'POST', body: { replace, item: { productId: line.productId, qty: line.qty, variants: line.selection.variants, addons: line.selection.addons } } });
          await refresh();
          return { conflict: false };
        } catch (e) {
          if (e instanceof ApiError && e.code === 'OTHER_RESTAURANT') return { conflict: true };
          throw e;
        }
      }
      if (!replace && local.restaurantSlug && local.restaurantSlug !== restaurant.slug && local.lines.length) return { conflict: true };
      const key = localKey(line);
      const base = replace || local.restaurantSlug !== restaurant.slug ? [] : local.lines;
      const existing = base.find((l) => l.key === key);
      saveLocal({
        restaurantSlug: restaurant.slug, restaurantName: restaurant.name,
        lines: existing ? base.map((l) => (l.key === key ? { ...l, qty: Math.min(99, l.qty + line.qty) } : l)) : [...base, { ...line, key }],
      });
      return { conflict: false };
    },
    async setQty(key, qty) {
      if (mode === 'server') { await api('/cart/items', { method: 'PATCH', body: { key, qty } }); await refresh(); return; }
      saveLocal({ ...local, lines: local.lines.map((l) => (l.key === key ? { ...l, qty } : l)) });
    },
    async remove(key) {
      if (mode === 'server') { await api('/cart/items', { method: 'PATCH', body: { key, qty: 0 } }); await refresh(); return; }
      const lines = local.lines.filter((l) => l.key !== key);
      saveLocal(lines.length ? { ...local, lines } : EMPTY);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCart hors de CartProvider');
  return v;
}
