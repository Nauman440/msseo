import type { Metadata } from 'next';
import './print.css';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** No app chrome: this route is what Playwright renders to PDF. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="pdf-doc">{children}</div>;
}
