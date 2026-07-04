'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar">
      <Link href="/home" className={pathname === '/home' ? 'active' : ''}>
        <span>🏠</span>
        Home
      </Link>
      <Link href="/connect" className={pathname === '/connect' ? 'active' : ''}>
        <span>⛩️</span>
        Connect
      </Link>
    </nav>
  );
}
