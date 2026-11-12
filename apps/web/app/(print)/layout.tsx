import './print.css';

/** No app chrome: this route is what Playwright renders to PDF. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="pdf-doc">{children}</div>;
}
