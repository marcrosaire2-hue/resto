import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/manrope';
import { BrandIntro } from '@/components/brand/brand-intro';
import { CartProvider } from '@/lib/cart';
import { SessionProvider } from '@/lib/session';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Miamigo — Les bonnes adresses de Cotonou', template: '%s · Miamigo' },
  description: 'Les bonnes tables de Cotonou, vos plats préférés et une livraison locale simple avec Miamigo.',
};

export const viewport: Viewport = { themeColor: '#F7790F', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">
        <SessionProvider><CartProvider>{children}<BrandIntro /></CartProvider></SessionProvider>
      </body>
    </html>
  );
}
