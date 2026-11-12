'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { TICKET_STATUS_LABELS } from '@plateforme/contracts';
import { PlainHeader } from '@/components/client/plain-header';
import { LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

interface T { id: string; subject: string; orderId: string | null; status: keyof typeof TICKET_STATUS_LABELS; updatedAt: string; messages: { staff: boolean; body: string; at: string }[] }
const when = (d: string) => new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function HelpPage() {
  return <Suspense fallback={<MobileScreen className="bg-surface"><LoadingBlock /></MobileScreen>}><Help /></Suspense>;
}

/** Assistance client : ouvrir une demande (liée ou non à une commande) et suivre les réponses. */
function Help() {
  const router = useRouter();
  const search = useSearchParams();
  const orderId = search.get('commande');
  const { me, loading } = useSession();
  const list = useApi<T[]>(me ? '/support/tickets' : null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(!!orderId);
  const [subject, setSubject] = useState(orderId ? 'Problème avec ma commande' : '');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!loading && !me) router.replace(`/connexion?suite=${encodeURIComponent(`/aide${orderId ? `?commande=${orderId}` : ''}`)}`); }, [loading, me, router, orderId]);
  if (!me || !list.data) return <MobileScreen className="bg-surface"><LoadingBlock /></MobileScreen>;

  async function create() {
    setErr(null);
    try {
      const r = await api<{ id: string }>('/support/tickets', { method: 'POST', body: { subject, message, ...(orderId ? { orderId } : {}) } });
      setCreating(false); setMessage(''); setOpen(r.id); list.reload();
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Demande non envoyée.'); }
  }
  async function send(id: string) {
    setErr(null);
    try { await api(`/support/tickets/${id}/messages`, { method: 'POST', body: { body: reply } }); setReply(''); list.reload(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Message non envoyé.'); }
  }

  return (
    <MobileScreen className="bg-surface">
      <PlainHeader title="Aide" backHref="/compte" />
      <main className="flex-1 space-y-4 px-4 pb-8">
        {err && <p role="alert" className="rounded-[8px] bg-danger-50 p-3 text-sm text-danger">{err}</p>}
        {creating ? (
          <section className="space-y-3 rounded-[8px] border border-brand p-3 text-sm">
            <p className="font-semibold">Nouvelle demande{orderId ? ' concernant votre commande' : ''}</p>
            <label className="block">Objet<input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} className="mt-1 h-11 w-full rounded-[8px] border border-line px-3" /></label>
            <label className="block">Votre message<textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={4} className="mt-1 w-full rounded-[8px] border border-line p-2" placeholder="Décrivez ce qui s’est passé" /></label>
            <div className="flex gap-2">
              <button type="button" disabled={subject.trim().length < 3 || message.trim().length < 3} onClick={create} className="h-11 flex-1 rounded-[8px] bg-brand font-semibold text-white disabled:opacity-50">Envoyer</button>
              <button type="button" onClick={() => setCreating(false)} className="h-11 rounded-[8px] px-4 text-ink-muted">Annuler</button>
            </div>
          </section>
        ) : <button type="button" onClick={() => setCreating(true)} className="h-12 w-full rounded-[8px] bg-brand font-semibold text-white">Nouvelle demande</button>}

        <section>
          <p className="mb-2 font-semibold">Mes demandes</p>
          {list.data.length === 0 ? <p className="py-6 text-center text-sm text-ink-muted">Vous n’avez encore aucune demande.</p> : list.data.map((t) => (
            <div key={t.id} className="mb-2 rounded-[8px] border border-line p-3 text-sm">
              <button type="button" className="flex w-full justify-between gap-2 text-left" onClick={() => { setOpen(open === t.id ? null : t.id); setReply(''); }}>
                <span className="font-semibold">{t.subject}</span>
                <span className={`shrink-0 text-xs ${t.status === 'PENDING_CUSTOMER' ? 'text-brand' : 'text-ink-muted'}`}>{TICKET_STATUS_LABELS[t.status]}</span>
              </button>
              {open === t.id && (
                <div className="mt-3 space-y-2">
                  {t.messages.map((m, i) => (
                    <div key={i} className={`max-w-[85%] rounded-[10px] p-2 ${m.staff ? 'bg-brand-50' : 'ml-auto bg-black/5'}`}><p>{m.body}</p><p className="mt-1 text-[11px] text-ink-muted">{m.staff ? 'Assistance' : 'Vous'} · {when(m.at)}</p></div>
                  ))}
                  {t.status === 'CLOSED' ? <p className="text-xs text-ink-muted">Demande clôturée.</p> : (
                    <div className="flex gap-2">
                      <input aria-label="Votre réponse" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} placeholder="Votre réponse" className="h-11 min-w-0 flex-1 rounded-[8px] border border-line px-3" />
                      <button type="button" disabled={!reply.trim()} onClick={() => send(t.id)} className="h-11 rounded-[8px] bg-brand px-4 font-semibold text-white disabled:opacity-50">Envoyer</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>
      </main>
    </MobileScreen>
  );
}
