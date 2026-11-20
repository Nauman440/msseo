import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { RegisterServiceWorker } from '@/components/pwa/RegisterServiceWorker';
import './globals.css';

// Fonts from the MSScore homepage design: Sora for headings, Plus Jakarta Sans for text (both SIL Open
// Font Licence). Kept in the repo (Latin, variable weight) so builds never depend on reaching Google Fonts.
const body = localFont({ src: './fonts/plus-jakarta-sans-latin.woff2', weight: '400 800', variable: '--font-body', display: 'swap' });
const display = localFont({ src: './fonts/sora-latin.woff2', weight: '600 800', variable: '--font-display', display: 'swap' });

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
