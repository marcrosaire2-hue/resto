import { ReactNode } from 'react';
import { cn } from '../ui/cn';

/**
 * Cadre responsive de l'espace client : compact sur téléphone, pleine largeur sur desktop.
 */
export function MobileScreen({ children, className, contentClassName, footer, wide = false }: { children: ReactNode; className?: string; contentClassName?: string; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('min-h-dvh bg-backdrop', wide ? 'client-brand sm:py-0' : 'sm:py-6')}>
      <div className={cn(
        'relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-canvas',
        'sm:min-h-[calc(100dvh-3rem)] sm:rounded-[36px] sm:shadow-[0_30px_80px_rgb(90_50_30/0.18)]',
        wide && 'client-wide max-w-none bg-canvas sm:min-h-dvh sm:rounded-none sm:shadow-none md:pt-20',
        className,
      )}>
        <div className={cn('flex flex-1 flex-col', contentClassName)}>{children}</div>
        {footer && (
          <div className="sticky bottom-0 z-10 border-t border-line/60 bg-surface/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
