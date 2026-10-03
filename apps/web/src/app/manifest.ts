import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Pran Rekha',
    short_name: 'Pran Rekha',
    description: 'Synthetic patient record and emergency access demonstration',
    start_url: '/patient',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f8fafc',
    theme_color: '#0d9488',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ],
    shortcuts: [
      { name: 'Paramedic', url: '/paramedic' },
      { name: 'Hospital', url: '/hospital' },
      { name: 'Lab', url: '/lab' }
    ]
  };
}
