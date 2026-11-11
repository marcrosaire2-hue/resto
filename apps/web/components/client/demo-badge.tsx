/** Mention obligatoire tant que le contenu affiché est de démonstration (règle §28.1). */
export function DemoBadge({ className = '' }: { className?: string }) {
  return <span className={`inline-flex items-center rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${className}`}>Démo</span>;
}
