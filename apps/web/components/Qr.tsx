'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

export function Qr({ text, size = 168 }: { text: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(text, {
      width: size * 2,
      margin: 1,
      color: { dark: '#e6e8eb', light: '#14181d' },
    })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [text, size]);

  if (!src) return <div style={{ width: size, height: size }} />;
  return (
    // biome-ignore lint/performance/noImgElement: locally generated data URL — next/image adds nothing
    <img
      src={src}
      width={size}
      height={size}
      alt={`QR code for ${text}`}
      style={{ borderRadius: 12, border: '1px solid var(--border)' }}
    />
  );
}
