'use client';
import { useState } from 'react';
import { COURIER_DOC_LABELS, VEHICLE_LABELS } from '@plateforme/contracts';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { StatusPill } from '@/components/console/form';
import { Button, Card, Chip, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fcfa, useApi } from '@/lib/use-api';

interface C { id: string; fullName: string; phone: string | null; status: string; statusReason: string | null; vehicleType: string; plate: string | null; payout: { provider: string; number: string }; isOnline: boolean; createdAt: string; cashHeld: number; documents: { type: string; status: string }[] }

/** Dossiers des livreurs : documents privés (lien signé temporaire), validation, refus motivé, suspension. */
export default function AdminCouriersPage() {
  const [status, setStatus] = useState('PENDING_REVIEW');
  const list = useApi<C[]>(`/admin/couriers?status=${status}`);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [reason, setReason] = useState<{ id: string; decision: 'reject' | 'suspend'; text: string } | null>(null);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try { await fn(); setMsg({ tone: 'success', text: ok }); setReason(null); }
    catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erreur.' }); }
    finally { list.reload(); }
  }
  async function openDoc(id: string, index: number) {
    try { const r = await api<{ url: string }>(`/admin/couriers/${id}/documents/${index}`); window.open(r.url, '_blank', 'noopener'); }
    catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Document indisponible.' }); }
  }
  const pill = (s: string) => (s === 'ACTIVE' ? 'ACTIVE' : s === 'PENDING_REVIEW' ? 'PENDING_REVIEW' : s);

  return (
    <>
      <PageTitle title="Livreurs">Les documents sont privés : chaque consultation génère un lien temporaire et est tracée.</PageTitle>
      <Notice msg={msg} />
      <div className="mb-4 flex flex-wrap gap-2">{[['PENDING_REVIEW', 'À valider'], ['ACTIVE', 'Actifs'], ['SUSPENDED', 'Suspendus'], ['REJECTED', 'Refusés']].map(([k, l]) => <Chip key={k} selected={status === k} onClick={() => setStatus(k)}>{l}</Chip>)}</div>
      {list.loading ? <Spinner /> : list.data?.length === 0 ? <p className="text-sm text-ink-muted">Aucun dossier.</p> : (
        <div className="space-y-3">
          {list.data?.map((c) => (
            <Card key={c.id} className="p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p><b>{c.fullName}</b> · {c.phone} · {VEHICLE_LABELS[c.vehicleType as keyof typeof VEHICLE_LABELS] ?? c.vehicleType}{c.plate ? ` (${c.plate})` : ''}</p>
                <StatusPill status={pill(c.status)} />
              </div>
              <p className="text-xs text-ink-muted">Versements : {c.payout.provider === 'MTN_MOMO' ? 'MTN MoMo' : 'Moov Money'} {c.payout.number} · inscrit le {new Date(c.createdAt).toLocaleDateString('fr-FR')}{c.status === 'ACTIVE' ? ` · espèces en main ${fcfa(c.cashHeld)}` : ''}</p>
              {c.statusReason && <p className="text-xs text-danger">Motif : {c.statusReason}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {c.documents.map((d, i) => <button key={i} type="button" onClick={() => openDoc(c.id, i)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold">📄 {COURIER_DOC_LABELS[d.type as keyof typeof COURIER_DOC_LABELS] ?? d.type}</button>)}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {c.status === 'PENDING_REVIEW' && <><Button size="sm" onClick={() => run(() => api(`/admin/couriers/${c.id}/review`, { method: 'POST', body: { decision: 'approve' } }), `${c.fullName} validé.`)}>Valider</Button>
                  <Button size="sm" variant="outline" onClick={() => setReason({ id: c.id, decision: 'reject', text: '' })}>Refuser</Button></>}
                {c.status === 'ACTIVE' && <Button size="sm" variant="outline" onClick={() => setReason({ id: c.id, decision: 'suspend', text: '' })}>Suspendre</Button>}
                {c.status === 'SUSPENDED' && <Button size="sm" onClick={() => run(() => api(`/admin/couriers/${c.id}/review`, { method: 'POST', body: { decision: 'reactivate' } }), `${c.fullName} réactivé.`)}>Réactiver</Button>}
              </div>
              {reason?.id === c.id && (
                <div className="mt-2 flex gap-2">
                  <input autoFocus value={reason.text} onChange={(e) => setReason({ ...reason, text: e.target.value })} placeholder="Motif (communiqué au livreur)" aria-label="Motif" className="h-9 flex-1 rounded-[8px] border border-line px-2" />
                  <Button size="sm" variant="danger" disabled={reason.text.trim().length < 3} onClick={() => run(() => api(`/admin/couriers/${c.id}/review`, { method: 'POST', body: { decision: reason.decision, reason: reason.text } }), 'Décision enregistrée.')}>Confirmer</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
