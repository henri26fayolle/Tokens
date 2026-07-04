import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { RegisterSw } from '../components/RegisterSw';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kaiden',
  description: 'Strava for AI users — earn XP, climb the kyū/dan ranks, share what you build.',
  manifest: '/manifest.webmanifest',
  icons: { apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Kaiden' },
};

export const viewport: Viewport = {
  themeColor: '#0b0d10',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RegisterSw />
        {children}
      </body>
    </html>
  );
}
