"use client";

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FiArrowRight, FiCheck, FiCrosshair, FiPhone, FiTool, FiZap } from 'react-icons/fi';

const HIDDEN_ROUTES = ['/employee-login', '/admin-login', '/privacy', '/terms', '/knowledge-test', '/rpm-calculator', '/unit-converter'];

const JOBS = [
  { eyebrow: 'Production cutting', title: 'Concrete & rebar', copy: 'Match bond, segment and horsepower to cured concrete, hard aggregate and reinforced cuts.', href: '/applications/concrete-cutting', image: '/images/hero/hero_blade.jpg', icon: FiCrosshair },
  { eyebrow: 'Abrasive materials', title: 'Asphalt & green concrete', copy: 'Protect the core and maintain segment life in slurry, sand and highly abrasive applications.', href: '/applications/asphalt-cutting', image: '/images/saw_blade.jpg', icon: FiZap },
  { eyebrow: 'Penetrations', title: 'Core drilling', copy: 'Select diameter, barrel length, connection and wet or dry configuration for cleaner holes.', href: '/applications/core-drilling', image: '/images/core_bit.png', icon: FiTool },
];

export function PublicSalesSections() {
  const pathname = usePathname();
  if (HIDDEN_ROUTES.some((route) => pathname.startsWith(route))) return null;

  return (
    <div className="public-sales-layer">
      <section className="public-job-paths" aria-labelledby="choose-by-job">
        <Image className="public-job-mark" src="/images/brand/logo-system/titan-mark-light.png" alt="" width={470} height={760} aria-hidden="true" />
        <div className="relative z-10 mx-auto max-w-7xl px-6 py-20">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <span className="public-kicker">Start with the material—not a guess</span>
              <h2 id="choose-by-job" className="mt-5 text-3xl font-black uppercase leading-none tracking-[-.04em] sm:text-5xl">Choose the tool by the job.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-neutral-400">Diamond tooling performs as a system. Material, aggregate, saw power, depth, cooling and production goals all affect the right specification.</p>
            </div>
            <Link href="/blade-finder" className="public-inline-link">Use the blade finder <FiArrowRight /></Link>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {JOBS.map(({ eyebrow, title, copy, href, image, icon: Icon }) => (
              <Link key={title} href={href} className="public-job-card group">
                <Image className="public-job-image" src={image} alt="" fill sizes="(min-width: 1024px) 33vw, 100vw" aria-hidden="true" />
                <div className="public-job-shade" aria-hidden="true" />
                <div className="public-job-icon"><Icon /></div>
                <div><span>{eyebrow}</span><h3>{title}</h3><p>{copy}</p></div>
                <FiArrowRight className="public-job-arrow" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="public-buying-guide" aria-label="Titan buying advantages">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[.2em] text-orange-400">Less downtime. Better cost per cut.</span>
            <h2 className="mt-3 text-3xl font-black uppercase tracking-tight sm:text-4xl">Buy performance, not just a blade.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-400">The lowest purchase price can become the most expensive tool on the truck. Titan helps contractors evaluate cut speed, usable segment life, operator time and jobsite conditions before ordering.</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {['Application-matched specifications', 'Real product images and current SKUs', 'Direct access to diamond-tool support', 'Volume and contractor quote options'].map((item) => <div key={item} className="public-proof"><FiCheck /> {item}</div>)}
            </div>
          </div>
          <div className="public-tech-card">
            <Image src="/images/brand/logo-system/titan-wordmark-light.png" alt="Titan Diamond USA" width={810} height={304} className="h-12 w-auto max-w-full object-contain" />
            <p className="mt-6 text-xs font-bold uppercase tracking-widest text-neutral-500">Have these five details ready</p>
            <ol className="mt-4 grid grid-cols-5 gap-2" aria-label="Blade matching information">
              {['Saw', 'Material', 'Depth', 'Wet / dry', 'Daily footage'].map((item, index) => <li key={item}><b>{index + 1}</b><span>{item}</span></li>)}
            </ol>
            <a href="tel:14804702577" className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-black hover:bg-orange-400"><FiPhone /> Call (480) 470-2577</a>
          </div>
        </div>
      </section>
    </div>
  );
}
