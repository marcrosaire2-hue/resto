'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PlainHeader } from '@/components/client/plain-header';
import { ErrorBlock, LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { useSession } from '@/lib/session';
import { fcfa, useApi } from '@/lib/use-api';

interface Row { id: string; number: string; status: string; statusLabel: string; restaurantName: string; total: number; itemsCount: number; createdAt: string; imageUrl: string | null }

/** Historique des commandes du client. */
export default function OrdersPage() {
  const { me, loading } = useSession();
  const router = useRouter();
  useEffect(() => { if (!loading && !me) router.replace('/connexion?suite=/commandes'); }, [loading, me, router]);
  const list = useApi<Row[]>(me ? '/orders' : null);
  return (
    <MobileScreen className="bg-surface">
      <PlainHeader title="Mes commandes" backHref="/accueil" />
      <main className="flex-1 px-4 pb-6">
        {list.loading || !me ? <LoadingBlock /> : list.error ? <ErrorBlock error={list.error} onRetry={list.reload} /> : list.data!.length === 0 ? (
          <div className="py-12 text-center"><p className="font-semibold">Aucune commande pour le moment</p><Link href="/accueil" className="text-sm font-semibold text-brand">Découvrir les restaurants</Link></div>
        ) : (
          <ul className="space-y-3">
            {list.data!.map((o) => (
              <li key={o.id}>
                <Link href={`/commandes/${o.id}`} className="flex gap-3 rounded-[8px] border border-line p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {o.imageUrl ? <img src={o.imageUrl} alt="" className="size-16 rounded-[6px] object-cover" /> : <span className="size-16 rounded-[6px] bg-peach" />}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-semibold">{o.restaurantName}</p>
                    <p className="text-xs text-ink-muted">{o.number} · {new Date(o.createdAt).toLocaleDateString('fr-FR')} · {o.itemsCount} article(s)</p>
                    <div className="mt-1 flex items-center justify-between"><span className="font-semibold text-brand">{fcfa(o.total)}</span><span className="rounded-[3px] bg-brand-50 px-2 py-0.5 text-xs text-brand">{o.statusLabel}</span></div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </MobileScreen>
  );
}
