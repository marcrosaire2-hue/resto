'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/session';
import { AppIcon, Logo } from '@/components/ui';

const items = [
  { href: '/accueil', label: 'Accueil', icon: 'home' },
  { href: '/recherche', label: 'Recherche', icon: 'search' },
  { href: '/commandes', label: 'Commandes', icon: 'orders' },
  { href: '/compte', label: 'Compte', icon: 'user' },
] as const;

function NavigationIcon({ name }: { name: (typeof items)[number]['icon'] }) {
  const icon = name === 'home' ? 'house'
    : name === 'search' ? 'search'
      : name === 'user' ? 'user-round' : 'receipt-text';
  return <AppIcon name={icon} className="size-5" />;
}

export function CustomerNavigation() {
  const pathname = usePathname();
  const { me } = useSession();

  function hrefFor(href: string) {
    const requiresSession = href === '/accueil' || href === '/commandes' || href === '/compte';
    return me || !requiresSession ? href : `/connexion?suite=${encodeURIComponent(href)}`;
  }

  return (
    <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] border-t border-line/80 bg-surface/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgb(32_33_36/0.06)] backdrop-blur-xl md:top-0 md:bottom-auto md:h-20 md:max-w-none md:items-center md:border-t-0 md:border-b md:px-6 md:pb-0 md:pt-0 md:shadow-[0_6px_20px_rgb(29_48_40/0.06)]">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between">
        <Logo href="/accueil" className="!hidden md:!inline-flex" />
        <ul className="grid w-full grid-cols-4 md:w-auto md:gap-1">
        {items.map((item) => {
          const active = item.href === '/accueil'
            ? pathname === '/accueil'
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={hrefFor(item.href)}
                aria-current={active ? 'page' : undefined}
                className={`relative mx-auto flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition-colors md:flex-row md:gap-2 md:px-3 md:text-xs ${active ? 'text-brand md:bg-brand-50' : 'text-ink-muted hover:text-ink'}`}
              >
                <span className={`relative grid size-7 place-items-center rounded-full md:size-8 ${active ? 'bg-brand-50 md:bg-transparent' : ''}`}>
                  <NavigationIcon name={item.icon} />
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
        </ul>
        <Link href="/recherche" className="hidden items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-600 md:inline-flex">
          Commander <AppIcon name="arrow-right" className="size-4" />
        </Link>
      </div>
    </nav>
  );
}
