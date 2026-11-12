'use client';
import { useState } from 'react';
import { OrderStatus, STATUS_LABELS_FR } from '@plateforme/contracts';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { date, dateTime, InlinePrompt, inputCls, Table, useRunner } from '@/components/console/kit';
import { Button, Card, Chip, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { fcfa, useApi } from '@/lib/use-api';

interface U { id: string; fullName: string; phone: string; email: string | null; status: string; createdAt: string; isStaff: boolean; orders: number; spent: number }
interface Detail extends Omit<U, 'isStaff' | 'orders' | 'spent'> { orders: { id: string; number: string; status: OrderStatus; total: number; restaurant: string; createdAt: string }[] }

/** Clients : recherche, historique, suspension (révoque immédiatement les sessions). */
export default function AdminCustomersPage() {
  const { me } = useSession();
  const canManage = !!me?.platformPermissions.includes('admin.users.manage');
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [status, setStatus] = useState('');
  const list = useApi<U[]>(`/admin/customers?q=${encodeURIComponent(applied)}&status=${status}`);
  const [open, setOpen] = useState<string | null>(null);
  const detail = useApi<Detail>(open ? `/admin/customers/${open}` : null);
  const [prompt, setPrompt] = useState<{ id: string; to: 'ACTIVE' | 'SUSPENDED' } | null>(null);
  const { msg, run } = useRunner(() => { list.reload(); detail.reload(); });
  return (
    <>
      <PageTitle title="Clients">Recherche par nom, téléphone ou e-mail.</PageTitle>
      <Notice msg={msg} />
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }}>
        <input aria-label="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, téléphone, e-mail" className={`${inputCls} flex-1`} />
        <Button size="sm" type="submit">Rechercher</Button>
      </form>
      <div className="mb-4 flex gap-2">{[['', 'Tous'], ['ACTIVE', 'Actifs'], ['SUSPENDED', 'Suspendus']].map(([k, l]) => <Chip key={k} selected={status === k} onClick={() => setStatus(k)}>{l}</Chip>)}</div>
      {!list.data ? <Spinner /> : (
        <Table head={['Nom', 'Téléphone', 'Inscription', 'Commandes', 'Dépensé (livré)', 'Statut', '']} empty={list.data.length === 0}>
          {list.data.map((u) => (
            <tr key={u.id} className={open === u.id ? 'bg-brand-50/40' : ''}>
              <td className="px-3 py-2">{u.fullName}{u.isStaff && <span className="ml-1 rounded bg-black/5 px-1.5 text-[10px]">salarié</span>}</td>
              <td className="px-3 py-2">{u.phone}</td><td className="px-3 py-2">{date(u.createdAt)}</td>
              <td className="px-3 py-2 tabular-nums">{u.orders}</td><td className="px-3 py-2 tabular-nums">{fcfa(u.spent)}</td>
              <td className="px-3 py-2">{u.status === 'SUSPENDED' ? <span className="text-danger">Suspendu</span> : 'Actif'}</td>
              <td className="px-3 py-2"><button type="button" className="text-brand" onClick={() => setOpen(open === u.id ? null : u.id)}>{open === u.id ? 'Fermer' : 'Détails'}</button></td>
            </tr>
          ))}
        </Table>
      )}
      {open && detail.data && (
        <Card className="mt-4 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">{detail.data.fullName} · {detail.data.phone}{detail.data.email ? ` · ${detail.data.email}` : ''}</p>
            {canManage && (detail.data.status === 'ACTIVE'
              ? <Button size="sm" variant="danger" onClick={() => setPrompt({ id: detail.data!.id, to: 'SUSPENDED' })}>Suspendre</Button>
              : <Button size="sm" onClick={() => setPrompt({ id: detail.data!.id, to: 'ACTIVE' })}>Réactiver</Button>)}
          </div>
          {prompt && <InlinePrompt label="Motif (tracé dans le journal)" danger={prompt.to === 'SUSPENDED'} onCancel={() => setPrompt(null)}
            onSubmit={(v) => run(() => api(`/admin/customers/${prompt.id}/status`, { method: 'POST', body: { status: prompt.to, reason: v } }), prompt.to === 'SUSPENDED' ? 'Compte suspendu ; ses sessions sont fermées.' : 'Compte réactivé.').then(() => setPrompt(null))} />}
          <p className="mb-2 mt-4 font-semibold">Commandes récentes</p>
          {detail.data.orders.length === 0 ? <p className="text-ink-muted">Aucune commande.</p> : detail.data.orders.map((o) => (
            <div key={o.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-1.5 last:border-0"><span>{o.number} · {o.restaurant} · {STATUS_LABELS_FR[o.status] ?? o.status}</span><span className="text-ink-muted">{fcfa(o.total)} · {dateTime(o.createdAt)}</span></div>
          ))}
        </Card>
      )}
    </>
  );
}
