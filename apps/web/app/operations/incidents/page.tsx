'use client';
import { useState } from 'react';
import { INCIDENT_LABELS, INCIDENT_STATUS_LABELS, INCIDENT_TYPES } from '@plateforme/contracts';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { Button, Card, Chip, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useLive } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

interface Inc { id: string; type: string; typeLabel: string; description: string; status: keyof typeof INCIDENT_STATUS_LABELS; ownerId: string | null; resolution: string | null; source: string; createdAt: string; events: { at: string; action: string; note: string }[] }

/** Incidents : prise en charge, notes, résolution obligatoire, historique horodaté. */
export default function IncidentsPage() {
  const { me } = useSession();
  const canManage = !!me?.platformPermissions.includes('ops.incidents.manage');
  const [filter, setFilter] = useState<'open' | 'RESOLVED' | 'CLOSED'>('open');
  const list = useApi<Inc[]>(`/ops/incidents?status=${filter}`);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [edit, setEdit] = useState<{ id: string; note: string; resolution: string } | null>(null);
  const [create, setCreate] = useState<{ type: string; description: string } | null>(null);
  useLive({ type: 'ops', id: 'ops' }, ['incident.updated'], list.reload, 30_000);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try { await fn(); setMsg({ tone: 'success', text: ok }); }
    catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erreur.' }); }
    finally { list.reload(); }
  }

  return (
    <>
      <PageTitle title="Incidents" actions={canManage && !create ? <Button size="sm" onClick={() => setCreate({ type: 'OTHER', description: '' })}>+ Nouvel incident</Button> : undefined} />
      <Notice msg={msg} />
      {create && (
        <Card className="mb-4 flex flex-wrap gap-2 p-4">
          <select aria-label="Type" value={create.type} onChange={(e) => setCreate({ ...create, type: e.target.value })} className="h-10 rounded-[8px] border border-line px-2 text-sm">
            {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{INCIDENT_LABELS[t]}</option>)}
          </select>
          <input aria-label="Description" placeholder="Description" value={create.description} onChange={(e) => setCreate({ ...create, description: e.target.value })} className="h-10 flex-1 rounded-[8px] border border-line px-2 text-sm" />
          <Button size="sm" disabled={create.description.trim().length < 3} onClick={() => run(async () => { await api('/ops/incidents', { method: 'POST', body: create }); setCreate(null); }, 'Incident ouvert.')}>Ouvrir</Button>
          <Button size="sm" variant="ghost" onClick={() => setCreate(null)}>Annuler</Button>
        </Card>
      )}
      <div className="mb-4 flex gap-2">{([['open', 'Ouverts'], ['RESOLVED', 'Résolus'], ['CLOSED', 'Clôturés']] as const).map(([k, l]) => <Chip key={k} selected={filter === k} onClick={() => setFilter(k)}>{l}</Chip>)}</div>
      {list.loading && !list.data ? <Spinner /> : list.data?.length === 0 ? <p className="text-sm text-ink-muted">Aucun incident.</p> : (
        <div className="space-y-3">
          {list.data?.map((i) => (
            <Card key={i.id} className="p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p><b>{i.typeLabel}</b> · {i.description}</p>
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand">{INCIDENT_STATUS_LABELS[i.status]}</span>
              </div>
              <p className="text-xs text-ink-muted">Source : {i.source} · {new Date(i.createdAt).toLocaleString('fr-FR')}{i.ownerId ? (i.ownerId === me?.id ? ' · pris en charge par vous' : ' · pris en charge') : ' · non attribué'}</p>
              <details className="mt-2"><summary className="cursor-pointer text-xs text-ink-muted">Historique ({i.events.length})</summary>
                <ul className="mt-1 space-y-0.5 text-xs">{i.events.map((e, k) => <li key={k}>{new Date(e.at).toLocaleString('fr-FR')} — {e.action}{e.note ? ` : ${e.note}` : ''}</li>)}</ul>
              </details>
              {i.resolution && <p className="mt-1 text-xs text-success">Résolution : {i.resolution}</p>}
              {canManage && i.status !== 'CLOSED' && (edit?.id === i.id ? (
                <div className="mt-2 space-y-2">
                  <input value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="Note interne" aria-label="Note" className="h-9 w-full rounded-[8px] border border-line px-2" />
                  <input value={edit.resolution} onChange={(e) => setEdit({ ...edit, resolution: e.target.value })} placeholder="Résolution (obligatoire pour clore)" aria-label="Résolution" className="h-9 w-full rounded-[8px] border border-line px-2" />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" disabled={!edit.note.trim()} onClick={() => run(async () => { await api(`/ops/incidents/${i.id}`, { method: 'PATCH', body: { note: edit.note } }); setEdit(null); }, 'Note ajoutée.')}>Ajouter la note</Button>
                    <Button size="sm" disabled={!edit.resolution.trim()} onClick={() => run(async () => { await api(`/ops/incidents/${i.id}`, { method: 'PATCH', body: { status: 'RESOLVED', resolution: edit.resolution, note: edit.note || undefined } }); setEdit(null); }, 'Incident résolu.')}>Marquer résolu</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Fermer</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-3 text-xs font-semibold">
                  {!i.ownerId && <button type="button" className="text-brand" onClick={() => run(() => api(`/ops/incidents/${i.id}`, { method: 'PATCH', body: { assignToMe: true } }), 'Incident pris en charge.')}>Prendre en charge</button>}
                  <button type="button" className="text-ink" onClick={() => setEdit({ id: i.id, note: '', resolution: i.resolution ?? '' })}>Traiter</button>
                  {i.status === 'RESOLVED' && <button type="button" className="text-ink-muted" onClick={() => run(() => api(`/ops/incidents/${i.id}`, { method: 'PATCH', body: { status: 'CLOSED', resolution: i.resolution ?? 'Clôturé' } }), 'Incident clôturé.')}>Clôturer</button>}
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
