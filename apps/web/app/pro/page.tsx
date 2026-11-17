'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { RESTAURANT_ROLES } from '@plateforme/contracts';
import { AppIcon, Logo, Spinner, buttonStyles } from '@/components/ui';
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
    <main className="min-h-dvh bg-[radial-gradient(ellipse_at_10%_0%,#dcebcf_0%,transparent_38%),linear-gradient(145deg,#f7f8f3,#edf2e8)] px-4 py-5 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-[1180px]">
        <header className="relative isolate overflow-hidden rounded-[26px] bg-[#153d2d] px-5 pb-6 pt-5 text-white shadow-[0_18px_48px_rgb(23_48_36/0.18)] sm:min-h-[280px] sm:rounded-[34px] sm:px-10 sm:pb-9 sm:pt-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/demo/resto-2.jpg" alt="" className="absolute inset-0 -z-20 size-full object-cover" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#102f24]/95 via-[#153d2d]/78 to-[#153d2d]/25" aria-hidden />
          <Logo href="/pro" light />
          <div className="mt-7 max-w-[620px] sm:mt-12">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#d9efaa]">Espace professionnel Miamigo</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-5xl">Votre restaurant,<br className="sm:hidden" /> à portée de main.</h1>
            <p className="mt-3 max-w-[460px] text-sm leading-relaxed text-white/75">Retrouvez vos outils et faites vivre votre établissement sur Miamigo.</p>
          </div>
          <span className="absolute bottom-5 right-5 hidden size-14 place-items-center rounded-2xl border border-white/20 bg-white/10 text-[#d9efaa] backdrop-blur-md sm:grid"><AppIcon name="chef-hat" className="size-7" /></span>
        </header>

        <section className="mt-7 sm:mt-10">
          {me.restaurants.length === 0 ? (
            <div className="mx-auto max-w-2xl rounded-[24px] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-9">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand"><AppIcon name="store" className="size-6" /></span>
              <h2 className="mt-4 text-xl font-extrabold">Votre aventure commence ici</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">Vous n’êtes rattaché à aucun restaurant. Proposez votre établissement : notre équipe l’examinera avant sa mise en ligne.</p>
              <Link href="/devenir-partenaire" className={`${buttonStyles()} mt-5`}>Inscrire mon restaurant <AppIcon name="arrow-right" className="size-4" /></Link>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand">Vos établissements</p>
                  <h2 className="mt-1 text-xl font-extrabold sm:text-2xl">Choisissez votre espace</h2>
                </div>
                <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold text-ink-muted">{me.restaurants.length} établissement{me.restaurants.length > 1 ? 's' : ''}</span>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {me.restaurants.map((r, index) => {
                  const covers = ['/demo/resto-1.jpg', '/demo/resto-3.jpg', '/demo/resto-4.jpg'];
                  return (
                    <li key={r.restaurantId}>
                      <Link href={`/pro/${r.restaurantId}`} className="group relative isolate flex min-h-[220px] flex-col justify-end overflow-hidden rounded-[24px] bg-[#153d2d] p-5 text-white shadow-[var(--shadow-card)] transition-transform hover:-translate-y-1 sm:min-h-[260px]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={covers[index % covers.length]} alt="" className="absolute inset-0 -z-20 size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#102f24]/95 via-[#153d2d]/35 to-transparent" aria-hidden />
                        <span className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-white/25 bg-white/15 backdrop-blur-md"><AppIcon name="arrow-up-right" className="size-5" /></span>
                        <span className="mb-auto inline-flex w-fit items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold text-[#d9efaa] backdrop-blur">
                          <AppIcon name="user-round" className="size-3.5" /> {RESTAURANT_ROLES.find((x) => x.code === r.role)?.label}
                        </span>
                        <span className="text-xl font-extrabold">{r.name}</span>
                        <span className="mt-1 flex items-center justify-between text-xs text-white/75"><span>Ouvrir mon espace de gestion</span><AppIcon name="arrow-right" className="size-4" /></span>
                      </Link>
                    </li>
                  );
                })}
                <li className="flex">
                  <Link href="/devenir-partenaire" className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-[24px] border border-dashed border-brand/30 bg-white/70 p-5 text-center transition-colors hover:bg-white sm:min-h-[260px]">
                    <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand"><AppIcon name="store" className="size-6" /></span>
                    <span className="mt-3 text-sm font-extrabold">Ajouter un restaurant</span>
                    <span className="mt-1 text-xs text-ink-muted">Développer votre présence Miamigo</span>
                  </Link>
                </li>
              </ul>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
