'use client';
import { useState } from 'react';
import { Notice, PageTitle } from '@/components/console/console-shell';
import { date, dateTime, InlinePrompt, inputCls, Stat, Table, Tabs, toInputDate, useRunner } from '@/components/console/kit';
import { Button, Card, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { fcfa, useApi } from '@/lib/use-api';

interface Overview { revenue: { commission: number; delivery: number; service: number }; expenses: { promotions: number; refunds: number; deliverySubsidy: number }; owedToRestaurants: number; owedToCouriers: number; cashHeldByCouriers: number; pendingPayouts: number; pendingRefunds: number }
interface Balances { restaurants: { id: string; name: string; earned: number; paid: number; balance: number; pendingPayouts: number }[]; couriers: { id: string; name: string; earned: number; paid: number; balance: number; cashHeld: number; pendingPayouts: number }[] }
interface Payout { id: string; beneficiaryType: 'RESTAURANT' | 'COURIER'; beneficiaryId: string; amount: number; method: string; status: string; reference: string | null; note: string; requestedBy: string; approvedBy: string | null; paidAt: string | null; rejectReason: string | null; createdAt: string }
interface Refund { id: string; orderId: string; orderNumber: string; restaurantName: string; amount: number; reason: string; borneBy: string; status: string; approvals: number; requiredApprovals: number; requestedBy: string; method: string | null; reference: string | null; rejectReason: string | null; createdAt: string }
interface Remit { id: string; courierId: string; amount: number; receiptNumber: string; note: string; createdAt: string }
interface Tx { id: string; type: string; reference: string; description: string | null; createdAt: string; entries: { account: string; debit: number; credit: number }[] }

type Tab = 'overview' | 'balances' | 'payouts' | 'cash' | 'refunds' | 'ledger';
const METHODS: [string, string][] = [['MTN_MOMO', 'MTN MoMo'], ['MOOV_MONEY', 'Moov Money'], ['BANK_TRANSFER', 'Virement'], ['CASH', 'Espèces']];
const methodLabel = (m: string | null) => METHODS.find(([k]) => k === m)?.[1] ?? m ?? '—';
const PAYOUT_STATUS: Record<string, string> = { PENDING_APPROVAL: 'À approuver', APPROVED: 'Approuvé, à exécuter', PAID: 'Payé', REJECTED: 'Rejeté', CANCELLED: 'Annulé' };
const REFUND_STATUS: Record<string, string> = { REQUESTED: 'Demandé', APPROVED: 'Approuvé, à payer', PAID: 'Payé', REJECTED: 'Rejeté' };

/** Finances de la plateforme : grand livre, soldes, versements (double validation), espèces, remboursements, exports. */
export default function AdminFinancesPage() {
  const { me } = useSession();
  const can = (p: string) => !!me?.platformPermissions.includes(p);
  const [tab, setTab] = useState<Tab>('overview');
  const items: [Tab, string][] = [['overview', 'Vue d’ensemble'], ['balances', 'Soldes'], ['payouts', 'Versements'], ['cash', 'Espèces des livreurs'], ['refunds', 'Remboursements'], ['ledger', 'Écritures']];
  return (
    <>
      <PageTitle title="Finances">Toutes les valeurs proviennent du grand livre (écritures immuables).</PageTitle>
      <Tabs value={tab} onChange={setTab} items={items.filter(([k]) => k !== 'refunds' || can('finance.refunds.approve')).filter(([k]) => k !== 'cash' || can('finance.courier_cash.reconcile'))} />
      {tab === 'overview' && <OverviewTab canExport={can('finance.reports.export')} />}
      {tab === 'balances' && <BalancesTab canPay={can('finance.payouts.execute')} />}
      {tab === 'payouts' && <PayoutsTab userId={me?.id ?? ''} canPay={can('finance.payouts.execute')} />}
      {tab === 'cash' && <CashTab />}
      {tab === 'refunds' && <RefundsTab userId={me?.id ?? ''} />}
      {tab === 'ledger' && <LedgerTab />}
    </>
  );
}

function OverviewTab({ canExport }: { canExport: boolean }) {
  const o = useApi<Overview>('/finance/overview');
  const now = new Date();
  const [from, setFrom] = useState(toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toInputDate(now));
  if (!o.data) return <Spinner />;
  const x = o.data;
  const q = `from=${from}&to=${to}`;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Commissions encaissées" value={fcfa(x.revenue.commission)} />
        <Stat label="Marge sur livraisons" value={fcfa(x.revenue.delivery)} hint={x.expenses.deliverySubsidy ? `Livraisons subventionnées : ${fcfa(x.expenses.deliverySubsidy)}` : undefined} />
        <Stat label="Frais de service" value={fcfa(x.revenue.service)} />
        <Stat label="Dû aux restaurants" value={fcfa(x.owedToRestaurants)} />
        <Stat label="Dû aux livreurs" value={fcfa(x.owedToCouriers)} />
        <Stat label="Espèces détenues par les livreurs" value={fcfa(x.cashHeldByCouriers)} />
        <Stat label="Codes promo financés" value={fcfa(x.expenses.promotions)} />
        <Stat label="Remboursements à la charge de la plateforme" value={fcfa(x.expenses.refunds)} />
        <Stat label="En attente" value={`${x.pendingPayouts} versement(s) · ${x.pendingRefunds} remboursement(s)`} />
      </div>
      {canExport && (
        <Card className="p-5">
          <p className="font-bold">Rapport financier</p>
          <p className="text-sm text-ink-muted">Commandes livrées par restaurant sur la période (heure du Bénin).</p>
          <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1">Du<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></label>
            <label className="flex flex-col gap-1">Au<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></label>
            <a href={`/api/finance/reports?${q}&format=xlsx`} className="inline-flex h-10 items-center rounded-[10px] bg-brand px-4 font-semibold text-white">Excel</a>
            <a href={`/api/finance/reports?${q}&format=pdf`} className="inline-flex h-10 items-center rounded-[10px] border border-brand px-4 font-semibold text-brand">PDF</a>
          </div>
        </Card>
      )}
    </div>
  );
}

function BalancesTab({ canPay }: { canPay: boolean }) {
  const b = useApi<Balances>('/finance/balances');
  const { msg, run } = useRunner(b.reload);
  const [form, setForm] = useState<{ type: 'RESTAURANT' | 'COURIER'; id: string; name: string; max: number; amount: string; method: string } | null>(null);
  if (!b.data) return <Spinner />;
  const ask = (type: 'RESTAURANT' | 'COURIER', id: string, name: string, max: number) => setForm({ type, id, name, max, amount: String(max), method: 'MTN_MOMO' });
  return (
    <div className="space-y-5">
      <Notice msg={msg} />
      {form && (
        <Card className="p-4 text-sm">
          <p className="font-bold">Préparer un versement — {form.name}</p>
          <p className="text-ink-muted">Disponible : {fcfa(form.max)}. Un second agent devra l’approuver avant l’exécution.</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">Montant (FCFA)<input inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, '') })} className={inputCls} /></label>
            <label className="flex flex-col gap-1">Moyen<select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={inputCls}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <Button size="sm" disabled={!Number(form.amount)} onClick={async () => { if (await run(() => api('/finance/payouts', { method: 'POST', body: { beneficiaryType: form.type, beneficiaryId: form.id, amount: Number(form.amount), method: form.method } }), 'Versement préparé : en attente d’approbation.')) setForm(null); }}>Préparer</Button>
            <button type="button" className="h-10 px-2 text-ink-muted" onClick={() => setForm(null)}>Annuler</button>
          </div>
        </Card>
      )}
      <section>
        <p className="mb-2 font-bold">Restaurants</p>
        <Table head={['Restaurant', 'Gagné', 'Versé', 'Solde', 'Réservé', '']} empty={b.data.restaurants.length === 0}>
          {b.data.restaurants.map((r) => (
            <tr key={r.id}><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2 tabular-nums">{fcfa(r.earned)}</td><td className="px-3 py-2 tabular-nums">{fcfa(r.paid)}</td><td className="px-3 py-2 font-semibold tabular-nums">{fcfa(r.balance)}</td><td className="px-3 py-2 tabular-nums">{fcfa(r.pendingPayouts)}</td>
              <td className="px-3 py-2">{canPay && r.balance - r.pendingPayouts > 0 && <Button size="sm" variant="outline" onClick={() => ask('RESTAURANT', r.id, r.name, r.balance - r.pendingPayouts)}>Verser</Button>}</td></tr>
          ))}
        </Table>
      </section>
      <section>
        <p className="mb-2 font-bold">Livreurs</p>
        <Table head={['Livreur', 'Gagné', 'Versé', 'Solde', 'Espèces en main', '']} empty={b.data.couriers.length === 0}>
          {b.data.couriers.map((c) => (
            <tr key={c.id}><td className="px-3 py-2">{c.name}</td><td className="px-3 py-2 tabular-nums">{fcfa(c.earned)}</td><td className="px-3 py-2 tabular-nums">{fcfa(c.paid)}</td><td className="px-3 py-2 font-semibold tabular-nums">{fcfa(c.balance)}</td><td className="px-3 py-2 tabular-nums">{fcfa(c.cashHeld)}</td>
              <td className="px-3 py-2">{canPay && c.balance - c.pendingPayouts > 0 && <Button size="sm" variant="outline" onClick={() => ask('COURIER', c.id, c.name, c.balance - c.pendingPayouts)}>Verser</Button>}</td></tr>
          ))}
        </Table>
      </section>
    </div>
  );
}

function PayoutsTab({ userId, canPay }: { userId: string; canPay: boolean }) {
  const [status, setStatus] = useState('PENDING_APPROVAL');
  const list = useApi<Payout[]>(`/finance/payouts?status=${status}`);
  const names = useApi<Balances>('/finance/balances');
  const { msg, run } = useRunner(list.reload);
  const [prompt, setPrompt] = useState<{ id: string; kind: 'execute' | 'reject' } | null>(null);
  const nameOf = (p: Payout) => (p.beneficiaryType === 'RESTAURANT' ? names.data?.restaurants : names.data?.couriers)?.find((x) => x.id === p.beneficiaryId)?.name ?? p.beneficiaryId.slice(-6);
  return (
    <>
      <Notice msg={msg} />
      <Tabs value={status} onChange={setStatus} items={Object.entries(PAYOUT_STATUS) as [string, string][]} />
      {!list.data ? <Spinner /> : list.data.length === 0 ? <p className="text-sm text-ink-muted">Aucun versement.</p> : (
        <div className="space-y-3">
          {list.data.map((p) => (
            <Card key={p.id} className="p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2"><p><b>{fcfa(p.amount)}</b> → {p.beneficiaryType === 'RESTAURANT' ? 'Restaurant' : 'Livreur'} {nameOf(p)} · {methodLabel(p.method)}</p><span className="text-ink-muted">{dateTime(p.createdAt)}</span></div>
              {p.reference && <p className="text-xs text-ink-muted">Référence : {p.reference} · payé le {date(p.paidAt)}</p>}
              {p.rejectReason && <p className="text-xs text-danger">Motif : {p.rejectReason}</p>}
              {canPay && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.status === 'PENDING_APPROVAL' && (p.requestedBy === userId
                    ? <span className="text-xs text-ink-muted">Vous avez préparé ce versement : un autre agent doit l’approuver.</span>
                    : <Button size="sm" onClick={() => run(() => api(`/finance/payouts/${p.id}/approve`, { method: 'POST' }), 'Versement approuvé.')}>Approuver</Button>)}
                  {p.status === 'APPROVED' && <Button size="sm" onClick={() => setPrompt({ id: p.id, kind: 'execute' })}>Marquer comme payé</Button>}
                  {(p.status === 'PENDING_APPROVAL' || p.status === 'APPROVED') && <Button size="sm" variant="outline" onClick={() => setPrompt({ id: p.id, kind: 'reject' })}>Rejeter</Button>}
                </div>
              )}
              {prompt?.id === p.id && (prompt.kind === 'execute'
                ? <InlinePrompt label="Référence de l’opération" placeholder="Référence MoMo / virement" onCancel={() => setPrompt(null)} onSubmit={(v) => run(() => api(`/finance/payouts/${p.id}/execute`, { method: 'POST', body: { reference: v } }), 'Versement exécuté et notifié.').then(() => setPrompt(null))} />
                : <InlinePrompt label="Motif du rejet" danger onCancel={() => setPrompt(null)} onSubmit={(v) => run(() => api(`/finance/payouts/${p.id}/reject`, { method: 'POST', body: { reason: v } }), 'Versement rejeté.').then(() => setPrompt(null))} />)}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function CashTab() {
  const b = useApi<Balances>('/finance/balances');
  const list = useApi<Remit[]>('/finance/remittances');
  const { msg, run } = useRunner(() => { b.reload(); list.reload(); });
  const [form, setForm] = useState<{ id: string; amount: string; note: string } | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  if (!b.data) return <Spinner />;
  const holders = b.data.couriers.filter((c) => c.cashHeld > 0);
  const nameOf = (id: string) => b.data!.couriers.find((c) => c.id === id)?.name ?? id.slice(-6);
  return (
    <div className="space-y-5">
      <Notice msg={receipt ? { tone: 'success', text: `Reçu ${receipt} émis. Remettez-le au livreur.` } : msg} />
      <Table head={['Livreur', 'Espèces détenues', '']} empty={holders.length === 0}>
        {holders.map((c) => (
          <tr key={c.id}><td className="px-3 py-2">{c.name}</td><td className="px-3 py-2 font-semibold tabular-nums">{fcfa(c.cashHeld)}</td>
            <td className="px-3 py-2">{form?.id === c.id ? (
              <div className="flex flex-wrap gap-2">
                <input aria-label="Montant reçu" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, '') })} className={`${inputCls} w-32`} />
                <input aria-label="Note" placeholder="Note (facultatif)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={`${inputCls} w-40`} />
                <Button size="sm" disabled={!Number(form.amount)} onClick={async () => {
                  setReceipt(null);
                  let r: { receiptNumber: string } | null = null;
                  const ok = await run(async () => { r = await api<{ receiptNumber: string }>(`/finance/couriers/${c.id}/remittances`, { method: 'POST', body: { amount: Number(form.amount), note: form.note } }); }, 'Reversement enregistré.');
                  if (ok && r) { setReceipt((r as { receiptNumber: string }).receiptNumber); setForm(null); }
                }}>Enregistrer</Button>
              </div>
            ) : <Button size="sm" variant="outline" onClick={() => setForm({ id: c.id, amount: String(c.cashHeld), note: '' })}>Recevoir les espèces</Button>}</td></tr>
        ))}
      </Table>
      <section>
        <p className="mb-2 font-bold">Derniers reversements</p>
        <Table head={['Reçu', 'Livreur', 'Montant', 'Date', 'Note']} empty={!list.data?.length}>
          {list.data?.map((r) => <tr key={r.id}><td className="px-3 py-2 font-mono text-xs">{r.receiptNumber}</td><td className="px-3 py-2">{nameOf(r.courierId)}</td><td className="px-3 py-2 tabular-nums">{fcfa(r.amount)}</td><td className="px-3 py-2">{dateTime(r.createdAt)}</td><td className="px-3 py-2 text-ink-muted">{r.note}</td></tr>)}
        </Table>
      </section>
    </div>
  );
}

function RefundsTab({ userId }: { userId: string }) {
  const [status, setStatus] = useState('REQUESTED');
  const list = useApi<Refund[]>(`/finance/refunds?status=${status}`);
  const { msg, run } = useRunner(list.reload);
  const [form, setForm] = useState({ order: '', amount: '', reason: '', borneBy: 'PLATFORM' });
  const [prompt, setPrompt] = useState<{ id: string; kind: 'pay' | 'reject'; method: string } | null>(null);
  return (
    <div className="space-y-4">
      <Notice msg={msg} />
      <Card className="p-4 text-sm">
        <p className="font-bold">Nouvelle demande de remboursement</p>
        <p className="text-ink-muted">Uniquement pour une commande effectivement payée. Le montant ne peut pas dépasser ce qui reste remboursable.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">Identifiant de commande<input value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value.trim() })} placeholder="24 caractères" className={`${inputCls} w-64 font-mono`} /></label>
          <label className="flex flex-col gap-1">Montant<input inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, '') })} className={`${inputCls} w-28`} /></label>
          <label className="flex flex-col gap-1">À la charge de<select value={form.borneBy} onChange={(e) => setForm({ ...form, borneBy: e.target.value })} className={inputCls}><option value="PLATFORM">Plateforme</option><option value="RESTAURANT">Restaurant</option></select></label>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1">Motif<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputCls} /></label>
          <Button size="sm" disabled={!/^[a-f0-9]{24}$/i.test(form.order) || !Number(form.amount) || form.reason.trim().length < 3}
            onClick={async () => { if (await run(() => api('/finance/refunds', { method: 'POST', body: { orderId: form.order, amount: Number(form.amount), reason: form.reason, borneBy: form.borneBy } }), 'Demande créée.')) setForm({ order: '', amount: '', reason: '', borneBy: 'PLATFORM' }); }}>Demander</Button>
        </div>
      </Card>
      <Tabs value={status} onChange={setStatus} items={Object.entries(REFUND_STATUS) as [string, string][]} />
      {!list.data ? <Spinner /> : list.data.length === 0 ? <p className="text-sm text-ink-muted">Aucun remboursement.</p> : list.data.map((r) => (
        <Card key={r.id} className="p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><p><b>{fcfa(r.amount)}</b> · commande {r.orderNumber} ({r.restaurantName}) · à la charge {r.borneBy === 'PLATFORM' ? 'de la plateforme' : 'du restaurant'}</p><span className="text-ink-muted">{dateTime(r.createdAt)}</span></div>
          <p className="text-ink-muted">{r.reason} · approbations {r.approvals}/{r.requiredApprovals}</p>
          {r.reference && <p className="text-xs text-ink-muted">Payé par {methodLabel(r.method)} · réf. {r.reference}</p>}
          {r.rejectReason && <p className="text-xs text-danger">Motif du rejet : {r.rejectReason}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {r.status === 'REQUESTED' && (r.requestedBy === userId ? <span className="text-xs text-ink-muted">Vous avez demandé ce remboursement : un autre agent doit l’approuver.</span> : <Button size="sm" onClick={() => run(() => api(`/finance/refunds/${r.id}/approve`, { method: 'POST' }), 'Approbation enregistrée.')}>Approuver</Button>)}
            {r.status === 'APPROVED' && <Button size="sm" onClick={() => setPrompt({ id: r.id, kind: 'pay', method: 'MTN_MOMO' })}>Marquer comme payé</Button>}
            {(r.status === 'REQUESTED' || r.status === 'APPROVED') && <Button size="sm" variant="outline" onClick={() => setPrompt({ id: r.id, kind: 'reject', method: '' })}>Rejeter</Button>}
          </div>
          {prompt?.id === r.id && prompt.kind === 'pay' && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select aria-label="Moyen" value={prompt.method} onChange={(e) => setPrompt({ ...prompt, method: e.target.value })} className={inputCls}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <div className="flex-1"><InlinePrompt label="Référence de l’opération" onCancel={() => setPrompt(null)} onSubmit={(v) => run(() => api(`/finance/refunds/${r.id}/pay`, { method: 'POST', body: { method: prompt.method, reference: v } }), 'Remboursement payé ; le client est prévenu.').then(() => setPrompt(null))} /></div>
            </div>
          )}
          {prompt?.id === r.id && prompt.kind === 'reject' && <InlinePrompt label="Motif du rejet" danger onCancel={() => setPrompt(null)} onSubmit={(v) => run(() => api(`/finance/refunds/${r.id}/reject`, { method: 'POST', body: { reason: v } }), 'Remboursement rejeté.').then(() => setPrompt(null))} />}
        </Card>
      ))}
    </div>
  );
}

function LedgerTab() {
  const [account, setAccount] = useState('');
  const [applied, setApplied] = useState('');
  const list = useApi<Tx[]>(`/finance/transactions${applied ? `?account=${encodeURIComponent(applied)}` : ''}`);
  return (
    <>
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(account.trim()); }}>
        <input aria-label="Compte" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="Filtrer par compte (ex. revenue:commission)" className={`${inputCls} flex-1`} />
        <Button size="sm" type="submit">Filtrer</Button>
      </form>
      {!list.data ? <Spinner /> : list.data.length === 0 ? <p className="text-sm text-ink-muted">Aucune écriture.</p> : (
        <div className="space-y-2">
          {list.data.map((t) => (
            <Card key={t.id} className="p-3 text-xs">
              <div className="flex flex-wrap justify-between gap-2 text-sm"><span><b>{t.type}</b> · {t.description ?? t.reference}</span><span className="text-ink-muted">{dateTime(t.createdAt)}</span></div>
              <table className="mt-2 w-full"><tbody>{t.entries.map((e, i) => <tr key={i}><td className="py-0.5 font-mono">{e.account}</td><td className="text-right tabular-nums">{e.debit ? fcfa(e.debit) : ''}</td><td className="w-28 text-right tabular-nums">{e.credit ? fcfa(e.credit) : ''}</td></tr>)}</tbody></table>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
