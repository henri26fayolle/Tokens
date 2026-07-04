'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/feed', icon: '📜', label: 'Feed' },
  { href: '/ranks', icon: '🏔️', label: 'Ranks' },
  { href: '/post/new', icon: '➕', label: 'Post', accent: true },
  { href: '/home', icon: '📊', label: 'Stats' },
  { href: '/connect', icon: '⛩️', label: 'Connect' },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={pathname === tab.href ? 'active' : ''}
          aria-label={tab.label}
        >
          <span style={tab.accent ? { color: 'var(--accent)' } : undefined}>{tab.icon}</span>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
