'use client';
import dynamic from 'next/dynamic';
import { PageTitle } from '@/components/console/console-shell';
import { Card } from '@/components/ui';
import type { OpsCourier, OpsOrder } from '@/lib/ops-types';
import { useLive } from '@/lib/realtime';
import { useApi } from '@/lib/use-api';

const OpsMap = dynamic(() => import('@/components/console/ops-map'), { ssr: false, loading: () => <div className="h-[60vh] rounded-[16px] bg-canvas" /> });

export default function OpsMapPage() {
  const couriers = useApi<OpsCourier[]>('/ops/couriers');
  const orders = useApi<OpsOrder[]>('/ops/orders?scope=active');
  useLive({ type: 'ops', id: 'ops' }, ['courier.position', 'courier.updated', 'delivery.updated'], () => { couriers.reload(); orders.reload(); }, 30_000);
  const withPos = (couriers.data ?? []).filter((c) => c.position).length;
  const withoutPos = (couriers.data ?? []).filter((c) => c.isOnline && !c.position);
  return (
    <>
      <PageTitle title="Carte">Positions partagées par les livreurs (avec leur accord) ; les adresses sans coordonnées GPS ne sont pas placées.</PageTitle>
      <OpsMap couriers={couriers.data ?? []} orders={orders.data ?? []} />
      <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
        <Card className="p-3"><span className="mr-2 inline-block size-3 rounded-full bg-success" />Disponible · <span className="mr-2 inline-block size-3 rounded-full bg-warning" />En course · <span className="mr-2 inline-block size-3 rounded-full bg-brand" />Destination</Card>
        <Card className="p-3">{withPos} livreur(s) localisé(s)</Card>
        <Card className="p-3">{withoutPos.length ? `En ligne sans position : ${withoutPos.map((c) => c.fullName).join(', ')}` : 'Tous les livreurs en ligne sont localisés.'}</Card>
      </div>
    </>
  );
}
