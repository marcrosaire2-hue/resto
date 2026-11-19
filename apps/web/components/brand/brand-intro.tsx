'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogoFull } from '@/components/ui';

export function BrandIntro() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pathname === '/') return; // l'écran de lancement (/) joue déjà ce rôle
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 2700);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- animation jouée une seule fois, au premier chargement
  }, []);

  if (!visible) return null;

  return (
    <div className="miamigo-intro" aria-hidden="true">
      <LogoFull className="miamigo-intro__logo w-[min(78vw,340px)]" />
    </div>
  );
}
