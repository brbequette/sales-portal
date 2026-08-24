"use client";

import { usePathname } from 'next/navigation';
import type { CSSProperties } from 'react';

const HIDDEN = ['/employee-login', '/admin-login', '/privacy', '/terms'];

function heroScene(pathname: string) {
  if (pathname.startsWith('/signature-series')) return { image: '/images/hero/field-series/signature-series.jpg', position: '68% 46%', scene: 'signature' };
  if (pathname.startsWith('/applications/core-drilling')) return { image: '/images/hero/field-series/core-drilling.jpg', position: '68% 46%', scene: 'core' };
  if (pathname.startsWith('/applications/surface-prep')) return { image: '/images/hero/field-series/surface-prep.jpg', position: '70% 48%', scene: 'surface' };
  if (pathname.startsWith('/applications')) return { image: '/images/hero/field-series/concrete-cutting.jpg', position: '70% 50%', scene: 'applications' };
  if (pathname.startsWith('/blade-finder')) return { image: '/images/hero/field-series/blade-finder.jpg', position: '70% 46%', scene: 'finder' };
  if (pathname.startsWith('/blade-comparator')) return { image: '/images/hero/field-series/blade-comparator.jpg', position: '70% 48%', scene: 'compare' };
  if (pathname.startsWith('/shop')) return { image: '/images/hero/field-series/catalog.jpg', position: '70% 48%', scene: 'catalog' };
  if (pathname.startsWith('/resources')) return { image: '/images/hero/field-series/resources.jpg', position: '68% 46%', scene: 'resources' };
  if (pathname.startsWith('/rpm-calculator')) return { image: '/images/hero/field-series/rpm-calculator.jpg', position: '70% 46%', scene: 'rpm' };
  if (pathname.startsWith('/unit-converter')) return { image: '/images/hero/field-series/unit-converter.jpg', position: '70% 46%', scene: 'converter' };
  if (pathname.startsWith('/knowledge-test')) return { image: '/images/hero/field-series/knowledge-test.jpg', position: '68% 46%', scene: 'knowledge' };
  if (pathname.startsWith('/about')) return { image: '/images/hero/field-series/about.jpg', position: '68% 48%', scene: 'about' };
  if (pathname.startsWith('/careers')) return { image: '/images/hero/field-series/careers.jpg', position: '68% 48%', scene: 'careers' };
  if (pathname.startsWith('/contact')) return { image: '/images/hero/field-series/contact.jpg', position: '68% 48%', scene: 'contact' };
  if (pathname === '/') return { image: '/images/hero/hero_blade.jpg', position: '72% 50%', scene: 'home' };
  return { image: '/images/hero/field-series/default.jpg', position: '70% 48%', scene: 'default' };
}

export function PublicHeroAtmosphere() {
  const pathname = usePathname();
  if (HIDDEN.some((route) => pathname.startsWith(route))) return null;
  const scene = heroScene(pathname);
  return <div className={`public-route-hero public-route-hero--${scene.scene}`} aria-hidden="true" style={{ '--route-hero-image': `url("${scene.image}")`, '--route-hero-position': scene.position } as CSSProperties}>
    <div className="public-route-hero-image" />
    <div className="public-route-hero-flag" />
    <div className="public-route-hero-dust" />
    <div className="public-route-hero-mark" />
    <div className="public-route-hero-beam" />
  </div>;
}
