"use client"
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { FiArrowRight, FiChevronDown, FiMenu, FiX } from 'react-icons/fi'

const groups = [
  { title: 'Products', links: [['All products', '/shop'], ['Signature Series', '/signature-series'], ['Saw blades', '/shop?q=blade'], ['Core bits', '/shop?q=core'], ['Turbo blades', '/shop?q=turbo'], ['Cup wheels', '/shop?q=cup'], ['Polishing tools', '/shop?q=polishing']] },
  { title: 'Applications', links: [['Concrete cutting', '/applications/concrete-cutting'], ['Asphalt & green concrete', '/applications/asphalt-cutting'], ['Core drilling', '/applications/core-drilling'], ['Surface preparation', '/applications/surface-prep']] },
  { title: 'Resources', links: [['Catalog & product sheets', '/resources'], ['Technical information', '/technical-information'], ['Blade finder', '/blade-finder'], ['Compare blades', '/blade-comparator'], ['RPM calculator', '/rpm-calculator'], ['Unit converter', '/unit-converter'], ['Knowledge quiz', '/knowledge-test']] },
  { title: 'Company', links: [['About Titan', '/about'], ['Contact sales', '/contact'], ['Careers', '/careers']] },
]
export function HeaderNav() {
  const pathname = usePathname()
  return <HeaderMenu key={pathname} />
}
function HeaderMenu() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const header = useRef<HTMLElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) { setOpen(null); setMobileOpen(false) } }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])
  const close = () => { setOpen(null); setMobileOpen(false) }
  return <header ref={header} className="store-header z-sticky" onKeyDown={event => { if (event.key === 'Escape') { const trigger = mobileOpen ? toggle.current : event.currentTarget.querySelector<HTMLButtonElement>('button[aria-expanded="true"]'); close(); trigger?.focus() } }}>
    <div className="store-nav-wrap"><Link href="/" aria-label="Titan Diamond USA home" className="store-logo" onClick={close}><Image src="/images/brand/logo-system/titan-wordmark-light.png" alt="Titan Diamond USA" width={810} height={304} priority /></Link>
      <nav aria-label="Main navigation" className={`store-nav ${mobileOpen ? 'is-open' : ''}`}>
        {groups.map(group => <div className="store-nav-group" key={group.title} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(current => current === group.title ? null : current) }}><button type="button" aria-expanded={open === group.title} aria-controls={`store-nav-${group.title}`} onClick={() => setOpen(open === group.title ? null : group.title)}>{group.title}<FiChevronDown /></button>{open === group.title && <div className="store-nav-dropdown" id={`store-nav-${group.title}`}>{group.links.map(([label, href]) => <Link key={href} href={href} onClick={close}>{label}<FiArrowRight /></Link>)}</div>}</div>)}
        <Link href="/login" className="store-mobile-login" onClick={close}>Contractor login <FiArrowRight /></Link>
      </nav>
      <div className="store-nav-actions"><Link href="/login" className="store-desktop-login">Log in</Link><Link href="/contact" className="store-nav-quote" onClick={close}>Get a quote <FiArrowRight /></Link><button ref={toggle} type="button" className="store-menu-toggle" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileOpen} onClick={() => { setMobileOpen(!mobileOpen); setOpen(null) }}>{mobileOpen ? <FiX /> : <FiMenu />}</button></div>
    </div>
  </header>
}
