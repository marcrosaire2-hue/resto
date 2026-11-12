'use client';
import { useState } from 'react';
import { PageTitle } from '@/components/console/console-shell';
import { date, inputCls, Stat, Table, toInputDate } from '@/components/console/kit';
import { Card, Spinner } from '@/components/ui';
import { useProRestaurant } from '@/lib/pro';
import { fcfa, useApi } from '@/lib/use-api';

interface Statement {
  orders: number; grossSales: number; discounts: number; commissions: number; net: number;
  totalEarned: number; totalPaidOut: number; refundsBorne: number; balance: number; pendingPayouts: number;
  payouts: { id: string; amount: number; status: string; method: string; reference: string | null; paidAt: string | null; createdAt: string }[];
}
const STATUS: Record<string, string> = { PENDING_APPROVAL: 'En préparation', APPROVED: 'Approuvé', PAID: 'Payé', REJECTED: 'Rejeté', CANCELLED: 'Annulé' };

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
