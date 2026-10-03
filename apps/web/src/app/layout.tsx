import type { ReactNode } from 'react';
import '@fontsource/noto-sans-devanagari/400.css';
import '../styles.css';
import '../platform/portal.css';
export const metadata = { title: 'Pran Rekha', description: 'Synthetic patient record and emergency access demonstration' };
const themeScript="try{if(localStorage.getItem('pran-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}";
export default function RootLayout({ children }: { children: ReactNode }) {
  // Applies a remembered dark choice before first paint; light is the default.
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeScript}}/></head><body>{children}</body></html>;
}
