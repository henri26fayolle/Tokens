/**
 * Kaiden brand icon — THE RANK CREST (ascending dan bars), the approved mark:
 * vermilion seal, cream inner outline, three left-aligned bars reading
 * bottom-up as an ascent. Pure geometry, no fonts. Run once, commit PNGs:
 *   node scripts/gen-icons.mjs
 * Keep in sync with components/Crest.tsx and app/icon.svg.
 */
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

export const SEAL = '#d8452f';
export const CREAM = '#f4eddb';

function crestSvg(size) {
  const s = size / 512;
  const bar = (y, width) =>
    `<rect x="${140 * s}" y="${y * s}" width="${width * s}" height="${46 * s}" rx="${23 * s}" fill="${CREAM}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${104 * s}" fill="${SEAL}"/>
  <rect x="${36 * s}" y="${36 * s}" width="${440 * s}" height="${440 * s}" rx="${72 * s}" fill="none" stroke="${CREAM}" stroke-width="${18 * s}"/>
  ${bar(152, 236)}
  ${bar(233, 172)}
  ${bar(314, 112)}
</svg>`;
}

for (const [file, size] of [
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['public/apple-touch-icon.png', 180],
]) {
  const png = new Resvg(crestSvg(size)).render().asPng();
  writeFileSync(new URL(`../${file}`, import.meta.url), png);
  console.log(`${file} (${size}px, ${png.length} bytes)`);
}
