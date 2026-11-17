'use client';
import { useEffect, useState } from 'react';
import { AppIcon } from '@/components/ui';

export function BrandIntro() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 2700);
    return () => window.clearTimeout(timer);
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
