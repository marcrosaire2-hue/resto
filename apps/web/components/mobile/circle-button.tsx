'use client';
import Link from 'next/link';
import { ReactNode } from 'react';
import { cn } from '../ui/cn';

const base = 'grid size-11 shrink-0 place-items-center rounded-[14px] bg-surface text-ink shadow-[0_2px_10px_rgb(32_33_36/0.08)] transition active:scale-95';

/** Bouton carré arrondi blanc (retour, favori, notifications) des maquettes. */
export function CircleButton({ label, onClick, href, children, className }: {
  label: string; onClick?: () => void; href?: string; children: ReactNode; className?: string;
}) {
  if (href) return <Link href={href} aria-label={label} className={cn(base, className)}>{children}</Link>;
  return <button type="button" aria-label={label} onClick={onClick} className={cn(base, className)}>{children}</button>;
}
