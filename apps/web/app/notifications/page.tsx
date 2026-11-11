'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PlainHeader } from '@/components/client/plain-header';
import { LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

interface N { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }

export default function NotificationsPage() {
  const { me, loading } = useSession();
  const router = useRouter();
  useEffect(() => { if (!loading && !me) router.replace('/connexion?suite=/notifications'); }, [loading, me, router]);
  const list = useApi<{ unread: number; items: N[] }>(me ? '/notifications' : null);
  useEffect(() => {
    if (list.data?.unread) void api('/notifications/read', { method: 'POST', body: { ids: 'all' } });
  }, [list.data?.unread]);
  return (
    <MobileScreen className="bg-surface">
      <PlainHeader title="Notifications" backHref="/accueil" />
      <main className="flex-1 px-4 pb-6">
        {list.loading || !list.data ? <LoadingBlock /> : list.data.items.length === 0 ? <p className="py-12 text-center text-sm text-ink-muted">Aucune notification.</p> : (
          <ul className="divide-y divide-line">
            {list.data.items.map((n) => {
              const inner = (<><p className={`text-sm ${n.readAt ? '' : 'font-bold'}`}>{n.title}</p>{n.body && <p className="text-sm text-ink-muted">{n.body}</p>}<p className="text-xs text-ink-muted">{new Date(n.createdAt).toLocaleString('fr-FR')}</p></>);
              return <li key={n.id} className="py-3">{n.link ? <Link href={n.link}>{inner}</Link> : inner}</li>;
            })}
          </ul>
        )}
      </main>
    </MobileScreen>
  );
}
