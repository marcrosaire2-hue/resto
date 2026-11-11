'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { useSession } from '@/lib/session';
import { cn, Logo, Spinner } from '../ui';

export interface NavItem { href: string; label: string; show?: boolean }

/**
 * Gabarit des espaces professionnels (restaurant, administration) : confortable sur ordinateur
 * (barre latérale), utilisable sur mobile (onglets défilants).
 */
export function ConsoleShell({ title, subtitle, nav, children, badge }: { title: string; subtitle?: string; nav: NavItem[]; children: ReactNode; badge?: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { me, loading } = useSession();
  useEffect(() => {
    if (!loading && !me) router.replace(`/connexion?suite=${encodeURIComponent(path)}`);
  }, [loading, me, path, router]);
  if (loading || !me) return <div className="grid min-h-dvh place-items-center text-brand"><Spinner /></div>;
  const items = nav.filter((n) => n.show !== false);
  const isActive = (href: string) => path === href || (href.split('/').length > 3 && path.startsWith(href));
  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[250px_1fr]">
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
      <div className="min-w-0">
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
        <main className="mx-auto max-w-5xl p-4 sm:p-6">{children}</main>
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
