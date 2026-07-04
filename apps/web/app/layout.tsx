import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Kaiden',
  description: 'Strava for AI users — earn XP, climb the kyū/dan ranks, share what you build.',
};

export const viewport: Viewport = {
  themeColor: '#0b0d10',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#0b0d10',
          color: '#e6e8eb',
          minHeight: '100vh',
        }}
      >
        {children}
      </body>
    </html>
  );
}
