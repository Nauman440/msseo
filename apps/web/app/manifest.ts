import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Morosoft SEO Audit',
    short_name: 'MS Audit',
    description: 'Technical and on-page SEO audits for the Morosoft Technologies team.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0D0817',
    theme_color: '#0D0817',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [{ name: 'New audit', url: '/audits/new', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] }],
  };
}
