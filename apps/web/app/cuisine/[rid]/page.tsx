'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { KitchenTicket, OrderStatus } from '@plateforme/contracts';
import { Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useLive } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

const COLUMNS: { key: string; title: string; statuses: OrderStatus[]; tone: string }[] = [
  { key: 'new', title: 'Nouvelles commandes', statuses: ['PENDING'], tone: 'bg-brand' },
  { key: 'todo', title: 'À préparer', statuses: ['ACCEPTED'], tone: 'bg-warning' },
  { key: 'doing', title: 'En préparation', statuses: ['PREPARING'], tone: 'bg-wine' },
  { key: 'ready', title: 'Prêtes', statuses: ['READY', 'WAITING_FOR_COURIER', 'COURIER_ASSIGNED'], tone: 'bg-success' },
];

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.3, 0.6].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 988; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.3, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.26);
    });
  } catch { /* son indisponible */ }
}

/** Écran cuisine (tablette, écran tactile) : 4 colonnes, temps écoulé, alerte sonore et visuelle. Aucune donnée client. */
export default function KitchenScreen() {
  const { rid } = useParams<{ rid: string }>();
  const router = useRouter();
  const { me, loading } = useSession();
  const membership = me?.restaurants.find((r) => r.restaurantId === rid);
  const can = (p: string) => !!membership?.permissions.includes(p);
  const tickets = useApi<KitchenTicket[]>(membership && can('kitchen.view') ? `/restaurants/${rid}/kitchen` : null);
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(false);
  const [flash, setFlash] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [delayFor, setDelayFor] = useState<string | null>(null);
  const known = useRef<Set<string> | null>(null);

  useEffect(() => { if (!loading && !me) router.replace(`/connexion?suite=/cuisine/${rid}`); }, [loading, me, rid, router]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(i); }, []);
  useLive(membership ? { type: 'restaurant', id: rid } : null, ['order.created', 'order.updated'], tickets.reload, 15_000);
  useEffect(() => {
    if (!tickets.data) return;
    const fresh = tickets.data.filter((t) => t.status === 'PENDING' && known.current && !known.current.has(t.id));
    if (fresh.length) {
      setFlash(true);
      setTimeout(() => setFlash(false), 3000);
      if (sound) beep();
    }
    known.current = new Set(tickets.data.map((t) => t.id));
  }, [tickets.data, sound]);

  async function act(id: string, path: string, body?: object) {
    setMsg(null);
    try { await api(`/restaurants/${rid}/orders/${id}/${path}`, { method: 'POST', body }); tickets.reload(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Action impossible.'); tickets.reload(); }
  }

  if (loading || !me) return <div className="grid min-h-dvh place-items-center bg-ink text-white"><Spinner /></div>;
  if (!membership || !can('kitchen.view')) return <div className="grid min-h-dvh place-items-center bg-ink p-6 text-center text-white"><div><p className="font-bold">Accès cuisine non autorisé</p><Link href="/pro" className="text-sm text-brand-100">Retour</Link></div></div>;
  const elapsed = (iso: string) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));

  return (
    <div className={`min-h-dvh bg-[#1b1c1f] p-3 text-white transition-colors ${flash ? 'ring-8 ring-inset ring-brand' : ''}`}>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
        <div><p className="text-lg font-extrabold">Cuisine · {membership.name}</p><p className="text-xs text-white/60">Mise à jour en direct</p></div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => { setSound(!sound); if (!sound) beep(); }} className={`h-11 rounded-[12px] px-4 font-semibold ${sound ? 'bg-brand' : 'bg-white/10'}`}>{sound ? '🔔 Son activé' : '🔕 Activer le son'}</button>
          <Link href={`/pro/${rid}`} className="h-11 rounded-[12px] bg-white/10 px-4 leading-[44px]">Quitter</Link>
        </div>
      </header>
      {msg && <p className="mb-3 rounded-[10px] bg-danger px-3 py-2 text-sm">{msg}</p>}
      {tickets.loading && !tickets.data ? <div className="grid place-items-center py-20"><Spinner /></div> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const list = (tickets.data ?? []).filter((t) => col.statuses.includes(t.status));
            return (
              <section key={col.key} className="flex min-h-[60vh] flex-col rounded-[16px] bg-white/5">
                <h2 className={`flex items-center justify-between rounded-t-[16px] px-4 py-3 font-bold ${col.tone}`}>{col.title}<span className="rounded-full bg-black/25 px-2.5 text-sm">{list.length}</span></h2>
                <div className="flex-1 space-y-3 p-3">
                  {list.length === 0 && <p className="py-6 text-center text-sm text-white/40">Rien ici</p>}
                  {list.map((t) => {
                    const mins = elapsed(t.createdAt);
                    return (
                      <article key={t.id} className="rounded-[14px] bg-white p-3 text-ink">
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-extrabold">{t.number.slice(-5)}</span>
                          <span className={`rounded-full px-2 py-0.5 text-sm font-bold ${mins >= 30 ? 'bg-danger text-white' : mins >= 15 ? 'bg-warning-50 text-warning' : 'bg-black/5'}`}>⏱ {mins} min</span>
                        </div>
                        <p className="text-xs text-ink-muted">Reçue à {new Date(t.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}{t.delayMinutes ? ` · retard annoncé +${t.delayMinutes} min` : ''}</p>
                        <ul className="mt-2 space-y-1">
                          {t.items.map((i, k) => (
                            <li key={k} className="text-[17px] leading-snug"><b>{i.qty} ×</b> {i.name}
                              {i.optionLabels.length > 0 && <span className="block text-sm text-ink-muted">{i.optionLabels.join(', ')}</span>}
                              {i.instructions && <span className="block text-sm font-semibold text-warning">« {i.instructions} »</span>}
                            </li>
                          ))}
                        </ul>
                        {t.customerNote && <p className="mt-2 rounded-[8px] bg-warning-50 p-2 text-sm font-semibold text-warning">Note : {t.customerNote}</p>}
                        <div className="mt-3 grid gap-2">
                          {t.status === 'PENDING' && (can('orders.accept')
                            ? <button type="button" onClick={() => act(t.id, 'accept')} className="h-12 rounded-[10px] bg-brand font-bold text-white">Accepter</button>
                            : <p className="text-center text-sm text-ink-muted">En attente d’acceptation par le responsable</p>)}
                          {t.status === 'ACCEPTED' && can('orders.prepare') && <button type="button" onClick={() => act(t.id, 'prepare')} className="h-12 rounded-[10px] bg-warning font-bold text-white">Commencer la préparation</button>}
                          {t.status === 'PREPARING' && can('orders.mark_ready') && <button type="button" onClick={() => act(t.id, 'ready')} className="h-12 rounded-[10px] bg-success font-bold text-white">Terminer la préparation</button>}
                          {['ACCEPTED', 'PREPARING'].includes(t.status) && can('kitchen.update') && (delayFor === t.id ? (
                            <div className="grid grid-cols-3 gap-2">
                              {[10, 15, 30].map((n) => <button key={n} type="button" onClick={async () => { await act(t.id, 'delay', { minutes: n }); setDelayFor(null); }} className="h-11 rounded-[10px] bg-black/5 font-semibold">+{n} min</button>)}
                            </div>
                          ) : <button type="button" onClick={() => setDelayFor(t.id)} className="h-11 rounded-[10px] border border-line font-semibold">Signaler un retard</button>)}
                          {col.key === 'ready' && <p className="text-center text-sm text-success">{t.status === 'READY' ? 'Prête — en attente du livreur' : 'Livreur demandé'}</p>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
