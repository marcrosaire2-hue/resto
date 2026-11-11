'use client';
import { useEffect, useRef, useState } from 'react';
import { ISSUE_LABELS, ISSUE_TYPES, type OrderView } from '@plateforme/contracts';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { Button, Card, Chip, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useProRestaurant } from '@/lib/pro';
import { useLive } from '@/lib/realtime';
import { fcfa, useApi } from '@/lib/use-api';

/** Signal sonore court (WebAudio, sans fichier) à l'arrivée d'une commande. */
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.21);
    });
  } catch { /* son indisponible */ }
}

const ACTIONS: Record<string, { label: string; path: string; perm: string; variant?: 'primary' | 'secondary' }[]> = {
  PENDING: [{ label: 'Accepter', path: 'accept', perm: 'orders.accept' }],
  ACCEPTED: [{ label: 'Démarrer la préparation', path: 'prepare', perm: 'orders.prepare' }],
  PREPARING: [{ label: 'Marquer comme prête', path: 'ready', perm: 'orders.mark_ready' }],
  READY: [{ label: 'Demander un livreur', path: 'request-courier', perm: 'orders.request_courier' }],
};

/** Commandes du restaurant en temps réel : accepter, refuser (motif), préparer, prête, demander un livreur. */
export default function RestaurantOrdersPage() {
  const { rid, can } = useProRestaurant();
  const [scope, setScope] = useState<'active' | 'history'>('active');
  const list = useApi<OrderView[]>(`/restaurants/${rid}/orders?scope=${scope}`);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sound, setSound] = useState(false);
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);
  const [issue, setIssue] = useState<{ id: string; type: string; description: string } | null>(null);
  const known = useRef<Set<string> | null>(null);

  useLive({ type: 'restaurant', id: rid }, ['order.created', 'order.updated'], list.reload, 20_000);
  useEffect(() => {
    if (!list.data || scope !== 'active') return;
    const ids = new Set(list.data.map((o) => o.id));
    if (known.current && sound && list.data.some((o) => o.status === 'PENDING' && !known.current!.has(o.id))) beep();
    known.current = ids;
  }, [list.data, scope, sound]);

  async function act(o: OrderView, path: string, body?: object) {
    setBusy(o.id + path);
    setMsg(null);
    try { await api(`/restaurants/${rid}/orders/${o.id}/${path}`, { method: 'POST', body }); list.reload(); }
    catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erreur.' }); list.reload(); }
    finally { setBusy(null); }
  }
  const minutes = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));

  return (
    <>
      <PageTitle title="Commandes" actions={<label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); if (e.target.checked) beep(); }} /> Alerte sonore</label>}>
        Mise à jour en direct. Activez l’alerte sonore pour être prévenu des nouvelles commandes.
      </PageTitle>
      <Notice msg={msg} />
      <div className="mb-4 flex gap-2"><Chip selected={scope === 'active'} onClick={() => setScope('active')}>En cours</Chip><Chip selected={scope === 'history'} onClick={() => setScope('history')}>Historique</Chip></div>
      {list.loading && !list.data ? <div className="grid place-items-center py-10 text-brand"><Spinner /></div> : list.data?.length === 0 ? <p className="text-sm text-ink-muted">{scope === 'active' ? 'Aucune commande en cours.' : 'Aucune commande terminée.'}</p> : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.data?.map((o) => (
            <Card key={o.id} className={`p-4 ${o.status === 'PENDING' ? 'ring-2 ring-brand' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-bold">{o.number}</p><p className="text-xs text-ink-muted">il y a {minutes(o.createdAt)} min · {o.customer?.name}{o.customer?.phone ? ` · ${o.customer.phone}` : ''}</p></div>
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand">{o.statusLabel}</span>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {o.items.map((i, k) => <li key={k}><b>{i.qty} ×</b> {i.name}{i.optionLabels.length > 0 && <span className="text-ink-muted"> — {i.optionLabels.join(', ')}</span>}{i.instructions && <span className="block text-xs text-warning">« {i.instructions} »</span>}</li>)}
              </ul>
              {o.customerNote && <p className="mt-2 rounded-[8px] bg-warning-50 p-2 text-xs">Note : {o.customerNote}</p>}
              <p className="mt-2 text-xs text-ink-muted">{o.address.neighborhood}{o.address.streetLandmark ? ` · ${o.address.streetLandmark}` : ''} · Espèces</p>
              <p className="mt-2 text-sm font-semibold">Total {fcfa(o.total)}{o.restaurantDiscount > 0 && <span className="font-normal text-ink-muted"> (promotion −{fcfa(o.restaurantDiscount)})</span>}</p>
              {o.delayMinutes > 0 && <p className="text-xs text-warning">Retard annoncé : +{o.delayMinutes} min</p>}
              {(o.rejectReason || o.cancelReason) && <p className="mt-1 text-xs text-danger">Motif : {o.rejectReason ?? o.cancelReason}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {(ACTIONS[o.status] ?? []).filter((a) => can(a.perm)).map((a) => (
                  <Button key={a.path} size="sm" loading={busy === o.id + a.path} onClick={() => act(o, a.path)}>{a.label}</Button>
                ))}
                {o.status === 'PENDING' && can('orders.reject') && rejecting?.id !== o.id && (
                  <Button size="sm" variant="outline" onClick={() => setRejecting({ id: o.id, reason: '' })}>Refuser</Button>
                )}
              </div>
              {scope === 'active' && can('orders.report_issue') && issue?.id !== o.id && (
                <button type="button" className="mt-2 text-xs font-semibold text-ink-muted underline" onClick={() => setIssue({ id: o.id, type: 'MISSING_ITEM', description: '' })}>Signaler un problème</button>
              )}
              {issue?.id === o.id && (
                <div className="mt-3 space-y-2 rounded-[10px] bg-warning-50 p-3 text-sm">
                  <select aria-label="Type de problème" value={issue.type} onChange={(e) => setIssue({ ...issue, type: e.target.value })} className="h-10 w-full rounded-[8px] border border-line bg-surface px-2">
                    {ISSUE_TYPES.map((t) => <option key={t} value={t}>{ISSUE_LABELS[t]}</option>)}
                  </select>
                  <input aria-label="Description" placeholder="Décrivez le problème" value={issue.description} onChange={(e) => setIssue({ ...issue, description: e.target.value })} className="h-10 w-full rounded-[8px] border border-line bg-surface px-2" />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={issue.description.trim().length < 3} loading={busy === o.id + 'issues'}
                      onClick={async () => { await act(o, 'issues', { type: issue.type, description: issue.description.trim() }); setIssue(null); setMsg({ tone: 'success', text: 'Problème transmis à l’équipe des opérations.' }); }}>Envoyer</Button>
                    <Button size="sm" variant="ghost" onClick={() => setIssue(null)}>Annuler</Button>
                  </div>
                </div>
              )}
              {rejecting?.id === o.id && (
                <div className="mt-3 space-y-2 rounded-[10px] bg-danger-50 p-3">
                  <label className="block text-sm font-semibold text-danger">Motif du refus (communiqué au client)
                    <input autoFocus value={rejecting.reason} onChange={(e) => setRejecting({ id: o.id, reason: e.target.value })} placeholder="Ex. rupture de stock"
                      className="mt-1 h-10 w-full rounded-[8px] border border-line bg-surface px-2 font-normal text-ink" />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['Rupture de stock', 'Trop de commandes', 'Fermeture imminente'].map((r) => (
                      <button key={r} type="button" onClick={() => setRejecting({ id: o.id, reason: r })} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs">{r}</button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="danger" disabled={rejecting.reason.trim().length < 3} loading={busy === o.id + 'reject'}
                      onClick={async () => { await act(o, 'reject', { reason: rejecting.reason.trim() }); setRejecting(null); }}>Confirmer le refus</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>Annuler</Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
