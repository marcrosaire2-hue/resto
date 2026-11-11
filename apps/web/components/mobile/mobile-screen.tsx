import { ReactNode } from 'react';
import { cn } from '../ui/cn';

/**
 * Cadre mobile de l'espace client : l'interface client est conçue uniquement pour téléphone.
 * Sur un grand écran, elle reste une colonne de téléphone centrée (comme les maquettes).
 */
export function MobileScreen({ children, className, footer }: { children: ReactNode; className?: string; footer?: ReactNode }) {
  return (
    <div className="min-h-dvh bg-backdrop sm:py-6">
      <div className={cn(
        'relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-canvas',
        'sm:min-h-[calc(100dvh-3rem)] sm:rounded-[36px] sm:shadow-[0_30px_80px_rgb(90_50_30/0.18)]',
        className,
      )}>
        <div className="flex flex-1 flex-col">{children}</div>
        {footer && (
          <div className="sticky bottom-0 z-10 border-t border-line/60 bg-surface/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
