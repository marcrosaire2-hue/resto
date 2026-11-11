'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { RESTAURANT_ROLES } from '@plateforme/contracts';
import { Logo, Spinner, buttonStyles } from '@/components/ui';
import { useSession } from '@/lib/session';

/** Choix du restaurant dans l'espace professionnel. */
export default function ProHome() {
  const { me, loading, refresh } = useSession();
  const router = useRouter();
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!loading && !me) router.replace('/connexion?suite=/pro');
    if (!loading && me?.restaurants.length === 1) router.replace(`/pro/${me.restaurants[0].restaurantId}`);
  }, [loading, me, router]);
  if (loading || !me) return <div className="grid min-h-dvh place-items-center text-brand"><Spinner /></div>;
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <Logo />
      <h1 className="text-2xl font-extrabold">Espace restaurant</h1>
      {me.restaurants.length === 0 ? (
        <div className="rounded-[18px] bg-surface p-6 shadow-[var(--shadow-card)]">
          <p className="font-semibold">Vous n’êtes rattaché à aucun restaurant.</p>
          <p className="mt-1 text-sm text-ink-muted">Proposez votre établissement : l’équipe l’examinera avant sa mise en ligne.</p>
          <Link href="/devenir-partenaire" className={`${buttonStyles()} mt-4`}>Inscrire mon restaurant</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {me.restaurants.map((r) => (
            <li key={r.restaurantId}>
              <Link href={`/pro/${r.restaurantId}`} className="flex items-center justify-between rounded-[16px] bg-surface p-4 shadow-[var(--shadow-card)]">
                <span><span className="block font-bold">{r.name}</span><span className="text-sm text-ink-muted">{RESTAURANT_ROLES.find((x) => x.code === r.role)?.label}</span></span>
                <span aria-hidden>›</span>
              </Link>
            </li>
          ))}
          <li><Link href="/devenir-partenaire" className="text-sm font-semibold text-brand">+ Inscrire un autre restaurant</Link></li>
        </ul>
      )}
    </main>
  );
}
