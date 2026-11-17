'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { useSession } from '@/lib/session';
import { cn, Logo, Spinner } from '../ui';
import type { AppIconName } from '../ui/app-icon';
import { AppIcon } from '../ui/app-icon';

export interface NavItem { href: string; label: string; show?: boolean; icon?: AppIconName }

/**
 * Gabarit des espaces professionnels (restaurant, administration) : confortable sur ordinateur
 * (barre latérale), utilisable sur mobile (onglets défilants).
 */
export function ConsoleShell({ title, subtitle, nav, children, badge, variant = 'standard' }: { title: string; subtitle?: string; nav: NavItem[]; children: ReactNode; badge?: ReactNode; variant?: 'standard' | 'admin' | 'restaurant' }) {
  const path = usePathname();
  const router = useRouter();
  const { me, loading } = useSession();
  useEffect(() => {
    if (!loading && !me) router.replace(`/connexion?suite=${encodeURIComponent(path)}`);
  }, [loading, me, path, router]);
  if (loading || !me) return <div className="grid min-h-dvh place-items-center text-brand"><Spinner /></div>;
  const items = nav.filter((n) => n.show !== false);
  const isActive = (href: string) => path === href || (href.split('/').length > 3 && path.startsWith(href));
  const adminGroups = [
    { title: 'PILOTAGE', items: items.filter((n) => ['/admin', '/admin/finances', '/admin/performance'].includes(n.href)) },
    { title: 'RÉSEAU', items: items.filter((n) => ['/admin/restaurants', '/admin/livreurs', '/admin/clients'].includes(n.href)) },
    { title: 'EXPÉRIENCE', items: items.filter((n) => ['/admin/assistance', '/admin/avis', '/admin/commercial'].includes(n.href)) },
    { title: 'CONFIGURATION', items: items.filter((n) => ['/admin/zones', '/admin/cuisines', '/admin/parametres', '/admin/personnel', '/admin/journal'].includes(n.href)) },
  ].filter((group) => group.items.length > 0);
  const activeItem = items.find((n) => isActive(n.href));
  const initials = me.fullName.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <div className={cn('console-shell min-h-dvh bg-canvas lg:grid', variant === 'admin' ? 'admin-console lg:grid-cols-[276px_1fr]' : variant === 'restaurant' ? 'restaurant-console lg:grid-cols-[276px_1fr]' : 'lg:grid-cols-[250px_1fr]')}>
      {variant === 'admin' ? (
        <aside className="admin-sidebar hidden min-h-dvh flex-col p-5 text-white lg:flex">
          <Logo href="/admin" light />
          <div className="admin-sidebar-cover relative isolate mt-8 overflow-hidden rounded-[22px] p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/demo/resto-2.jpg" alt="" className="absolute inset-0 -z-20 size-full object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#0f372b]/95 via-[#0f372b]/80 to-[#0f372b]/30" aria-hidden />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#def0ae]">
              <span className="size-1.5 rounded-full bg-[#b9e36b]" /> Console active
            </span>
            <p className="mt-8 text-lg font-extrabold leading-tight">Le goût de Cotonou,<br />bien piloté.</p>
            <p className="mt-1 text-xs text-white/70">Espace d’administration</p>
          </div>
          {badge && <div className="mt-3">{badge}</div>}
          <nav aria-label="Administration" className="mt-6 flex-1 space-y-5 overflow-y-auto">
            {adminGroups.map((group) => (
              <section key={group.title}>
                <h2 className="mb-2 px-3 text-[9px] font-extrabold tracking-[0.18em] text-white/45">{group.title}</h2>
                <ul className="space-y-1">
                  {group.items.map((n) => (
                    <li key={n.href}>
                      <Link href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}
                        className={cn('flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition-colors', isActive(n.href) ? 'bg-[#d9efaa] text-[#173c2d] shadow-[0_6px_18px_rgb(0_0_0/0.12)]' : 'text-white/75 hover:bg-white/10 hover:text-white')}>
                        {n.icon && <AppIcon name={n.icon} className="size-[17px]" />}
                        {n.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
          <div className="mt-5 border-t border-white/15 pt-4">
            <p className="truncate text-sm font-bold">{me.fullName}</p>
            <p className="mt-0.5 truncate text-xs text-white/55">{subtitle}</p>
            <Link href="/compte" className="mt-3 flex items-center gap-2 text-xs font-semibold text-white/70 hover:text-white">
              <AppIcon name="user-round" className="size-4" /> Mon compte
            </Link>
          </div>
        </aside>
      ) : variant === 'restaurant' ? (
        <aside className="restaurant-sidebar hidden min-h-dvh flex-col p-5 text-white lg:flex">
          <Logo href="/pro" light />
          <div className="restaurant-sidebar-cover relative isolate mt-8 overflow-hidden rounded-[24px] p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/demo/resto-2.jpg" alt="" className="absolute inset-0 -z-20 size-full object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#103528]/95 via-[#164a35]/74 to-[#164a35]/18" aria-hidden />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#def0ae]">
              <span className="size-1.5 rounded-full bg-[#b9e36b]" /> Espace professionnel
            </span>
            <p className="mt-8 line-clamp-2 text-lg font-extrabold leading-tight">{title}</p>
            <p className="mt-1 text-xs text-white/75">Votre cuisine, votre vitrine.</p>
          </div>
          {badge && <div className="mt-3">{badge}</div>}
          <nav aria-label="Espace restaurant" className="mt-6 flex-1 space-y-1 overflow-y-auto">
            {items.map((n) => (
              <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}
                className={cn('flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition-colors', isActive(n.href) ? 'bg-[#d9efaa] text-[#173c2d] shadow-[0_6px_18px_rgb(0_0_0/0.12)]' : 'text-white/75 hover:bg-white/10 hover:text-white')}>
                {n.icon && <AppIcon name={n.icon} className="size-[17px]" />}
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-5 border-t border-white/15 pt-4">
            <p className="truncate text-sm font-bold">{me.fullName}</p>
            <p className="mt-0.5 truncate text-xs text-white/55">{subtitle}</p>
            <Link href="/compte" className="mt-3 flex items-center gap-2 text-xs font-semibold text-white/70 hover:text-white">
              <AppIcon name="user-round" className="size-4" /> Mon compte
            </Link>
          </div>
        </aside>
      ) : (
        <aside className="hidden border-r border-line bg-surface p-5 lg:block">
          <Logo />
          <p className="mt-6 truncate text-sm font-bold">{title}</p>
          {subtitle && <p className="truncate text-xs text-ink-muted">{subtitle}</p>}
          {badge && <div className="mt-2">{badge}</div>}
          <nav className="mt-6 space-y-1">
            {items.map((n) => (
              <Link key={n.href} href={n.href} className={cn('block rounded-[10px] px-3 py-2 text-sm font-semibold', isActive(n.href) ? 'bg-brand-50 text-brand' : 'text-ink hover:bg-black/5')}>{n.label}</Link>
            ))}
          </nav>
          <Link href="/compte" className="mt-8 block text-sm text-ink-muted">← Mon compte</Link>
        </aside>
      )}
      <div className="min-w-0">
        {variant === 'admin' ? (
          <header className="admin-topbar sticky top-0 z-20 flex min-h-[76px] items-center justify-between gap-4 border-b border-line/80 bg-surface/90 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand">Miamigo <span className="mx-1 text-ink-muted">/</span> Administration</p>
              <p className="mt-1 truncate text-xs text-ink-muted sm:text-sm">
                <span className="font-bold text-ink">{activeItem?.label ?? title}</span>
                <span className="hidden sm:inline"> · Bonjour {me.fullName.split(' ')[0]}, voici l’activité de votre plateforme.</span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <Link href="/accueil" className="hidden h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-xs font-bold text-ink transition-colors hover:border-brand/30 hover:text-brand sm:inline-flex">
                Voir le site <AppIcon name="arrow-up-right" className="size-4" />
              </Link>
              <span className="grid size-10 place-items-center rounded-full bg-brand text-xs font-extrabold text-white">{initials}</span>
            </div>
          </header>
        ) : variant === 'restaurant' ? (
          <header className="restaurant-topbar relative isolate flex min-h-[112px] items-center justify-between gap-4 overflow-hidden px-4 py-4 text-white sm:px-7 lg:min-h-[150px] lg:px-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/demo/resto-2.jpg" alt="" className="absolute inset-0 -z-20 size-full object-cover object-center" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#103528]/95 via-[#164a35]/80 to-[#164a35]/35" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#d9efaa]">Miamigo <span className="mx-1 text-white/50">/</span> Espace restaurant</p>
              <p className="mt-2 truncate text-xl font-extrabold sm:text-2xl">{activeItem?.label ?? title}</p>
              <p className="mt-1 truncate text-xs text-white/75 sm:text-sm">Bonjour {me.fullName.split(' ')[0]}, pilotez votre établissement en un clin d’œil.</p>
            </div>
            <div className="hidden shrink-0 items-center gap-3 sm:flex">
              <Link href="/compte" className="flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold backdrop-blur transition-colors hover:bg-white/20">
                <span className="grid size-7 place-items-center rounded-full bg-[#d9efaa] text-[10px] text-[#173c2d]">{initials}</span>
                Mon compte
              </Link>
            </div>
          </header>
        ) : (
          <header className="sticky top-0 z-20 border-b border-line bg-surface lg:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0"><p className="truncate font-bold">{title}</p>{subtitle && <p className="truncate text-xs text-ink-muted">{subtitle}</p>}</div>
              <Link href="/compte" className="text-sm text-ink-muted">Compte</Link>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
              {items.map((n) => (
                <Link key={n.href} href={n.href} className={cn('shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold', isActive(n.href) ? 'bg-brand-50 text-brand' : 'text-ink-muted')}>{n.label}</Link>
              ))}
            </nav>
          </header>
        )}
        {variant === 'admin' && (
          <nav aria-label="Navigation administration" className="admin-mobile-nav sticky top-[76px] z-10 flex gap-1 overflow-x-auto border-b border-line bg-surface/95 px-3 py-2 backdrop-blur-xl lg:hidden">
            {items.map((n) => (
              <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}
                className={cn('inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-bold', isActive(n.href) ? 'bg-brand-50 text-brand' : 'text-ink-muted hover:bg-canvas')}>
                {n.icon && <AppIcon name={n.icon} className="size-4" />}
                {n.label}
              </Link>
            ))}
          </nav>
        )}
        {variant === 'restaurant' && (
          <nav aria-label="Navigation espace restaurant" className="restaurant-mobile-nav sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-line bg-surface/95 px-3 py-2 backdrop-blur-xl lg:hidden">
            {items.map((n) => (
              <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}
                className={cn('inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-bold transition-colors', isActive(n.href) ? 'bg-brand text-white shadow-[var(--shadow-raised)]' : 'text-ink-muted hover:bg-brand-50 hover:text-brand')}>
                {n.icon && <AppIcon name={n.icon} className="size-4" />}
                {n.label}
              </Link>
            ))}
          </nav>
        )}
        <main className={cn('mx-auto p-4 sm:p-6', variant === 'admin' || variant === 'restaurant' ? 'max-w-[1500px] sm:px-7 sm:py-8 lg:px-10' : 'max-w-5xl')}>
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageTitle({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-1 text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

export function Notice({ msg }: { msg: { tone: 'success' | 'danger' | 'info'; text: string } | null }) {
  if (!msg) return null;
  const cls = msg.tone === 'success' ? 'bg-success-50 text-success' : msg.tone === 'danger' ? 'bg-danger-50 text-danger' : 'bg-brand-50 text-ink';
  return <p role={msg.tone === 'danger' ? 'alert' : 'status'} className={`mb-4 rounded-[12px] p-3 text-sm ${cls}`}>{msg.text}</p>;
}
