'use client';
import { useState } from 'react';
import { PublicReview } from '@plateforme/contracts';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { dateTime, useRunner } from '@/components/console/kit';
import { Button, Card, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useProRestaurant } from '@/lib/pro';
import { useApi } from '@/lib/use-api';

/** Avis des clients (commandes livrées uniquement) et réponses publiques du restaurant. */
export default function ProReviewsPage() {
  const { rid } = useProRestaurant();
  const list = useApi<(PublicReview & { status: string })[]>(`/restaurants/${rid}/reviews`);
  const { msg, run } = useRunner(list.reload);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const visible = list.data?.filter((r) => r.status === 'VISIBLE') ?? [];
  const avg = visible.length ? Math.round((visible.reduce((s, r) => s + r.rating, 0) / visible.length) * 10) / 10 : null;
  return (
    <>
      <PageTitle title="Avis clients">{avg != null ? `Note moyenne ${avg} / 5 sur ${visible.length} avis visibles.` : 'Aucun avis pour le moment.'} Votre réponse est publique.</PageTitle>
      <Notice msg={msg} />
      {!list.data ? <Spinner /> : list.data.length === 0 ? <p className="text-sm text-ink-muted">Les avis apparaîtront après vos premières livraisons.</p> : (
        <div className="space-y-3">
          {list.data.map((r) => (
            <Card key={r.id} className="p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2"><p><span className="text-warning">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span> {r.authorName}{r.status === 'HIDDEN' && <span className="ml-2 text-xs text-danger">masqué par la modération</span>}</p><span className="text-ink-muted">{dateTime(r.createdAt)}</span></div>
              {r.comment && <p className="mt-1">{r.comment}</p>}
              {r.reply && editing?.id !== r.id && <p className="mt-2 rounded-[8px] bg-brand-50 p-2"><b>Votre réponse :</b> {r.reply}</p>}
              {editing?.id === r.id ? (
                <div className="mt-2 space-y-2">
                  <textarea aria-label="Réponse" autoFocus rows={3} maxLength={1000} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} className="w-full rounded-[10px] border border-line p-2" />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={editing.text.trim().length < 2} onClick={() => run(() => api(`/restaurants/${rid}/reviews/${r.id}/reply`, { method: 'POST', body: { reply: editing.text } }), 'Réponse publiée.').then((ok) => ok && setEditing(null))}>Publier</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
                  </div>
                </div>
              ) : <button type="button" className="mt-2 text-sm font-semibold text-brand" onClick={() => setEditing({ id: r.id, text: r.reply ?? '' })}>{r.reply ? 'Modifier la réponse' : 'Répondre'}</button>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
