/**
 * The key every website's data is stored under (workspaces, connections, Google choices, audits'
 * project, files, addresses like /keywords/<key> and ?site=<key>).
 *
 * A website at the root of its domain is keyed by its host (lower case, without "www."), as it always
 * was, so its data stays where it is. A website in a folder of a domain (a WordPress install at
 * example.com/srm/ next to another at example.com/elementor/) is its own website: its key adds the
 * folder after "~", e.g. "example.com~srm" ("~" never appears in a host name and is safe in addresses,
 * file names and database keys). An address counts as a folder only when its path ends in "/", which
 * is how website addresses are saved (`websiteAddress()`); a page address keeps the host key.
 */
const parse = (input: string): URL | null => {
  try {
    return new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
};
const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');

/** The site key of a website address, or of a key (returned as it is). '' when unreadable. */
export function siteKey(input: string): string {
  const raw = input.trim().toLowerCase();
  if (raw && !raw.includes('/') && !raw.includes(':')) return bareHost(raw); // already a key or a bare host
  const u = parse(input);
  if (!u) return '';
  const host = bareHost(u.hostname);
  if (!u.pathname.endsWith('/')) return host;
  const folder = u.pathname
    .split('/')
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s).toLowerCase();
      } catch {
        return s.toLowerCase();
      }
    });
  return folder.length ? `${host}~${folder.join('~')}` : host;
}

/** The host of a site key (what DataForSEO, Google and DNS know the website by). */
export const siteHost = (key: string): string => bareHost(key.split('~')[0] ?? '');

/** The folder of a site key ('' at the root), e.g. "srm" or "shop/en". */
export const siteFolder = (key: string): string => key.split('~').slice(1).join('/');

/** The website's own address for a key: https://host/ or https://host/folder/. */
export const siteUrl = (key: string): string => {
  const folder = siteFolder(key);
  return `https://${siteHost(key)}/${folder ? `${folder}/` : ''}`;
};

/** Whether an address belongs to the website with this key (same host, and inside its folder). */
export function inSite(url: string, key: string): boolean {
  const u = parse(url);
  if (!u || bareHost(u.hostname) !== siteHost(key)) return false;
  const folder = siteFolder(key);
  if (!folder) return true;
  const path = u.pathname.toLowerCase();
  return path === `/${folder}` || path.startsWith(`/${folder}/`);
}

/** A key as people read it: "example.com" or "example.com/srm". */
export const siteLabel = (key: string): string => (siteFolder(key) ? `${siteHost(key)}/${siteFolder(key)}` : siteHost(key));
