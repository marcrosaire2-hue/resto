'use client';
import Link from 'next/link';
import { Spinner } from '../ui';
import type { ApiError } from '@/lib/api';

export function LoadingBlock() {
  return <div className="grid flex-1 place-items-center py-16 text-brand"><Spinner /></div>;
}

export function ErrorBlock({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const notFound = error.status === 404;
  return (
    <div className="mx-4 my-10 rounded-[16px] bg-surface p-6 text-center shadow-[var(--shadow-card)]">
      <p className="font-bold">{notFound ? 'Introuvable' : 'Chargement impossible'}</p>
      <p className="mt-1 text-sm text-ink-muted">{notFound ? 'Cette page n’existe pas ou n’est plus disponible.' : error.message}</p>
      <div className="mt-4 flex justify-center gap-3 text-sm font-semibold">
        {!notFound && onRetry && <button type="button" onClick={onRetry} className="text-brand">Réessayer</button>}
        <Link href="/accueil" className="text-ink-muted">Retour à l’accueil</Link>
      </div>
    </div>
  );
}

export function RatingOrNew({ rating, count, className = '' }: { rating: number | null; count: number; className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center gap-1 rounded-[7px] bg-[#6b5d4f] px-2 py-1 text-xs font-medium text-white ${className}`}>
      {rating != null && count > 0 ? <>★ <span>{rating.toFixed(1).replace('.', ',')}</span></> : 'Nouveau'}
    </span>
  );
}
