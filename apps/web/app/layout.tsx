import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Sora } from 'next/font/google';
import { RegisterServiceWorker } from '@/components/pwa/RegisterServiceWorker';
import './globals.css';

// Fonts from the MSScore homepage design: Sora for headings, Plus Jakarta Sans for text.
const body = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-body', display: 'swap' });
const display = Sora({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-display', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'MSScore by Morosoft', template: '%s · MSScore' },
  description: 'Free SEO audit: see what is costing you customers, and what to fix first.',
  applicationName: 'MSScore',
  appleWebApp: { capable: true, title: 'MSScore', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0F1B2D',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
