'use client';
import { useRouter } from 'next/navigation';
import { ReactNode } from 'react';

/** En-tête blanc « ← Titre » des maquettes panier / paiement / commande (maquette 3). */
export function PlainHeader({ title, right, backHref }: { title: string; right?: ReactNode; backHref?: string }) {
  const router = useRouter();
  return (
    <header className="flex items-center gap-3 px-4 pb-3 pt-5">
      <button type="button" aria-label="Retour" onClick={() => (backHref ? router.push(backHref) : router.back())} className="-ml-1 p-1 text-2xl leading-none text-ink">←</button>
      <h1 className="flex-1 text-[22px] font-bold">{title}</h1>
      {right}
    </header>
  );
}
