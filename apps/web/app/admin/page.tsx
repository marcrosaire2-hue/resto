'use client';
import Link from 'next/link';
import { PageTitle } from '@/components/console/console-shell';
import { Card } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

interface R { _id: string; status: string }

/** Vue d'ensemble : chiffres calculés à partir des données réelles uniquement. */
export default function AdminHome() {
  const { me } = useSession();
  const canSee = !!me?.platformPermissions.includes('admin.restaurants.view');
  const list = useApi<R[]>(canSee ? '/admin/restaurants' : null);
  const count = (s: string) => list.data?.filter((r) => r.status === s).length ?? 0;
  return (
    <>
      <PageTitle title="Vue d’ensemble">Les indicateurs de commandes et de finances arriveront avec les phases 2 et 5.</PageTitle>
      {canSee && (
        <div className="grid gap-4 sm:grid-cols-4">
          {[['PENDING_REVIEW', 'Candidatures en attente'], ['ACTIVE', 'Restaurants actifs'], ['SUSPENDED', 'Suspendus'], ['REJECTED', 'Refusés']].map(([s, l]) => (
            <Link key={s} href={`/admin/restaurants?statut=${s}`}><Card className="p-5"><p className="text-sm text-ink-muted">{l}</p><p className="mt-1 text-3xl font-extrabold">{list.loading ? '…' : count(s)}</p></Card></Link>
          ))}
        </div>
      )}
    </>
  );
}
