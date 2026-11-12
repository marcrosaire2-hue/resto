'use client';
import { ReactNode } from 'react';
import { ConsoleShell } from '@/components/console/console-shell';
import { useProRestaurant } from '@/lib/pro';
import { useSession } from '@/lib/session';
import { Spinner } from '@/components/ui';

export default function ProLayout({ children }: { children: ReactNode }) {
  const { rid, membership, can } = useProRestaurant();
  const { loading, me } = useSession();
  const base = `/pro/${rid}`;
  if (!loading && me && !membership) {
    return <div className="grid min-h-dvh place-items-center p-6 text-center"><div><p className="font-bold">Restaurant introuvable</p><a href="/pro" className="text-sm text-brand">Retour</a></div></div>;
  }
  if (!membership) return <div className="grid min-h-dvh place-items-center text-brand"><Spinner /></div>;
  return (
    <ConsoleShell title={membership.name} subtitle="Espace restaurant" nav={[
      { href: base, label: 'Vue d’ensemble' },
      { href: `${base}/commandes`, label: 'Commandes', show: can('orders.view') },
      { href: `${base}/profil`, label: 'Profil et vitrine', show: can('restaurant.profile.view') },
      { href: `${base}/horaires`, label: 'Horaires et zones', show: can('restaurant.profile.view') },
      { href: `${base}/menu`, label: 'Menu', show: can('menu.view') },
      { href: `${base}/promotions`, label: 'Promotions', show: can('promotions.manage') },
      { href: `${base}/avis`, label: 'Avis', show: can('reviews.reply') },
      { href: `${base}/finances`, label: 'Finances', show: can('finance.restaurant.view') },
      { href: `/cuisine/${rid}`, label: 'Écran cuisine ↗', show: can('kitchen.view') },
      { href: `${base}/personnel`, label: 'Personnel', show: can('staff.view') },
    ]}>
      {children}
    </ConsoleShell>
  );
}
