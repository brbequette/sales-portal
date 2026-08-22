"use client";

import { useEffect, useRef } from 'react';
import { useTheme } from './ThemeProvider';

export function SparkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth || window.innerWidth;
      height = canvas.height = canvas.parentElement.clientHeight || window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    const numParticles = 45;
    const particles = Array.from({ length: numParticles }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2.5 + 0.5,
      speedX: (Math.random() - 0.5) * 1.2,
      speedY: -(Math.random() * 1.5 + 0.5),
      color: Math.random() > 0.3 ? `rgba(249, 115, 22, ${Math.random() * 0.7 + 0.3})` : `rgba(245, 158, 11, ${Math.random() * 0.8 + 0.2})`,
      shadowColor: '#f97316',
      alpha: Math.random() * 0.8 + 0.2,
      decay: Math.random() * 0.015 + 0.005,
      drift: Math.random() * Math.PI * 2,
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p) => {
        p.x += p.speedX;
        p.x += Math.sin(p.drift + p.y * 0.008) * 0.16;
        p.y += p.speedY;
        p.alpha -= p.decay;

        if (p.y < 0 || p.alpha <= 0) {
          p.x = Math.random() * width;
          p.y = height + 10;
          p.alpha = Math.random() * 0.8 + 0.2;
          p.speedY = -(Math.random() * 1.5 + 0.5);
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 12;
        ctx.shadowColor = p.shadowColor;
        ctx.fill();
        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [theme]);

  return (
    <canvas 
      ref={canvasRef} 
      aria-hidden="true"
      className="spark-canvas absolute inset-0 pointer-events-none z-0 opacity-60 transition-opacity duration-500"
    />
  );
}
