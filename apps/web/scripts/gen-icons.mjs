/**
 * Generates the PWA icons (belt-rank bars motif — pure geometry, no text so
 * resvg needs no fonts). Run once, commit the PNGs:
 *   node scripts/gen-icons.mjs
 */
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

function iconSvg(size) {
  const s = size / 512;
  const bar = (y, fill) =>
    `<rect x="${128 * s}" y="${y * s}" width="${256 * s}" height="${52 * s}" rx="${26 * s}" fill="${fill}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${100 * s}" fill="#0b0d10"/>
  <rect x="${8 * s}" y="${8 * s}" width="${(512 - 16) * s}" height="${(512 - 16) * s}" rx="${92 * s}" fill="none" stroke="#262d36" stroke-width="${4 * s}"/>
  ${bar(160, '#e6e8eb')}
  ${bar(230, '#e05d4f')}
  ${bar(300, '#c9a227')}
</svg>`;
}

for (const [file, size] of [
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['public/apple-touch-icon.png', 180],
]) {
  const png = new Resvg(iconSvg(size)).render().asPng();
  writeFileSync(new URL(`../${file}`, import.meta.url), png);
  console.log(`${file} (${size}px, ${png.length} bytes)`);
}
