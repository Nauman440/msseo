import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'MSScore by Morosoft',
    short_name: 'MSScore',
    description: 'SEO audits for the Morosoft team.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0F1B2D',
    theme_color: '#0F1B2D',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [{ name: 'New audit', url: '/audits/new', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] }],
  };
}
