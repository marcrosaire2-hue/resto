'use client';
import { useState } from 'react';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { dateTime, InlinePrompt, useRunner } from '@/components/console/kit';
import { Button, Card, Chip, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';

interface R { id: string; rating: number; comment: string; authorName: string; createdAt: string; reply: string | null; status: 'VISIBLE' | 'HIDDEN'; moderationReason: string | null; restaurantName: string }

/** Modération des avis : un avis masqué l'est avec un motif tracé ; la note du restaurant est recalculée. */
export default function ReviewsModerationPage() {
  const [status, setStatus] = useState<'' | 'VISIBLE' | 'HIDDEN'>('');
  const list = useApi<R[]>(`/admin/reviews${status ? `?status=${status}` : ''}`);
  const { msg, run } = useRunner(list.reload);
  const [hiding, setHiding] = useState<string | null>(null);
  return (
    <>
      <PageTitle title="Avis clients">Seuls les clients dont la commande a été livrée peuvent laisser un avis.</PageTitle>
      <Notice msg={msg} />
      <div className="mb-4 flex gap-2">{([['', 'Tous'], ['VISIBLE', 'Visibles'], ['HIDDEN', 'Masqués']] as const).map(([k, l]) => <Chip key={k} selected={status === k} onClick={() => setStatus(k)}>{l}</Chip>)}</div>
      {!list.data ? <Spinner /> : list.data.length === 0 ? <p className="text-sm text-ink-muted">Aucun avis.</p> : (
        <div className="space-y-3">
          {list.data.map((r) => (
            <Card key={r.id} className={`p-4 text-sm ${r.status === 'HIDDEN' ? 'opacity-70' : ''}`}>
              <div className="flex flex-wrap justify-between gap-2"><p><span className="text-warning">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span> <b>{r.restaurantName}</b> · {r.authorName}</p><span className="text-ink-muted">{dateTime(r.createdAt)}</span></div>
              {r.comment && <p className="mt-1">{r.comment}</p>}
              {r.reply && <p className="mt-2 rounded-[8px] bg-brand-50 p-2"><b>Réponse :</b> {r.reply}</p>}
              {r.status === 'HIDDEN' && <p className="mt-1 text-xs text-danger">Masqué — {r.moderationReason}</p>}
              <div className="mt-2">
                {r.status === 'VISIBLE'
                  ? <Button size="sm" variant="outline" onClick={() => setHiding(r.id)}>Masquer</Button>
                  : <Button size="sm" onClick={() => run(() => api(`/admin/reviews/${r.id}/moderate`, { method: 'POST', body: { status: 'VISIBLE' } }), 'Avis rétabli.')}>Rétablir</Button>}
              </div>
              {hiding === r.id && <InlinePrompt label="Motif du masquage" danger onCancel={() => setHiding(null)} onSubmit={(v) => run(() => api(`/admin/reviews/${r.id}/moderate`, { method: 'POST', body: { status: 'HIDDEN', reason: v } }), 'Avis masqué.').then(() => setHiding(null))} />}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
