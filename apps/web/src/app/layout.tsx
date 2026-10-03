import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import '@fontsource/noto-sans-devanagari/400.css';
import '../styles.css';
import '../platform/portal.css';
export const metadata: Metadata = {
  title: 'Pran Rekha',
  description: 'Synthetic patient record and emergency access demonstration',
  applicationName: 'Pran Rekha',
  appleWebApp: { capable: true, title: 'Pran Rekha', statusBarStyle: 'default' },
  icons: { icon: '/icons/favicon-32.png', apple: '/icons/apple-touch-icon.png' }
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#dc143c' }, { media: '(prefers-color-scheme: dark)', color: '#0f172a' }]
};
const themeScript="try{if(localStorage.getItem('pran-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}";
export default function RootLayout({ children }: { children: ReactNode }) {
  // Applies a remembered dark choice before first paint; light is the default.
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeScript}}/></head><body>{children}</body></html>;
}
