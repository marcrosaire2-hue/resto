'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { StatusPill } from '@/components/console/form';
import { Card, Chip, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

interface R { _id: string; name: string; slug: string; status: string; statusReason: string | null; phone: string | null; address: string | null; createdAt: string; isDemo?: boolean; publishedAt: string | null }
const FILTERS = [['PENDING_REVIEW', 'En attente'], ['ACTIVE', 'Actifs'], ['SUSPENDED', 'Suspendus'], ['REJECTED', 'Refusés'], ['', 'Tous']] as const;

function RestaurantsAdmin() {
  const params = useSearchParams();
  const { me } = useSession();
  const can = (p: string) => !!me?.platformPermissions.includes(p);
  const [status, setStatus] = useState<string>(params.get('statut') ?? 'PENDING_REVIEW');
  const list = useApi<R[]>(`/admin/restaurants${status ? `?status=${status}` : ''}`);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try { await fn(); list.reload(); setMsg({ tone: 'success', text: ok }); }
    catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erreur.' }); }
  }
  const askReason = (q: string) => { const r = window.prompt(q); return r && r.trim() ? r.trim() : null; };

  return (
    <>
      <PageTitle title="Restaurants">Validez les candidatures avant toute mise en ligne. Chaque décision est tracée dans le journal d’audit.</PageTitle>
      <Notice msg={msg} />
      <div className="mb-4 flex flex-wrap gap-2">{FILTERS.map(([s, l]) => <Chip key={s} selected={status === s} onClick={() => setStatus(s)}>{l}</Chip>)}</div>
      {list.loading ? <div className="grid place-items-center py-10 text-brand"><Spinner /></div> : list.data?.length === 0 ? <p className="text-sm text-ink-muted">Aucun restaurant.</p> : (
        <Card className="divide-y divide-line">
          {list.data?.map((r) => (
            <div key={r._id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{r.name} {r.isDemo && <span className="ml-1 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-bold text-white">DÉMO</span>}</p>
                <p className="text-sm text-ink-muted">{r.phone ?? '—'} · {r.address ?? '—'} · reçu le {new Date(r.createdAt).toLocaleDateString('fr-FR')}</p>
                {r.statusReason && <p className="text-xs text-ink-muted">Motif : {r.statusReason}</p>}
              </div>
              <StatusPill status={r.status} />
              <div className="flex flex-wrap gap-3 text-sm font-semibold">
                {r.status === 'PENDING_REVIEW' && can('admin.restaurants.review') && <>
                  <button type="button" className="text-success" onClick={() => run(() => api(`/admin/restaurants/${r._id}/review`, { method: 'POST', body: { decision: 'approve' } }), `${r.name} validé.`)}>Valider</button>
                  <button type="button" className="text-danger" onClick={() => { const reason = askReason('Motif du refus (communiqué au restaurant) :'); if (reason) void run(() => api(`/admin/restaurants/${r._id}/review`, { method: 'POST', body: { decision: 'reject', reason } }), `${r.name} refusé.`); }}>Refuser</button>
                </>}
                {r.status === 'ACTIVE' && can('admin.restaurants.suspend') && <button type="button" className="text-danger" onClick={() => { const reason = askReason('Motif de la suspension :'); if (reason) void run(() => api(`/admin/restaurants/${r._id}/status`, { method: 'PATCH', body: { status: 'SUSPENDED', reason } }), `${r.name} suspendu.`); }}>Suspendre</button>}
                {r.status === 'SUSPENDED' && can('admin.restaurants.suspend') && <button type="button" className="text-success" onClick={() => run(() => api(`/admin/restaurants/${r._id}/status`, { method: 'PATCH', body: { status: 'ACTIVE' } }), `${r.name} réactivé.`)}>Réactiver</button>}
                {r.status === 'ACTIVE' && r.publishedAt && <a href={`/restaurants/${r.slug}`} target="_blank" className="text-brand">Vitrine ↗</a>}
                {can('commercial.commissions.edit') && <button type="button" className="text-ink" onClick={async () => {
                  const hist = await api<{ commissionRateBps: number }[]>(`/admin/restaurants/${r._id}/contract`).catch(() => []);
                  const cur = hist[0] ? `${hist[0].commissionRateBps / 100} %` : 'aucun';
                  const v = window.prompt(`Taux de commission contractuel en % (actuel : ${cur}). Une nouvelle version sera créée.`);
                  if (v == null || v.trim() === '') return;
                  const pct = Number(v.replace(',', '.'));
                  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return setMsg({ tone: 'danger', text: 'Taux invalide.' });
                  void run(() => api(`/admin/restaurants/${r._id}/contract`, { method: 'PUT', body: { commissionRateBps: Math.round(pct * 100) } }), `Commission de ${r.name} : ${pct} %.`);
                }}>Commission</button>}
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

export default function Page() {
  return <Suspense><RestaurantsAdmin /></Suspense>;
}
