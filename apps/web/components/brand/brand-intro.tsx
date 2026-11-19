'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppIcon } from '@/components/ui';

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
      <div className="miamigo-intro__stage">
        <div className="miamigo-intro__wordmark">
          <span className="miamigo-intro__mark"><AppIcon name="utensils" className="size-8" /></span>
          <span className="miamigo-intro__name">Miamigo<span>.</span></span>
        </div>
        <span className="miamigo-intro__rider"><AppIcon name="motorcycle" className="size-9" /></span>
        <span className="miamigo-intro__road" />
      </div>
      <p className="miamigo-intro__tagline">Les bonnes tables de Cotonou</p>
    </div>
  );
}
