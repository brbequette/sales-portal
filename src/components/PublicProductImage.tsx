"use client";

import { useEffect, useRef, useState } from 'react';

type Props = { src: string; alt: string; className?: string };

export function PublicProductImage({ src, alt, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [processed, setProcessed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProcessed(false);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled || !canvasRef.current) return;
      const sample = document.createElement('canvas');
      const max = 1100;
      const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
      sample.width = Math.max(1, Math.round(image.naturalWidth * scale));
      sample.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = sample.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, sample.width, sample.height);
      try {
        const pixels = context.getImageData(0, 0, sample.width, sample.height);
        const data = pixels.data;
        let left = sample.width, top = sample.height, right = 0, bottom = 0;
        for (let y = 0; y < sample.height; y += 1) for (let x = 0; x < sample.width; x += 1) {
          const i = (y * sample.width + x) * 4;
          const min = Math.min(data[i], data[i + 1], data[i + 2]);
          const maxChannel = Math.max(data[i], data[i + 1], data[i + 2]);
          if (min > 232 && maxChannel - min < 24) data[i + 3] = Math.max(0, Math.min(255, (250 - min) * 15));
          if (data[i + 3] > 24) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
        }
        context.putImageData(pixels, 0, 0);
        const canvas = canvasRef.current;
        const output = 900;
        canvas.width = output;
        canvas.height = output;
        const out = canvas.getContext('2d');
        if (!out || right <= left || bottom <= top) return;
        const width = right - left + 1;
        const height = bottom - top + 1;
        const fit = Math.min((output * .86) / width, (output * .86) / height);
        const drawWidth = width * fit;
        const drawHeight = height * fit;
        out.drawImage(sample, left, top, width, height, (output - drawWidth) / 2, (output - drawHeight) / 2, drawWidth, drawHeight);
        if (!cancelled) setProcessed(true);
      } catch { /* Cross-origin images retain the original fallback. */ }
    };
    image.src = src;
    return () => { cancelled = true; };
  }, [src]);

  return <span className={`public-product-cutout ${className}`} role="img" aria-label={alt}>
    {!processed && <img src={src} alt="" aria-hidden="true" />}
    <canvas ref={canvasRef} className={processed ? 'is-ready' : ''} aria-hidden="true" />
  </span>;
}
