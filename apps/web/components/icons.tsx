/**
 * Kaiden's custom icon set — line icons on a 24px grid, drawn in `currentColor`
 * so they inherit link/button state (e.g. the tab bar's active accent) the way
 * emoji never could. Same house style as the Crest logo: rounded joins, warm
 * off-white on dark. Stroke width and grid are fixed here; callers only pick a
 * size. Keep the family coherent — reuse this wrapper for any new glyph.
 */
import type { ReactNode, SVGProps } from 'react';

type IconProps = { size?: number } & Omit<SVGProps<SVGSVGElement>, 'children'>;

function Glyph({
  size = 24,
  children,
  fill = 'none',
  ...rest
}: IconProps & { children: ReactNode; fill?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block' }}
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Feed — a post/scroll with lines of text. */
export function FeedIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="4" y="4.5" width="16" height="15" rx="2.5" />
      <path d="M7.5 9h9" />
      <path d="M7.5 12.5h9" />
      <path d="M7.5 16h5.5" />
    </Glyph>
  );
}

/** Ranks — a mountain range to climb (echoes 皆伝, the summit). */
export function RanksIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M3 20 9 8l4 6 2.5-4L21 20Z" />
      <path d="M9 8l1.6 2.4" />
    </Glyph>
  );
}

/** Post — a plain plus; rendered in the accent color in the tab bar. */
export function PlusIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Glyph>
  );
}

/** Stats — ascending bars, the same rising cadence as the rank crest. */
export function StatsIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 20h16" />
      <rect x="5.5" y="13" width="3.4" height="7" rx="1.1" />
      <rect x="10.3" y="9" width="3.4" height="11" rx="1.1" />
      <rect x="15.1" y="5" width="3.4" height="15" rx="1.1" />
    </Glyph>
  );
}

/** Connect — a torii gate, the threshold into the dojo. */
export function ToriiIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 6.5c3 1.4 13 1.4 16 0" />
      <path d="M6 10h12" />
      <path d="M7.5 7v13" />
      <path d="M16.5 7v13" />
    </Glyph>
  );
}

/** Streak — a flame. */
export function FlameIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z" />
    </Glyph>
  );
}

/** Kudos — a heart; pass `filled` for the liked state. */
export function HeartIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Glyph fill={filled ? 'currentColor' : 'none'} {...props}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
    </Glyph>
  );
}

/** Comments — a speech bubble. */
export function CommentIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" />
    </Glyph>
  );
}

/** Copy — two stacked sheets (copy recipe). */
export function CopyIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="8" y="8" width="13" height="13" rx="2.2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </Glyph>
  );
}

/** Confirmation — a check. */
export function CheckIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Glyph>
  );
}

/** Notifications — a bell. */
export function BellIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Glyph>
  );
}

/** Milestone / first XP — a four-point spark. */
export function SparkIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z" />
    </Glyph>
  );
}

/** External link — an up-right arrow. */
export function ArrowUpRightIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </Glyph>
  );
}

/** Dismiss — an X. */
export function CloseIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </Glyph>
  );
}
