import Link from 'next/link'
import Image from 'next/image'
import { FiArrowRight, FiSearch, FiFileText, FiCrosshair, FiSliders } from 'react-icons/fi'
import { FeaturedSignatureCarousel, type FeaturedSignature } from './FeaturedSignatureCarousel'

const categories = [
  { name: 'Signature blades', note: 'Explore the Titan families', href: '/signature-series', image: '/product-images/cutouts-v2/dragon-formatted.png' },
  { name: 'Saw blades', note: 'Concrete, asphalt & masonry', href: '/shop?q=blade', image: '/images/saw_blade.jpg' },
  { name: 'Core bits', note: 'Choose your drilling setup', href: '/shop?q=core', image: '/images/core_bit.png' },
  { name: 'Turbo blades', note: 'Find your cutting configuration', href: '/shop?q=turbo', image: '/images/turbo_blade.png' },
  { name: 'Cup wheels', note: 'Grinding & surface preparation', href: '/shop?q=cup', image: '/images/cup_wheel.png' },
  { name: 'Polishing tools', note: 'Browse finishing products', href: '/shop?q=polishing', image: '/images/polishing_pads.png' },
]
const jobs = [
  { title: 'Concrete cutting', text: 'Start with the material, saw and cut depth.', href: '/applications/concrete-cutting', image: '/images/hero/field-series/concrete-cutting.jpg' },
  { title: 'Asphalt cutting', text: 'Explore tooling for abrasive applications.', href: '/applications/asphalt-cutting', image: '/images/hero/hero_blade.jpg' },
  { title: 'Core drilling', text: 'Match diameter, connection and drilling method.', href: '/applications/core-drilling', image: '/images/hero/field-series/core-drilling.jpg' },
  { title: 'Surface preparation', text: 'Find grinding and finishing guidance.', href: '/applications/surface-prep', image: '/images/hero/field-series/surface-prep.jpg' },
]

export function PublicStorefront({ blades }: { blades: FeaturedSignature[] }) {
  return <div className="titan-storefront">
    <section className="store-hero" aria-labelledby="store-title">
      <Image src="/images/hero/hero_blade.jpg" alt="Diamond tooling for professional cutting" fill priority sizes="100vw" className="store-hero-image" />
      <div className="store-hero-shade" />
      <div className="store-wrap store-hero-content">
        <p className="store-eyebrow">Titan Diamond USA / Professional diamond tools</p>
        <h1 id="store-title">Your job.<br />The right <span>diamond tool.</span></h1>
        <p className="store-intro">Diamond blades, core bits and surface preparation tools for the work ahead. Find your application, compare configurations and get help choosing the right fit.</p>
        <div className="store-actions"><Link href="#products" className="store-button">Explore products <FiArrowRight /></Link><Link href="/contact" className="store-button store-button-outline">Request a quote</Link></div>
        <a className="store-hero-resource" href="/downloads/titan-contractor-field-guide.pdf" target="_blank" rel="noopener noreferrer"><FiFileText /> Contractor field guide · PDF <FiArrowRight /></a>
      </div>
    </section>
    <section id="products" className="store-wrap store-section" aria-labelledby="product-heading">
      <div className="store-heading"><div><p className="store-eyebrow">Find your tool</p><h2 id="product-heading">Built around the work you do.</h2></div><Link href="/shop" className="store-text-link">View full catalog <FiArrowRight /></Link></div>
      <form action="/shop" method="get" role="search" className="store-search"><FiSearch aria-hidden="true" /><label htmlFor="store-search" className="sr-only">Search the product catalog</label><input id="store-search" name="q" type="search" placeholder="Search by product, size, material or SKU" /><button type="submit">Search <FiArrowRight /></button></form>
      <div className="store-categories">{categories.map(category => <Link key={category.name} href={category.href} className="store-category"><div className="store-product-art"><Image src={category.image} alt="" fill sizes="(max-width: 600px) 45vw, (max-width: 1000px) 30vw, 16vw" /></div><h3>{category.name}</h3><p>{category.note}</p><FiArrowRight aria-hidden="true" /></Link>)}</div>
    </section>
    <section className="store-jobs-band"><div className="store-wrap store-section"><div className="store-heading"><div><p className="store-eyebrow">Choose by application</p><h2>Start with your jobsite.</h2></div><Link href="/blade-finder" className="store-text-link">Help me choose <FiArrowRight /></Link></div><div className="store-jobs">{jobs.map(job => <Link href={job.href} key={job.title} className="store-job"><Image src={job.image} alt="" fill sizes="(max-width: 640px) 100vw, 50vw" /><div><h3>{job.title}</h3><p>{job.text}</p><span>Explore application <FiArrowRight /></span></div></Link>)}</div></div></section>
    {blades.length > 0 && <section className="store-wrap store-section store-signatures"><div className="store-heading"><div><p className="store-eyebrow">Titan Signature Series</p><h2>Meet your next blade.</h2></div><Link href="/signature-series" className="store-text-link">Explore the series <FiArrowRight /></Link></div><FeaturedSignatureCarousel blades={blades} /></section>}
    <section className="store-wrap store-section store-resources" aria-labelledby="resource-heading"><div><p className="store-eyebrow">Resources & support</p><h2 id="resource-heading">Make an informed cut.</h2><p>Product information and practical tools, all in one place. Check the specifications for your equipment and application before ordering.</p><Link href="/resources" className="store-text-link">All resources <FiArrowRight /></Link></div><div className="store-resource-links"><Link href="/resources"><FiFileText /><span><strong>Catalog & product sheets</strong><small>Browse technical publications and downloads</small></span><FiArrowRight /></Link><Link href="/blade-finder"><FiCrosshair /><span><strong>Blade finder</strong><small>Narrow your selection by the job</small></span><FiArrowRight /></Link><Link href="/rpm-calculator"><FiSliders /><span><strong>RPM calculator</strong><small>Compare diameter and cutting speed</small></span><FiArrowRight /></Link></div></section>
  </div>
}
