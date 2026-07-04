'use client';

import { useMemo, useState } from 'react';
import type { StatsDay } from '../lib/api';

interface Props {
  days: StatsDay[];
}

interface DayPoint {
  day: string;
  label: string;
  requests: number;
  tokens: number;
  xp: number;
  isToday: boolean;
}

const DAY_COUNT = 14;
const BAR = 16;
const GAP = 8; // ≥2px surface gap between adjacent bars
const PLOT_H = 110;
const W = DAY_COUNT * (BAR + GAP) - GAP;

/** Rounded top (4px data-end), square base anchored to the baseline. */
function barPath(x: number, y: number, height: number): string {
  const r = Math.min(4, height);
  const bottom = PLOT_H;
  return [
    `M ${x} ${bottom}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + BAR - r} ${y}`,
    `Q ${x + BAR} ${y} ${x + BAR} ${y + r}`,
    `L ${x + BAR} ${bottom}`,
    'Z',
  ].join(' ');
}

export function ActivityChart({ days }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo<DayPoint[]>(() => {
    const byDay = new Map(days.map((d) => [d.day, d]));
    const out: DayPoint[] = [];
    const now = new Date();
    for (let i = DAY_COUNT - 1; i >= 0; i -= 1) {
      const date = new Date(now.getTime() - i * 86_400_000);
      const key = date.toISOString().slice(0, 10);
      const row = byDay.get(key);
      out.push({
        day: key,
        label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        requests: row?.requestCount ?? 0,
        tokens: (row?.promptTokens ?? 0) + (row?.completionTokens ?? 0),
        xp: row?.usageXpAwarded ?? 0,
        isToday: i === 0,
      });
    }
    return out;
  }, [days]);

  const max = Math.max(1, ...points.map((p) => p.requests));
  const hovered = hover === null ? null : points[hover];

  return (
    <div style={{ position: 'relative' }}>
      <div className="muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
        Requests · last 14 days
      </div>
      <svg
        viewBox={`0 0 ${W} ${PLOT_H + 18}`}
        style={{ width: '100%', display: 'block' }}
        role="img"
        aria-label="Daily request counts for the last 14 days"
      >
        <line x1={0} y1={PLOT_H} x2={W} y2={PLOT_H} stroke="var(--border)" strokeWidth={1} />
        {points.map((point, index) => {
          const x = index * (BAR + GAP);
          const height = Math.round((point.requests / max) * (PLOT_H - 16));
          const y = PLOT_H - height;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: hover hit-target per mark
            <g
              key={point.day}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
              onTouchStart={() => setHover(index)}
            >
              {/* hit target larger than the mark */}
              <rect x={x - GAP / 2} y={0} width={BAR + GAP} height={PLOT_H} fill="transparent" />
              {point.requests > 0 && (
                <path
                  d={barPath(x, y, height)}
                  fill="var(--accent)"
                  opacity={hover === null || hover === index ? 1 : 0.45}
                />
              )}
              {/* selective direct label: today only */}
              {point.isToday && point.requests > 0 && (
                <text
                  x={x + BAR / 2}
                  y={y - 5}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill="var(--ink)"
                >
                  {point.requests}
                </text>
              )}
            </g>
          );
        })}
        <text x={0} y={PLOT_H + 13} fontSize={9} fill="var(--ink-3)">
          {points[0]?.label}
        </text>
        <text x={W} y={PLOT_H + 13} textAnchor="end" fontSize={9} fill="var(--ink-3)">
          Today
        </text>
      </svg>
      {hovered && (
        <div
          style={{
            position: 'absolute',
            top: 18,
            left: `${(points.indexOf(hovered) / DAY_COUNT) * 100}%`,
            transform: points.indexOf(hovered) > DAY_COUNT / 2 ? 'translateX(-100%)' : undefined,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 12,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 700 }}>{hovered.label}</div>
          <div className="muted">
            {hovered.requests} requests · {Intl.NumberFormat().format(hovered.tokens)} tokens
          </div>
          <div className="muted">{hovered.xp} usage XP</div>
        </div>
      )}
    </div>
  );
}
