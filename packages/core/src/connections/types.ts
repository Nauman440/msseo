/**
 * Site connections (spec §16.5): a client's WordPress or Shopify site connected to MS SCORE so an
 * approved action's changes can be applied, checked on the live page and undone.
 */
export type SitePlatform = 'wordpress' | 'shopify';

export type SiteConnection = {
  domain: string;
  platform: SitePlatform;
  /** WordPress: the site URL; Shopify: https://<store>.myshopify.com */
  siteUrl: string;
  /** WordPress user login, or the store's myshopify domain. */
  account: string;
  /** Encrypted JSON (encryptSecret): WordPress { password }, Shopify { accessToken, refreshToken, expiresAt }. */
  secret: string;
  scopes: string | null;
  /** WordPress: the MS SCORE Connector plugin, when installed (version, SEO plugin it writes to). */
  plugin: { version: string; seo: string } | null;
  status: 'ok' | 'error';
  error: string | null;
  connectedAt: string;
  connectedBy: string;
  checkedAt: string;
};

/** `signingKey`: the key the Connector plugin (1.1.0+) checks request signatures with. */
export type WordPressSecret = { password: string; signingKey?: string };
export type ShopifySecret = { accessToken: string; refreshToken: string | null; expiresAt: string | null };

/** A page on the connected site, as the platform sees it. */
export type SiteResource = {
  id: string;
  /** post, page, product, collection, article… */
  kind: string;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  editUrl: string | null;
};

/** What every platform must be able to do (one adapter per platform). */
export type SiteAdapter = {
  platform: SitePlatform;
  find(url: string): Promise<SiteResource | null>;
  setSeo(r: SiteResource, v: { title?: string; description?: string }): Promise<void>;
  setTitle(r: SiteResource, title: string): Promise<void>;
  createRedirect(fromPath: string, toPath: string): Promise<string>;
  deleteRedirect(id: string): Promise<void>;
  createDraft(p: { path: string; title: string; seoTitle: string; description: string; html: string }): Promise<{ id: string; editUrl: string | null }>;
  deleteDraft(id: string): Promise<void>;
};

/** Result of applying one change, kept on the action for undo and the record. */
export type ChangeResult = {
  id: string;
  label: string;
  status: 'applied' | 'manual' | 'failed' | 'undone';
  note: string;
  /** The page this change was made on, when it is not the action's first page (site-wide batches). */
  url?: string;
  /** What was there before (for undo), and what the change touched. */
  before?: string | null;
  ref?: string | null;
  /** The live page shows the new value (checked after applying). */
  visible?: boolean | null;
};

export type ApplyRecord = { at: string; by: string; platform: SitePlatform; results: ChangeResult[]; undoneAt?: string | null };
