'use client';

import { useState } from 'react';
import type { Profile } from '../lib/api';

/**
 * 9:16 share card (1080×1920), drawn on canvas client-side — deterministic,
 * dark, no font downloads. navigator.share on mobile, download fallback.
 */
function drawCard(profile: Profile): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, 1080, 1920);

  const glow = ctx.createRadialGradient(540, 700, 60, 540, 700, 900);
  glow.addColorStop(0, 'rgba(224,93,79,0.28)');
  glow.addColorStop(1, 'rgba(224,93,79,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1080, 1920);

  ctx.fillStyle = 'rgba(230,232,235,0.05)';
  ctx.font = '900 560px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('皆伝', 540, 1180);

  ctx.fillStyle = '#9aa3ad';
  ctx.font = '600 44px system-ui, sans-serif';
  ctx.fillText(`@${profile.handle}`, 540, 420);

  ctx.fillStyle = '#e6e8eb';
  ctx.font = '800 170px system-ui, sans-serif';
  ctx.fillText(profile.rank, 540, 780);

  ctx.fillStyle = '#e05d4f';
  ctx.font = '700 54px system-ui, sans-serif';
  ctx.fillText(`Level ${profile.level}`, 540, 880);

  const stats: Array<[string, string]> = [
    [Intl.NumberFormat().format(profile.lifetimeXp), 'lifetime XP'],
    [String(profile.currentStreak), 'day streak'],
    [String(profile.longestStreak), 'best streak'],
  ];
  stats.forEach(([value, label], index) => {
    const x = 200 + index * 340;
    ctx.fillStyle = '#e6e8eb';
    ctx.font = '800 84px system-ui, sans-serif';
    ctx.fillText(value, x, 1420);
    ctx.fillStyle = '#5c6670';
    ctx.font = '600 34px system-ui, sans-serif';
    ctx.fillText(label, x, 1478);
  });

  ctx.fillStyle = '#5c6670';
  ctx.font = '600 40px system-ui, sans-serif';
  ctx.fillText('kaiden.social', 540, 1800);

  return canvas;
}

export function ShareCardButton({ profile }: { profile: Profile }) {
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      const canvas = drawCard(profile);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      const file = new File([blob], 'kaiden-rank.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Kaiden',
          text: `${profile.rank} on Kaiden`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'kaiden-rank.png';
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      /* user cancelled the share sheet */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="btn" onClick={share} disabled={busy}>
      {busy ? 'Rendering…' : 'Share rank card'}
    </button>
  );
}
