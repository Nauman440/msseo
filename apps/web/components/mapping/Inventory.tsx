import { pageInventory, pathOf, type MappingWorkspace, type ReportPage } from '@seo/core';
import { PAGE_TYPE } from './labels';

/** 5.1 Page inventory (team): every audited page and sitemap-only page, with its topic and current Search Console queries. */
export function Inventory({ ws, pages }: { ws: MappingWorkspace; pages: ReportPage[] }) {
  const rows = pageInventory(ws, pages);
  if (!rows.length) return null;
  const unmapped = rows.filter((r) => r.checked && !r.topics.length).length;
  return (
    <details className="rounded-card border border-border bg-surface p-5">
      <summary className="cursor-pointer font-display text-lg font-bold">
        Page inventory <span className="text-sm font-normal text-ink-2">· {rows.length} pages{unmapped ? `, ${unmapped} checked pages without a topic` : ''}</span>
      </summary>
      <div className="relative mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-ink-2">
              <th scope="col" className="px-2 py-2">Page</th>
              <th scope="col" className="px-2 py-2">Title and H1</th>
              <th scope="col" className="px-2 py-2 text-right">Words</th>
              <th scope="col" className="px-2 py-2">Queries now</th>
              <th scope="col" className="px-2 py-2">Topic</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.url} className="border-t border-border align-top">
                <td className="px-2 py-2.5">
                  <span className="break-all font-mono">{pathOf(r.url)}</span>
                  <span className="block text-[12px] text-ink-3">{r.checked ? PAGE_TYPE[r.pageType ?? 'other'] ?? r.pageType : 'In the sitemap, not checked'}</span>
                </td>
                <td className="px-2 py-2.5">
                  {r.title ?? <span className="text-ink-3">—</span>}
                  {r.h1 && r.h1 !== r.title && <span className="block text-[12px] text-ink-2">H1: {r.h1}</span>}
                </td>
                <td className="px-2 py-2.5 text-right tabular">{r.words?.toLocaleString('en-US') ?? '—'}</td>
                <td className="px-2 py-2.5 text-ink-2">{r.queries.slice(0, 3).join(', ') || '—'}</td>
                <td className="px-2 py-2.5">{r.topics.join(', ') || <span className="text-ink-3">None</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
