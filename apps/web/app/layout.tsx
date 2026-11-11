import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/manrope';
import { CartProvider } from '@/lib/cart';
import { SessionProvider } from '@/lib/session';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Marketplace — Restaurants de Cotonou', template: '%s · Marketplace' },
  description: 'Découvrez, commandez et faites-vous livrer vos plats préférés à Cotonou.',
};

export const viewport: Viewport = { themeColor: '#F15A24', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">
        <SessionProvider><CartProvider>{children}</CartProvider></SessionProvider>
      </body>
    </html>
  );
}
