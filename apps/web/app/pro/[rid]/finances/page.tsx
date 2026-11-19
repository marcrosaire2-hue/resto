'use client';
import { FormEvent, useState } from 'react';
import { PageTitle } from '@/components/console/console-shell';
import { date, inputCls, Stat, Table, toInputDate } from '@/components/console/kit';
import { Alert, Card, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useProRestaurant } from '@/lib/pro';
import { fcfa, useApi } from '@/lib/use-api';

interface Statement {
  orders: number; grossSales: number; discounts: number; commissions: number; net: number;
  totalEarned: number; totalPaidOut: number; refundsBorne: number; balance: number; pendingPayouts: number;
  payouts: { id: string; amount: number; status: string; method: string; reference: string | null; paidAt: string | null; createdAt: string }[];
}
const STATUS: Record<string, string> = { PENDING_APPROVAL: 'En préparation', APPROVED: 'Approuvé', PROCESSING: 'Virement en cours', FAILED: 'Échec (relancé par l’équipe)', PAID: 'Payé', REJECTED: 'Rejeté', CANCELLED: 'Annulé' };


/** Numéro Mobile Money sur lequel le restaurant reçoit l'argent de ses commandes payées en ligne (virement automatique après livraison). */
function PayoutAccountCard({ rid }: { rid: string }) {
  const acc = useApi<{ account: { provider: 'MTN_MOMO' | 'MOOV_MONEY'; numberMasked: string } | null }>(`/restaurants/${rid}/payout-account`);
  const [provider, setProvider] = useState<'MTN_MOMO' | 'MOOV_MONEY'>('MTN_MOMO');
  const [number, setNumber] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const label = (p: string) => (p === 'MOOV_MONEY' ? 'Moov Money' : 'MTN MoMo');
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api(`/restaurants/${rid}/payout-account`, { method: 'PUT', body: { provider, number } });
      setNumber('');
      acc.reload();
      setMsg({ tone: 'success', text: 'Numéro enregistré. Vos prochains versements arriveront sur ce numéro.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof ApiError ? (err.fieldErrors().number ?? err.message) : 'Enregistrement impossible.' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="mb-4 p-4 text-sm">
      <p className="font-bold">Numéro de réception de vos paiements</p>
      <p className="mt-1 text-xs text-ink-muted">Après chaque livraison payée en ligne, votre part (montant moins commission) est envoyée automatiquement sur ce numéro Mobile Money. Seul le propriétaire peut le modifier.</p>
      {acc.data && (acc.data.account
        ? <p className="mt-3 rounded-[10px] bg-success-50 px-3 py-2">Actuel : <b>{label(acc.data.account.provider)}</b> · <span className="font-mono">{acc.data.account.numberMasked}</span></p>
        : <p className="mt-3 rounded-[10px] bg-warning-50 px-3 py-2 text-warning">Aucun numéro défini : vous ne recevrez pas de virement automatique tant que vous n’en enregistrez pas un.</p>)}
      <form onSubmit={save} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">Opérateur
          <select value={provider} onChange={(e) => setProvider(e.target.value as 'MTN_MOMO' | 'MOOV_MONEY')} className={inputCls}><option value="MTN_MOMO">MTN MoMo</option><option value="MOOV_MONEY">Moov Money</option></select>
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1">Numéro
          <input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="tel" placeholder="01 97 00 00 00" className={inputCls} />
        </label>
        <button type="submit" disabled={busy || number.trim().length < 8} className="h-10 rounded-[10px] bg-brand px-4 font-semibold text-white disabled:opacity-50">{busy ? 'Enregistrement…' : acc.data?.account ? 'Remplacer le numéro' : 'Enregistrer'}</button>
      </form>
      {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
    </Card>
  );
}

/** Finances du restaurant : ventes livrées, commissions, solde à recevoir et versements, avec export. */
export default function ProFinancesPage() {
  const { rid } = useProRestaurant();
  const now = new Date();
  const [from, setFrom] = useState(toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toInputDate(now));
  const q = `from=${from}&to=${to}`;
  const s = useApi<Statement>(`/restaurants/${rid}/finance?${q}`);
  return (
    <>
      <PageTitle title="Finances">Montants calculés à partir des commandes livrées et du grand livre.</PageTitle>
      <PayoutAccountCard rid={rid} />
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4 text-sm">
        <label className="flex flex-col gap-1">Du<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></label>
        <label className="flex flex-col gap-1">Au<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></label>
        <a href={`/api/restaurants/${rid}/finance/export?${q}&format=xlsx`} className="inline-flex h-10 items-center rounded-[10px] bg-brand px-4 font-semibold text-white">Exporter (Excel)</a>
        <a href={`/api/restaurants/${rid}/finance/export?${q}&format=pdf`} className="inline-flex h-10 items-center rounded-[10px] border border-brand px-4 font-semibold text-brand">PDF</a>
      </Card>
      {!s.data ? <Spinner /> : (
        <>
          <p className="mb-2 text-sm font-semibold">Sur la période</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Commandes livrées" value={s.data.orders} />
            <Stat label="Ventes brutes" value={fcfa(s.data.grossSales)} />
            <Stat label="Promotions" value={fcfa(s.data.discounts)} />
            <Stat label="Commissions" value={fcfa(s.data.commissions)} />
            <Stat label="Net restaurant" value={fcfa(s.data.net)} />
          </div>
          <p className="mb-2 mt-5 text-sm font-semibold">Depuis le début</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Solde à recevoir" value={fcfa(s.data.balance)} hint={s.data.pendingPayouts ? `${fcfa(s.data.pendingPayouts)} en cours de versement` : undefined} />
            <Stat label="Total gagné" value={fcfa(s.data.totalEarned)} />
            <Stat label="Total versé" value={fcfa(s.data.totalPaidOut)} />
            <Stat label="Remboursements à votre charge" value={fcfa(s.data.refundsBorne)} />
          </div>
          <p className="mb-2 mt-5 font-bold">Versements</p>
          <Table head={['Date', 'Montant', 'Moyen', 'Statut', 'Référence']} empty={s.data.payouts.length === 0}>
            {s.data.payouts.map((p) => <tr key={p.id}><td className="px-3 py-2">{date(p.paidAt ?? p.createdAt)}</td><td className="px-3 py-2 tabular-nums">{fcfa(p.amount)}</td><td className="px-3 py-2">{p.method}</td><td className="px-3 py-2">{STATUS[p.status] ?? p.status}</td><td className="px-3 py-2 font-mono text-xs">{p.reference ?? '—'}</td></tr>)}
          </Table>
        </>
      )}
    </>
  );
}
