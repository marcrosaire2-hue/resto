'use client';
import { useState } from 'react';
import { VEHICLE_LABELS } from '@plateforme/contracts';
import { PageTitle } from '@/components/console/console-shell';
import { Table } from '@/components/console/kit';
import { Chip, Spinner } from '@/components/ui';
import { fcfa, useApi } from '@/lib/use-api';

interface P { id: string; name: string; phone: string | null; status: string; isOnline: boolean; vehicleType: string; delivered: number; failed: number; earned: number; successRate: number | null; acceptanceRate: number | null; avgDeliveryMinutes: number | null }
const pct = (v: number | null) => (v == null ? '—' : `${v} %`);

/** Performance des livreurs, calculée sur leurs courses réelles. */
export default function CourierPerformancePage() {
  const [days, setDays] = useState(30);
  const list = useApi<P[]>(`/admin/couriers/performance?days=${days}`);
  return (
    <>
      <PageTitle title="Performance des livreurs" actions={<div className="flex gap-2">{[7, 30, 90].map((n) => <Chip key={n} selected={days === n} onClick={() => setDays(n)}>{n} j</Chip>)}</div>}>
        Taux d’acceptation des offres, réussite et durée moyenne entre affectation et remise.
      </PageTitle>
      {!list.data ? <Spinner /> : (
        <Table head={['Livreur', 'Véhicule', 'Livrées', 'Échecs', 'Réussite', 'Acceptation', 'Durée moy.', 'Gains']} empty={list.data.length === 0}>
          {list.data.map((c) => (
            <tr key={c.id}>
              <td className="px-3 py-2">{c.isOnline && <span className="mr-1 inline-block size-2 rounded-full bg-success" aria-label="En ligne" />}{c.name}{c.status === 'SUSPENDED' && <span className="ml-1 text-xs text-danger">(suspendu)</span>}</td>
              <td className="px-3 py-2">{VEHICLE_LABELS[c.vehicleType as keyof typeof VEHICLE_LABELS] ?? c.vehicleType}</td>
              <td className="px-3 py-2 tabular-nums">{c.delivered}</td><td className="px-3 py-2 tabular-nums">{c.failed}</td>
              <td className="px-3 py-2">{pct(c.successRate)}</td><td className="px-3 py-2">{pct(c.acceptanceRate)}</td>
              <td className="px-3 py-2">{c.avgDeliveryMinutes == null ? '—' : `${c.avgDeliveryMinutes} min`}</td><td className="px-3 py-2 tabular-nums">{fcfa(c.earned)}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
