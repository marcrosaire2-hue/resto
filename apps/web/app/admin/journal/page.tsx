'use client';
import { useState } from 'react';
import { PageTitle } from '@/components/console/console-shell';
import { dateTime, inputCls } from '@/components/console/kit';
import { Button, Card, Spinner } from '@/components/ui';
import { useApi } from '@/lib/use-api';

interface A { _id: string; actorUserId: string | null; scope: string; restaurantId: string | null; action: string; entity: string; entityId: string | null; before: unknown; after: unknown; ip: string | null; createdAt: string }

/** Journal d'audit en lecture seule (la base interdit toute modification). */
export default function AuditPage() {
  const [action, setAction] = useState('');
  const [applied, setApplied] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = useApi<A[]>(`/admin/audit?limit=300${applied ? `&action=${encodeURIComponent(applied)}` : ''}`);
  return (
    <>
      <PageTitle title="Journal d’audit">Actions sensibles : qui, quoi, quand, depuis quelle adresse. Lecture seule.</PageTitle>
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(action.trim()); }}>
        <input aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Filtrer par action exacte (ex. user.suspend)" className={`${inputCls} flex-1`} />
        <Button size="sm" type="submit">Filtrer</Button>
      </form>
      {!list.data ? <Spinner /> : list.data.length === 0 ? <p className="text-sm text-ink-muted">Aucune entrée.</p> : (
        <div className="space-y-2">
          {list.data.map((a) => (
            <Card key={a._id} className="p-3 text-xs">
              <button type="button" className="flex w-full flex-wrap justify-between gap-2 text-left text-sm" onClick={() => setOpen(open === a._id ? null : a._id)}>
                <span><b className="font-mono">{a.action}</b> · {a.entity}{a.entityId ? ` ${a.entityId.slice(-8)}` : ''} <span className="text-ink-muted">({a.scope})</span></span>
                <span className="text-ink-muted">{dateTime(a.createdAt)}</span>
              </button>
              {open === a._id && (
                <div className="mt-2 space-y-1 text-ink-muted">
                  <p>Auteur : <span className="font-mono">{a.actorUserId ?? 'système'}</span>{a.ip ? ` · IP ${a.ip}` : ''}</p>
                  {a.before != null && <pre className="overflow-x-auto rounded bg-black/5 p-2">avant : {JSON.stringify(a.before, null, 1)}</pre>}
                  {a.after != null && <pre className="overflow-x-auto rounded bg-black/5 p-2">après : {JSON.stringify(a.after, null, 1)}</pre>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
