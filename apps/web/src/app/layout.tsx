import type { ReactNode } from 'react';
import '@fontsource/noto-sans-devanagari/400.css';
import '../styles.css';
import '../platform/portal.css';
export const metadata = { title: 'Pran Rekha', description: 'Synthetic patient record and emergency access demonstration' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
