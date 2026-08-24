"use client"

import Image from "next/image"
import Link from "next/link"
import { FormEvent, useMemo, useState } from "react"
import {
  FiArrowRight,
  FiCheck,
  FiCheckCircle,
  FiChevronDown,
  FiClock,
  FiFileText,
  FiPackage,
  FiPhone,
  FiShield,
  FiTruck,
} from "react-icons/fi"
import { INTRO_OFFER, INTRO_OFFER_MAX_QUANTITY, introOfferTotal } from "@/lib/intro-offer"

type FormData = {
  customerName: string
  companyName: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zip: string
  poNumber: string
  fulfillment: "commercial_invoice" | "sales_assist"
  website: string
}

const initialForm: FormData = {
  customerName: "",
  companyName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  poNumber: "",
  fulfillment: "commercial_invoice",
  website: "",
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

export default function IntroOfferPage() {
  const [quantity, setQuantity] = useState(1)
  const [form, setForm] = useState<FormData>(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [confirmation, setConfirmation] = useState<{ orderId: string; message: string } | null>(null)
  const total = useMemo(() => introOfferTotal(quantity), [quantity])

  const update = (name: keyof FormData, value: string) => setForm((current) => ({ ...current, [name]: value }))

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError("")
    try {
      const response = await fetch("/api/intro-offer/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, quantity }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || "We could not submit your request.")
      setConfirmation({ orderId: result.orderId, message: result.message })
      setForm(initialForm)
      setQuantity(1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not submit your request.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#05070b] text-white selection:bg-red-500/40">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(37,99,235,.18),transparent_30%),radial-gradient(circle_at_85%_12%,rgba(220,38,38,.2),transparent_32%),linear-gradient(180deg,#080b12_0%,#05070b_55%,#090d16_100%)]" />

      <header className="relative z-30 border-b border-white/10 bg-[#05070b]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <Image src="/images/brand/logo-system/titan-horizontal-light.png" alt="Titan Diamond USA" width={280} height={86} priority className="h-11 w-auto sm:h-13" />
          <div className="flex items-center gap-3">
            <a href={INTRO_OFFER.phoneHref} className="hidden items-center gap-2 text-sm font-bold text-slate-200 transition hover:text-white sm:flex">
              <FiPhone className="text-red-400" /> {INTRO_OFFER.phoneDisplay}
            </a>
            <a href="#order" className="rounded-full bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 transition hover:bg-red-50">
              Claim offer
            </a>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-14 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:pb-28 lg:pt-24">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-500/10 px-4 py-2 text-xs font-black uppercase tracking-[.2em] text-red-300">
            <span className="h-2 w-2 rounded-full bg-red-400" /> Contractor intro offer
          </div>
          <h1 className="max-w-4xl text-5xl font-black uppercase leading-[.9] tracking-[-.055em] sm:text-7xl lg:text-[5.7rem]">
            Double the blades. <span className="bg-gradient-to-r from-red-400 via-white to-blue-400 bg-clip-text text-transparent">One price.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
            Buy one 14-inch {INTRO_OFFER.productName} blade and get a second blade free. Two jobsite-ready blades for {money.format(INTRO_OFFER.pricePerPack)}, with free freight.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a href="#order" className="group inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-red-600 to-red-500 px-7 py-4 text-sm font-black uppercase tracking-wider shadow-[0_16px_50px_rgba(220,38,38,.25)] transition hover:-translate-y-0.5">
              Get the BOGO pack <FiArrowRight className="transition group-hover:translate-x-1" />
            </a>
            <span className="text-sm font-semibold text-slate-400">SKU {INTRO_OFFER.sku}</span>
          </div>
          <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3 border-t border-white/10 pt-7">
            {[['2', 'blades per pack'], ['$99.99', 'per BOGO pack'], ['Free', 'freight']].map(([value, label]) => (
              <div key={label}><div className="text-2xl font-black sm:text-3xl">{value}</div><div className="mt-1 text-xs uppercase tracking-wider text-slate-500">{label}</div></div>
            ))}
          </div>
        </div>

        <div className="relative min-h-[420px] lg:min-h-[560px]">
          <div className="absolute inset-8 rounded-full bg-gradient-to-br from-red-500/25 via-white/5 to-blue-500/25 blur-3xl" />
          <div className="absolute inset-0 rounded-[3rem] border border-white/10 bg-white/[.035] shadow-2xl backdrop-blur-sm" />
          <Image src="/images/intro-offer/patriot-blade-1.png" alt="14-inch Patriot Pro diamond blade" width={700} height={700} priority className="absolute left-[-7%] top-[4%] w-[70%] -rotate-6 drop-shadow-[0_35px_45px_rgba(0,0,0,.65)]" />
          <Image src="/images/intro-offer/patriot-blade-2.png" alt="Second 14-inch Patriot Pro blade included free" width={700} height={700} priority className="absolute bottom-[1%] right-[-5%] w-[68%] rotate-6 drop-shadow-[0_35px_45px_rgba(0,0,0,.65)]" />
          <div className="absolute bottom-6 left-6 rounded-2xl border border-white/15 bg-black/70 px-5 py-4 backdrop-blur-lg">
            <div className="text-xs font-black uppercase tracking-[.18em] text-red-300">Buy one, get one free</div>
            <div className="mt-1 text-3xl font-black">$99.99 <span className="text-sm font-medium text-slate-400">total / pack</span></div>
          </div>
        </div>
      </section>

      <section className="relative z-10 border-y border-white/10 bg-white/[.025]">
        <div className="mx-auto grid max-w-7xl gap-px sm:grid-cols-3">
          {[
            [FiPackage, 'Two-blade BOGO pack', 'One paid blade plus one included blade in every pack.'],
            [FiTruck, 'Free freight', 'Freight is included for this introductory offer.'],
            [FiShield, 'Human confirmation', 'A Titan representative verifies every request before fulfillment.'],
          ].map(([Icon, title, copy]) => (
            <div key={String(title)} className="flex gap-4 border-white/10 p-7 sm:border-r last:border-r-0">
              <Icon className="mt-1 shrink-0 text-2xl text-red-400" />
              <div><h2 className="font-black">{String(title)}</h2><p className="mt-1 text-sm leading-6 text-slate-400">{String(copy)}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-red-500/10 to-transparent p-8 sm:p-10">
            <div className="text-xs font-black uppercase tracking-[.2em] text-red-300">What is included</div>
            <h2 className="mt-4 text-4xl font-black uppercase tracking-tight">A simple offer built for the jobsite.</h2>
            <ul className="mt-8 space-y-5">
              {[
                `Two ${INTRO_OFFER.bladeSize} ${INTRO_OFFER.productName} blades`,
                'One complete BOGO pack for $99.99',
                'Free freight on the introductory package',
                'Order review and confirmation from Titan Diamond USA',
              ].map((item) => <li key={item} className="flex gap-3 text-slate-200"><FiCheckCircle className="mt-0.5 shrink-0 text-emerald-400" /> {item}</li>)}
            </ul>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-blue-500/10 to-transparent p-8 sm:p-10">
            <div className="text-xs font-black uppercase tracking-[.2em] text-blue-300">How it works</div>
            <div className="mt-7 space-y-7">
              {[
                ['01', 'Send your request', 'Choose the number of BOGO packs and provide delivery details.'],
                ['02', 'We confirm the order', 'Our team verifies availability, account details, and fulfillment method.'],
                ['03', 'Your blades ship', 'Once confirmed, the two-blade pack is prepared for freight.'],
              ].map(([number, title, copy]) => (
                <div key={number} className="flex gap-5"><div className="text-2xl font-black text-blue-400/70">{number}</div><div><h3 className="font-black">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{copy}</p></div></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="order" className="relative z-10 scroll-mt-8 px-5 pb-24 lg:px-8">
        <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a0e17] shadow-[0_30px_100px_rgba(0,0,0,.5)] lg:grid-cols-[.72fr_1.28fr]">
          <aside className="bg-gradient-to-br from-red-700 to-red-950 p-8 sm:p-10">
            <div className="text-xs font-black uppercase tracking-[.2em] text-red-100/70">Order summary</div>
            <h2 className="mt-4 text-3xl font-black uppercase">Patriot BOGO pack</h2>
            <div className="mt-8 flex items-center justify-between border-y border-white/20 py-5">
              <span className="text-sm text-red-100">Packs</span>
              <select aria-label="Number of BOGO packs" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="rounded-lg border border-white/20 bg-black/20 px-3 py-2 font-bold text-white outline-none">
                {Array.from({ length: INTRO_OFFER_MAX_QUANTITY }, (_, i) => i + 1).map((value) => <option key={value} value={value} className="bg-slate-900">{value}</option>)}
              </select>
            </div>
            <div className="mt-5 space-y-3 text-sm text-red-100/80">
              <div className="flex justify-between"><span>Blades</span><strong>{quantity * INTRO_OFFER.unitsPerPack}</strong></div>
              <div className="flex justify-between"><span>Freight</span><strong>Free</strong></div>
              <div className="flex justify-between border-t border-white/20 pt-4 text-white"><span className="font-bold">Offer total</span><strong className="text-2xl">{money.format(total)}</strong></div>
            </div>
            <p className="mt-8 text-xs leading-5 text-red-100/65">Submitting reserves the offer for review. It does not charge a card or automatically approve credit.</p>
          </aside>

          <div className="p-8 sm:p-10">
            {confirmation ? (
              <div className="flex min-h-[560px] flex-col items-center justify-center text-center">
                <FiCheckCircle className="text-6xl text-emerald-400" />
                <h2 className="mt-6 text-3xl font-black">Request received</h2>
                <p className="mt-3 max-w-md leading-7 text-slate-400">{confirmation.message}</p>
                <div className="mt-6 rounded-xl bg-white/5 px-5 py-3 font-mono text-sm text-slate-300">Reference {confirmation.orderId}</div>
                <a href={INTRO_OFFER.phoneHref} className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-slate-950"><FiPhone /> Call about this request</a>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="text-xs font-black uppercase tracking-[.2em] text-red-400">Secure order request</div>
                <h2 className="mt-3 text-3xl font-black">Where should we send it?</h2>
                <p className="mt-2 text-sm text-slate-400">Required fields are marked with an asterisk.</p>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {[
                    ['customerName', 'Your name *', 'text', true], ['companyName', 'Company name', 'text', false],
                    ['email', 'Email *', 'email', true], ['phone', 'Phone *', 'tel', true],
                    ['address', 'Delivery address *', 'text', true], ['city', 'City *', 'text', true],
                    ['state', 'State *', 'text', true], ['zip', 'ZIP code *', 'text', true],
                    ['poNumber', 'PO number (optional)', 'text', false],
                  ].map(([name, label, type, required], index) => (
                    <label key={String(name)} className={index === 4 || index === 8 ? 'sm:col-span-2' : ''}>
                      <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">{String(label)}</span>
                      <input name={String(name)} type={String(type)} required={Boolean(required)} autoComplete={name === 'customerName' ? 'name' : name === 'companyName' ? 'organization' : String(name)} value={form[name as keyof FormData]} onChange={(e) => update(name as keyof FormData, e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[.04] px-4 py-3.5 text-white outline-none transition placeholder:text-slate-600 focus:border-red-400/70 focus:ring-2 focus:ring-red-400/15" />
                    </label>
                  ))}
                </div>

                <fieldset className="mt-6">
                  <legend className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">How would you like to finish?</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ['commercial_invoice', FiFileText, 'Commercial invoice', 'Request business billing review'],
                      ['sales_assist', FiPhone, 'Call me to finish', 'Complete payment with a representative'],
                    ].map(([value, Icon, title, copy]) => (
                      <label key={String(value)} className={`cursor-pointer rounded-xl border p-4 transition ${form.fulfillment === value ? 'border-red-400 bg-red-500/10' : 'border-white/10 bg-white/[.03] hover:border-white/20'}`}>
                        <input type="radio" name="fulfillment" value={String(value)} checked={form.fulfillment === value} onChange={() => update('fulfillment', String(value))} className="sr-only" />
                        <Icon className="text-xl text-red-400" /><span className="mt-3 block text-sm font-black">{String(title)}</span><span className="mt-1 block text-xs leading-5 text-slate-400">{String(copy)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="hidden" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update('website', e.target.value)} /></label>
                {error && <div role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error} Call {INTRO_OFFER.phoneDisplay} if you need help.</div>}
                <button disabled={submitting} className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-red-600 to-red-500 px-6 py-4 text-sm font-black uppercase tracking-wider shadow-lg transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">
                  {submitting ? <><FiClock className="animate-spin" /> Sending request...</> : <>Submit {money.format(total)} offer request <FiArrowRight /></>}
                </button>
                <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500"><FiShield className="mt-0.5 shrink-0" /> No card information is collected on this page. Titan will confirm availability, billing, and final fulfillment before the order is processed.</p>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="relative z-10 border-t border-white/10 px-5 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-black uppercase">Questions before you order?</h2>
          <p className="mt-3 text-slate-400">Talk with a Titan Diamond USA representative about fit, applications, or commercial billing.</p>
          <a href={INTRO_OFFER.phoneHref} className="mt-7 inline-flex items-center gap-2 text-xl font-black text-white hover:text-red-300"><FiPhone /> {INTRO_OFFER.phoneDisplay}</a>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10 px-5 py-8 text-center text-xs text-slate-600">
        <p>© {new Date().getFullYear()} Titan Diamond USA. Offer subject to confirmation and availability.</p>
        <Link href="/" className="mt-2 inline-block hover:text-slate-400">Return to Titan Diamond USA</Link>
      </footer>
    </main>
  )
}
