"use client";

import { usePathname } from 'next/navigation';
import type { CSSProperties } from 'react';

const HIDDEN = ['/employee-login', '/admin-login', '/privacy', '/terms'];

function heroScene(pathname: string) {
  if (pathname.startsWith('/signature-series')) return { image: '/images/signature/warrior-blades.png', position: '72% 42%', scene: 'signature' };
  if (pathname.startsWith('/applications/core-drilling')) return { image: '/images/core_bit.png', position: '76% 46%', scene: 'core' };
  if (pathname.startsWith('/applications/surface-prep')) return { image: '/images/tuck_point.jpg', position: '78% 48%', scene: 'surface' };
  if (pathname.startsWith('/applications')) return { image: '/images/value-props/box_contractor.jpg', position: '68% 54%', scene: 'applications' };
  if (pathname.startsWith('/blade-finder')) return { image: '/images/cup_wheel.png', position: '78% 46%', scene: 'finder' };
  if (pathname.startsWith('/blade-comparator')) return { image: '/images/polishing_pads.png', position: '76% 48%', scene: 'compare' };
  if (pathname.startsWith('/shop')) return { image: '/images/intro-offer/patriot-blade-2.png', position: '80% 48%', scene: 'catalog' };
  if (pathname.startsWith('/resources')) return { image: '/images/saw_blade.jpg', position: '78% 46%', scene: 'resources' };
  if (pathname.startsWith('/rpm-calculator')) return { image: '/images/turbo_blade.png', position: '78% 46%', scene: 'rpm' };
  if (pathname.startsWith('/unit-converter')) return { image: '/images/continuous_rim_blade.png', position: '78% 46%', scene: 'converter' };
  if (pathname.startsWith('/knowledge-test')) return { image: '/images/signature/spartan-collection.png', position: '78% 46%', scene: 'knowledge' };
  if (pathname.startsWith('/about')) return { image: '/images/value-props/box_laser_weld.jpg', position: '72% 48%', scene: 'about' };
  if (pathname.startsWith('/careers')) return { image: '/images/value-props/box_contractor.jpg', position: '66% 52%', scene: 'careers' };
  if (pathname.startsWith('/contact')) return { image: '/images/value-props/box_shipping.jpg', position: '72% 48%', scene: 'contact' };
  if (pathname === '/') return { image: '/images/hero/hero_blade.jpg', position: '72% 50%', scene: 'home' };
  return { image: '/images/signature/fiery-helmet.png', position: '78% 48%', scene: 'default' };
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
