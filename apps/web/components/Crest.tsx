/**
 * The Kaiden logo — the rank crest (ascending dan bars). Same geometry as
 * scripts/gen-icons.mjs and app/icon.svg; change all three together.
 */
export function Crest({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label="Kaiden"
      style={{ display: 'block' }}
    >
      <rect width="512" height="512" rx="104" fill="#d8452f" />
      <rect
        x="36"
        y="36"
        width="440"
        height="440"
        rx="72"
        fill="none"
        stroke="#f4eddb"
        strokeWidth="18"
      />
      <rect x="140" y="152" width="236" height="46" rx="23" fill="#f4eddb" />
      <rect x="140" y="233" width="172" height="46" rx="23" fill="#f4eddb" />
      <rect x="140" y="314" width="112" height="46" rx="23" fill="#f4eddb" />
    </svg>
  );
}
