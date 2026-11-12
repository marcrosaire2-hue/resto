'use client';
import { useState } from 'react';
import { TICKET_STATUS_LABELS } from '@plateforme/contracts';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { dateTime, useRunner } from '@/components/console/kit';
import { Button, Card, Chip, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';

interface T { id: string; subject: string; orderId: string | null; status: keyof typeof TICKET_STATUS_LABELS; updatedAt: string; assigneeId?: string; customer: { name: string; phone: string | null }; messages: { staff: boolean; body: string; at: string }[] }
const STAFF_LABELS: Record<string, string> = { ...TICKET_STATUS_LABELS, PENDING_CUSTOMER: 'En attente du client' };

/** Tickets d'assistance : réponse, prise en charge, résolution. */
export default function SupportTicketsPage() {
  const [status, setStatus] = useState('open');
  const list = useApi<T[]>(`/admin/tickets?status=${status}`);
  const [open, setOpen] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const { msg, run } = useRunner(list.reload);
  return (
    <>
      <PageTitle title="Assistance">Demandes des clients et des partenaires.</PageTitle>
      <Notice msg={msg} />
      <div className="mb-4 flex flex-wrap gap-2">{[['open', 'À traiter'], ['RESOLVED', 'Résolus'], ['CLOSED', 'Clôturés'], ['', 'Tous']].map(([k, l]) => <Chip key={k} selected={status === k} onClick={() => setStatus(k)}>{l}</Chip>)}</div>
      {!list.data ? <Spinner /> : list.data.length === 0 ? <p className="text-sm text-ink-muted">Aucune demande.</p> : (
        <div className="space-y-3">
          {list.data.map((t) => (
            <Card key={t.id} className="p-4 text-sm">
              <button type="button" className="flex w-full flex-wrap justify-between gap-2 text-left" onClick={() => { setOpen(open === t.id ? null : t.id); setReply(''); }}>
                <span><b>{t.subject}</b> · {t.customer.name} {t.customer.phone && <span className="text-ink-muted">({t.customer.phone})</span>}</span>
                <span className="text-ink-muted">{STAFF_LABELS[t.status]} · {dateTime(t.updatedAt)}</span>
              </button>
              {open === t.id && (
                <div className="mt-3 space-y-2">
                  {t.orderId && <p className="text-xs text-ink-muted">Commande liée : <span className="font-mono">{t.orderId}</span></p>}
                  {t.messages.map((m, i) => (
                    <div key={i} className={`max-w-[85%] rounded-[10px] p-2 ${m.staff ? 'ml-auto bg-brand-50' : 'bg-black/5'}`}><p>{m.body}</p><p className="mt-1 text-[11px] text-ink-muted">{m.staff ? 'Assistance' : t.customer.name} · {dateTime(m.at)}</p></div>
                  ))}
                  {t.status !== 'CLOSED' && (
                    <>
                      <textarea aria-label="Réponse" value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={2000} placeholder="Votre réponse au client" className="w-full rounded-[10px] border border-line p-2" />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={!reply.trim()} onClick={() => run(() => api(`/admin/tickets/${t.id}/messages`, { method: 'POST', body: { body: reply } }), 'Réponse envoyée ; le client est prévenu.').then((ok) => ok && setReply(''))}>Répondre</Button>
                        {!t.assigneeId && <Button size="sm" variant="outline" onClick={() => run(() => api(`/admin/tickets/${t.id}`, { method: 'PATCH', body: { assignToMe: true } }), 'Demande prise en charge.')}>Prendre en charge</Button>}
                        {t.status !== 'RESOLVED' && <Button size="sm" variant="outline" onClick={() => run(() => api(`/admin/tickets/${t.id}`, { method: 'PATCH', body: { status: 'RESOLVED' } }), 'Marquée comme résolue.')}>Résolue</Button>}
                        <Button size="sm" variant="ghost" onClick={() => run(() => api(`/admin/tickets/${t.id}`, { method: 'PATCH', body: { status: 'CLOSED' } }), 'Demande clôturée.')}>Clôturer</Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
