'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';
import { FeedIcon, PlusIcon, RanksIcon, StatsIcon, ToriiIcon } from './icons';

type Tab = {
  href: string;
  Icon: ComponentType<{ size?: number }>;
  label: string;
  accent?: boolean;
};

const TABS: Tab[] = [
  { href: '/feed', Icon: FeedIcon, label: 'Feed' },
  { href: '/ranks', Icon: RanksIcon, label: 'Ranks' },
  { href: '/post/new', Icon: PlusIcon, label: 'Post', accent: true },
  { href: '/home', Icon: StatsIcon, label: 'Stats' },
  { href: '/connect', Icon: ToriiIcon, label: 'Connect' },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar">
      {TABS.map(({ href, Icon, label, accent }) => (
        <Link
          key={href}
          href={href}
          className={pathname === href ? 'active' : ''}
          aria-label={label}
        >
          <span style={accent ? { color: 'var(--accent)' } : undefined}>
            <Icon size={23} />
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );
}
