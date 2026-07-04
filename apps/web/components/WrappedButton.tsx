'use client';

import { useState } from 'react';
import { apiGet } from '../lib/api';

interface Wrapped {
  month: string;
  activeDays: number;
  requests: number;
  tokens: number;
  deepSessions: number;
  bestStreak: number;
  xpEarned: number;
  moments: number;
  topModels: Array<{ model: string; days: number }>;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function compact(value: number): string {
  return Intl.NumberFormat('en', { notation: 'compact' }).format(value);
}

/** 9:16 monthly Wrapped card — same canvas approach as the rank card. */
function drawWrapped(wrapped: Wrapped, handle: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, 1080, 1920);
  const glow = ctx.createRadialGradient(540, 480, 60, 540, 480, 820);
  glow.addColorStop(0, 'rgba(224,93,79,0.30)');
  glow.addColorStop(1, 'rgba(224,93,79,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1080, 1920);

  // the rank crest, small, top center
  const crest = (x: number, y: number, s: number) => {
    ctx.fillStyle = '#d8452f';
    ctx.beginPath();
    ctx.roundRect(x, y, s, s, s * 0.2);
    ctx.fill();
    ctx.fillStyle = '#f4eddb';
    for (const [i, w] of [0.46, 0.34, 0.22].entries()) {
      ctx.beginPath();
      ctx.roundRect(x + s * 0.27, y + s * (0.3 + i * 0.16), s * w, s * 0.09, s * 0.045);
      ctx.fill();
    }
  };
  crest(492, 200, 96);

  const [year, monthIndex] = wrapped.month.split('-');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9aa3ad';
  ctx.font = '600 44px system-ui, sans-serif';
  ctx.fillText(`@${handle}`, 540, 400);
  ctx.fillStyle = '#e6e8eb';
  ctx.font = '800 96px system-ui, sans-serif';
  ctx.fillText(
    `${MONTHS[Number(monthIndex) - 1] ?? wrapped.month} ${year}`.toUpperCase(),
    540,
    520,
  );
  ctx.fillStyle = '#e05d4f';
  ctx.font = '700 46px system-ui, sans-serif';
  ctx.fillText('wrapped', 540, 590);

  const rows: Array<[string, string]> = [
    [String(wrapped.activeDays), 'active days'],
    [compact(wrapped.requests), 'requests'],
    [compact(wrapped.tokens), 'tokens'],
    [`+${compact(wrapped.xpEarned)}`, 'XP earned'],
    [String(wrapped.bestStreak), 'best streak'],
  ];
  rows.forEach(([value, label], index) => {
    const y = 780 + index * 170;
    ctx.fillStyle = '#e6e8eb';
    ctx.font = '800 92px system-ui, sans-serif';
    ctx.fillText(value, 540, y);
    ctx.fillStyle = '#5c6670';
    ctx.font = '600 36px system-ui, sans-serif';
    ctx.fillText(label, 540, y + 52);
  });

  if (wrapped.topModels[0]) {
    ctx.fillStyle = '#9aa3ad';
    ctx.font = '600 38px system-ui, sans-serif';
    ctx.fillText(
      `most used: ${wrapped.topModels[0].model.split('/')[1] ?? wrapped.topModels[0].model}`,
      540,
      1680,
    );
  }
  ctx.fillStyle = '#5c6670';
  ctx.font = '600 40px system-ui, sans-serif';
  ctx.fillText('kaiden.social', 540, 1800);
  return canvas;
}

export function WrappedButton({ handle }: { handle: string }) {
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      const wrapped = await apiGet<Wrapped>('/v1/me/wrapped');
      if (wrapped.activeDays === 0) return;
      const canvas = drawWrapped(wrapped, handle);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      const file = new File([blob], `kaiden-wrapped-${wrapped.month}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Kaiden Wrapped' });
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      /* cancelled */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="btn" onClick={share} disabled={busy}>
      {busy ? 'Rendering…' : 'This month, wrapped'}
    </button>
  );
}
