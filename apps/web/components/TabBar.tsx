'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar">
      <Link href="/feed" className={pathname === '/feed' ? 'active' : ''}>
        <span>📜</span>
        Feed
      </Link>
      <Link
        href="/post/new"
        className={pathname === '/post/new' ? 'active' : ''}
        aria-label="New post"
      >
        <span style={{ color: 'var(--accent)' }}>➕</span>
        Post
      </Link>
      <Link href="/home" className={pathname === '/home' ? 'active' : ''}>
        <span>📊</span>
        Stats
      </Link>
      <Link href="/connect" className={pathname === '/connect' ? 'active' : ''}>
        <span>⛩️</span>
        Connect
      </Link>
    </nav>
  );
}
