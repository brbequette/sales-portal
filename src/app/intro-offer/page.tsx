"use client"

import React, { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  FiZap,
  FiShield,
  FiClock,
  FiCheckCircle,
  FiPhone,
  FiCreditCard,
  FiFileText,
  FiAward,
  FiCheck,
  FiTruck,
  FiStar,
  FiDollarSign,
  FiArrowRight,
  FiAlertCircle,
  FiShoppingCart,
  FiHelpCircle,
  FiX,
  FiPrinter,
  FiCheckSquare
} from "react-icons/fi"

export default function IntroOfferLandingPage() {
  // Offer Selection State
  const [selectedSize, setSelectedSize] = useState<"14" | "16" | "20">("14")
  const [quantity, setQuantity] = useState<number>(1)
  const [activeTab, setActiveTab] = useState<"credit_card" | "30_day_billing">("credit_card")
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [orderCompleted, setOrderCompleted] = useState<any>(null)

  // Form State
  const [formData, setFormData] = useState({
    customerName: "",
    companyName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    poNumber: "",
    cardNumber: "",
    cardExpiry: "",
    cardCvc: "",
    cardName: "",
  })

  // Timer State (14 hours, 32 mins countdown)
  const [timeLeft, setTimeLeft] = useState({ hours: 14, minutes: 32, seconds: 45 })

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 }
        if (prev.minutes > 0) return { ...prev, minutes: 59, seconds: 59 }
        if (prev.hours > 0) return { ...prev, hours: prev.hours - 1, minutes: 59, seconds: 59 }
        return prev
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Price calculations - Buy 1 Get 1 Free @ $99.99
  const pricePerPack = selectedSize === "14" ? 99.99 : selectedSize === "16" ? 129.99 : 169.99
  const regularPrice = selectedSize === "14" ? 459.98 : selectedSize === "16" ? 529.98 : 649.98
  const savings = Math.round(regularPrice - pricePerPack)
  const totalPrice = (pricePerPack * quantity).toFixed(2)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const res = await fetch("/api/intro-offer/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: activeTab,
          bladeSize: `${selectedSize}-inch BOGO Pack`,
          quantity,
          totalAmount: parseFloat(totalPrice),
          customerName: formData.customerName,
          companyName: formData.companyName,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          poNumber: formData.poNumber,
          cardName: formData.cardName,
          cardNumberLast4: formData.cardNumber.slice(-4),
        })
      })

      const data = await res.json()
      if (data.success) {
        setOrderCompleted({
          ...data,
          date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          bladeSize: `${selectedSize}" BOGO Pack`,
          quantity,
          address: `${formData.address}, ${formData.city}, ${formData.state} ${formData.zip}`,
        })
      } else {
        alert(data.error || "Order submission failed. Please check form fields or call (800) 848-2634.")
      }
    } catch (err) {
      console.error("Order error:", err)
      alert("Order submission error. Please try again or call (800) 848-2634.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#07080a] text-slate-100 font-sans selection:bg-red-600 selection:text-white">

      {/* ── Top Patriotic Announcement Banner ── */}
      <div className="bg-gradient-to-r from-blue-700 via-red-600 to-blue-700 text-white py-2 px-4 text-center font-black tracking-wide text-xs sm:text-sm uppercase shadow-md flex items-center justify-center gap-2 flex-wrap">
        <span>🇺🇸 INTRODUCTORY BOGO SPECIAL: BUY 1 GET 1 FREE FOR $99.99</span>
        <span className="hidden md:inline">•</span>
        <span>SAVE OVER $350 + FREE EXPRESS SHIPPING</span>
        <span className="hidden md:inline">•</span>
        <a href="tel:18008482634" className="bg-white text-blue-900 px-2.5 py-0.5 rounded-full font-extrabold hover:bg-yellow-300 transition-colors inline-flex items-center gap-1">
          <FiPhone size={12} /> CALL TO ORDER: (800) 848-2634
        </a>
      </div>

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-[#0c0d12]/90 backdrop-blur-xl border-b border-slate-800/80 px-4 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 via-white to-blue-600 p-0.5 shadow-[0_0_20px_rgba(239,68,68,0.4)]">
            <div className="w-full h-full bg-[#0c0d12] rounded-[10px] flex items-center justify-center font-black text-xl text-white">
              T
            </div>
          </div>
          <div>
            <div className="text-lg font-black text-white tracking-wider flex items-center gap-1.5 leading-none">
              TITAN DIAMOND <span className="text-red-500 text-xs font-bold px-1.5 py-0.5 rounded bg-red-950/80 border border-red-800/50 uppercase">USA 🇺🇸</span>
            </div>
            <div className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mt-0.5">
              PRO INDUSTRIAL CUTTING SOLUTIONS
            </div>
          </div>
        </div>

        {/* Action Header Links */}
        <div className="flex items-center gap-3">
          <a
            href="tel:18008482634"
            className="hidden sm:flex items-center gap-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-blue-300 border border-blue-500/30 px-3.5 py-2 rounded-xl text-xs font-black transition-all"
          >
            <FiPhone size={14} className="text-blue-400 animate-pulse" />
            <span>(800) 848-2634</span>
          </a>
          <a
            href="#order-section"
            className="bg-gradient-to-r from-red-600 to-blue-600 hover:from-red-500 hover:to-blue-500 text-white px-4 py-2 rounded-xl text-xs font-black tracking-wider uppercase shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all flex items-center gap-1.5"
          >
            <FiShoppingCart size={14} />
            <span>CLAIM OFFER</span>
          </a>
        </div>
      </header>

      {/* ── HERO SECTION ── */}
      <section className="relative overflow-hidden pt-8 pb-16 px-4 lg:px-8 border-b border-slate-800/80 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950/30 via-[#07080a] to-[#07080a]">
        
        {/* Background Patriotic Glow Elements */}
        <div className="absolute top-10 left-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293710_1px,transparent_1px),linear-gradient(to_bottom,#1f293710_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">

          {/* Left Column: Hero Headline & Sales Copy */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            
            {/* Top Badge */}
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-red-950/80 via-slate-900 to-blue-950/80 border border-red-500/30 rounded-full px-4 py-1.5 text-xs font-extrabold uppercase tracking-widest text-slate-200 shadow-lg">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span>OFFICIAL CONTRACTOR INTRODUCTORY PACKAGE</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight uppercase leading-[1.08]">
              THE UNSTOPPABLE <br className="hidden sm:inline" />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-slate-100 to-blue-500">
                PATRIOT 2-BLADE
              </span> <br />
              POWER PACK
            </h1>

            {/* Subheadline */}
            <p className="text-base sm:text-lg text-slate-300 font-medium leading-relaxed max-w-2xl mx-auto lg:mx-0">
              Buy <strong className="text-amber-400 font-bold">1x PATRIOT SPEED DEMON</strong> (12mm Turbo Segments for extreme cutting speed) and get <strong className="text-blue-400 font-bold">1x PATRIOT ENDURANCE MASTER</strong> (14mm Drop Segments for maximum life) <span className="text-emerald-400 font-extrabold underline decoration-emerald-500 underline-offset-4">ABSOLUTELY FREE!</span>
            </p>

            {/* Key Value Bullets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-xl mx-auto lg:mx-0 pt-2">
              <div className="flex items-start gap-2.5 bg-slate-900/60 border border-slate-800 p-3 rounded-xl">
                <FiZap className="text-red-500 shrink-0 mt-0.5" size={18} />
                <div className="text-xs">
                  <strong className="text-white block font-bold">BLADE #1: SPEED DEMON</strong>
                  <span className="text-slate-400">40% Faster cut rate on hard cured concrete & granite</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-slate-900/60 border border-slate-800 p-3 rounded-xl">
                <FiShield className="text-blue-500 shrink-0 mt-0.5" size={18} />
                <div className="text-xs">
                  <strong className="text-white block font-bold">BLADE #2: ENDURANCE MASTER (FREE)</strong>
                  <span className="text-slate-400">2x Longer footage with 14mm undercut drop protection</span>
                </div>
              </div>
            </div>

            {/* Price Card & Urgency Callout */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-700/80 p-5 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 max-w-xl mx-auto lg:mx-0">
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">REGULAR RETAIL VALUE</div>
                <div className="text-lg font-bold text-slate-500 line-through">${regularPrice.toFixed(2)}</div>
                <div className="text-xs font-bold text-emerald-400 mt-0.5">BUY 1 GET 1 FREE — SAVE ${savings}.00</div>
              </div>

              <div className="text-center sm:text-right border-t sm:border-t-0 sm:border-l border-slate-800 pt-3 sm:pt-0 sm:pl-5">
                <div className="text-xs font-extrabold text-amber-400 uppercase tracking-wider">BUY 1 GET 1 FREE PACKAGE</div>
                <div className="text-4xl font-black text-white tracking-tight">${pricePerPack.toFixed(2)}</div>
                <div className="text-[11px] font-bold text-blue-400">Get BOTH Blades + Free Express Shipping</div>
              </div>
            </div>

            {/* CTA Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start pt-2">
              <a
                href="#order-section"
                className="w-full sm:w-auto bg-gradient-to-r from-red-600 via-red-500 to-blue-600 hover:from-red-500 hover:to-blue-500 text-white font-black text-base px-8 py-4 rounded-xl shadow-[0_0_30px_rgba(220,38,38,0.5)] hover:shadow-[0_0_40px_rgba(220,38,38,0.7)] transition-all flex items-center justify-center gap-2 uppercase tracking-wide group"
              >
                <span>ORDER INTRO OFFER NOW</span>
                <FiArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </a>

              <a
                href="tel:18008482634"
                className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold text-sm px-6 py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <FiPhone className="text-blue-400" size={16} />
                <span>CALL (800) 848-2634 FOR 30-DAY BILLING</span>
              </a>
            </div>

            {/* Trust Badges Bar */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-xs text-slate-400 font-bold pt-2">
              <span className="flex items-center gap-1.5 text-slate-300">
                <FiCheckCircle className="text-emerald-500" /> 100% Satisfaction Guarantee
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <FiTruck className="text-blue-400" /> Free Express Courier Shipping
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <FiFileText className="text-amber-400" /> 30-Day Net Billing Available
              </span>
            </div>

          </div>

          {/* Right Column: High-Impact 2-Blade Product Graphics Showcase */}
          <div className="lg:col-span-5 relative">
            
            {/* Outer Glow Ring */}
            <div className="relative rounded-3xl bg-gradient-to-br from-red-600/30 via-slate-800/40 to-blue-600/30 p-1 shadow-[0_0_50px_rgba(37,99,235,0.3)] border border-slate-700/60">
              
              <div className="bg-[#0b0d14] rounded-[22px] p-6 space-y-6 relative overflow-hidden">

                {/* Top Badge Overlay */}
                <div className="flex items-center justify-between">
                  <span className="bg-red-600 text-white font-black text-[11px] uppercase tracking-wider px-3 py-1 rounded-md shadow-md">
                    2-BLADE POWER PACK
                  </span>
                  <span className="text-amber-400 font-black text-xs flex items-center gap-1">
                    <FiStar fill="currentColor" size={14} /> 4.9/5 CONTRACTOR RATING
                  </span>
                </div>

                {/* Blade Images Display Grid */}
                <div className="grid grid-cols-2 gap-4 my-4 relative">
                  
                  {/* Blade 1: Speed Demon Image */}
                  <div className="relative group bg-gradient-to-b from-slate-900 to-black p-3 rounded-2xl border border-red-900/40 hover:border-red-500/60 transition-all text-center">
                    <div className="absolute top-2 left-2 bg-red-600/90 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded z-10">
                      SPEED DEMON
                    </div>
                    <div className="w-full h-44 relative my-2 flex items-center justify-center overflow-hidden">
                      <img
                        src="/images/intro-offer/patriot-blade-1.png"
                        alt="Patriot Speed Demon Blade"
                        className="max-h-full object-contain filter drop-shadow-[0_0_15px_rgba(220,38,38,0.5)] group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          // Fallback if image fails
                          (e.target as HTMLElement).style.display = 'none'
                        }}
                      />
                    </div>
                    <div className="text-xs font-black text-white">PATRIOT SPEED</div>
                    <div className="text-[10px] text-red-400 font-bold">12mm Turbo Segments</div>
                  </div>

                  {/* Blade 2: Endurance Master Image */}
                  <div className="relative group bg-gradient-to-b from-slate-900 to-black p-3 rounded-2xl border border-blue-900/40 hover:border-blue-500/60 transition-all text-center">
                    <div className="absolute top-2 left-2 bg-blue-600/90 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded z-10">
                      ENDURANCE MASTER
                    </div>
                    <div className="w-full h-44 relative my-2 flex items-center justify-center overflow-hidden">
                      <img
                        src="/images/intro-offer/patriot-blade-2.png"
                        alt="Patriot Endurance Master Blade"
                        className="max-h-full object-contain filter drop-shadow-[0_0_15px_rgba(37,99,235,0.5)] group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none'
                        }}
                      />
                    </div>
                    <div className="text-xs font-black text-white">PATRIOT LIFE</div>
                    <div className="text-[10px] text-blue-400 font-bold">14mm Drop Segments</div>
                  </div>

                </div>

                {/* Offer Highlights Pill */}
                <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-300">Package Includes:</span>
                    <span className="text-amber-400">1x Speed + 1x Endurance</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-300">Standard Arbor:</span>
                    <span className="text-white">1" with 20mm Heavy Duty Bushing</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-300">Laser Weld Guarantee:</span>
                    <span className="text-emerald-400">100% Bond Loss Warranty</span>
                  </div>
                </div>

                {/* Flag Stamp */}
                <div className="text-center pt-1 border-t border-slate-800/80">
                  <span className="text-xs font-extrabold text-slate-400 tracking-widest uppercase flex items-center justify-center gap-1.5">
                    <span>🇺🇸</span> PROUDLY ENGINEERED & SERVICED IN USA <span>🇺🇸</span>
                  </span>
                </div>

              </div>

            </div>

          </div>

        </div>

      </section>

      {/* ── LIMITED TIME COUNTDOWN & STOCK BAR ── */}
      <section className="bg-gradient-to-r from-red-950 via-slate-900 to-blue-950 border-b border-slate-800 py-6 px-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 shrink-0">
              <FiClock size={24} className="animate-pulse" />
            </div>
            <div>
              <div className="text-xs font-extrabold text-red-400 uppercase tracking-wider">INTRODUCTORY PRICING EXPIRES IN:</div>
              <div className="text-2xl font-black text-white font-mono tracking-tight flex items-center gap-2">
                <span className="bg-black/60 px-2.5 py-1 rounded border border-slate-700">{String(timeLeft.hours).padStart(2, '0')}h</span>
                <span>:</span>
                <span className="bg-black/60 px-2.5 py-1 rounded border border-slate-700">{String(timeLeft.minutes).padStart(2, '0')}m</span>
                <span>:</span>
                <span className="bg-black/60 px-2.5 py-1 rounded border border-slate-700">{String(timeLeft.seconds).padStart(2, '0')}s</span>
              </div>
            </div>
          </div>

          <div className="w-full md:w-80 space-y-1.5">
            <div className="flex justify-between text-xs font-extrabold">
              <span className="text-slate-300">INTRO STOCK REMAINING:</span>
              <span className="text-amber-400">17 / 100 PACKAGES</span>
            </div>
            <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800 p-0.5">
              <div className="bg-gradient-to-r from-red-500 to-amber-400 h-full rounded-full w-[83%] animate-pulse" />
            </div>
            <div className="text-[10px] text-slate-400 text-right font-medium">Over 83% claimed today by contractors nationwide</div>
          </div>

        </div>
      </section>

      {/* ── PRODUCT BREAKDOWN: SPEED DEMON VS ENDURANCE MASTER ── */}
      <section className="py-16 px-4 lg:px-8 max-w-7xl mx-auto space-y-16">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <span className="text-xs font-black text-blue-400 uppercase tracking-widest bg-blue-950/60 border border-blue-800/60 px-3.5 py-1 rounded-full">
            THE PERFECT DUAL-THREAT COMBINATION
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">
            ENGINEERED FOR EVERY JOBSITE CHALLENGE
          </h2>
          <p className="text-sm text-slate-400 font-medium">
            Based on the proven legendary engineering of the <strong className="text-white">Medusa (Speed)</strong> and <strong className="text-white">Barbarian (Life)</strong> diamond blades — re-engineered into the ultimate 2-Blade Patriot Combo.
          </p>
        </div>

        {/* 2 Blade Feature Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* BLADE 1: SPEED DEMON (MEDUSA DNA) */}
          <div className="bg-gradient-to-b from-slate-900 via-slate-900/90 to-black border border-red-900/50 rounded-3xl p-6 sm:p-8 space-y-6 relative overflow-hidden group hover:border-red-500/80 transition-all shadow-xl">
            
            {/* Header Tag */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-xs font-extrabold text-red-500 uppercase tracking-widest">BLADE #1 • SPEED SPECIALIST</span>
                <h3 className="text-2xl font-black text-white uppercase tracking-wide">PATRIOT SPEED DEMON</h3>
                <p className="text-xs text-slate-400">Inspired by the High-Velocity Medusa Cut Matrix</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 font-black text-xl">
                ⚡
              </div>
            </div>

            {/* Image & Key Spec */}
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="w-44 h-44 bg-slate-950 rounded-2xl p-2 border border-slate-800 flex items-center justify-center shrink-0">
                <img
                  src="/images/intro-offer/patriot-blade-1.png"
                  alt="Patriot Speed Demon"
                  className="max-h-full object-contain filter drop-shadow-[0_0_12px_rgba(220,38,38,0.4)]"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
                />
              </div>

              <div className="space-y-3 flex-1 text-xs">
                <div className="bg-red-950/40 border border-red-800/40 p-3 rounded-xl">
                  <span className="text-red-400 font-bold block mb-1">PRIMARY ADVANTAGE:</span>
                  <span className="text-slate-200 font-medium">Extreme cutting velocity through hard materials without bogging down saw horsepower.</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 block">Segment Height:</span>
                    <strong className="text-white font-bold">12mm Laser Welded</strong>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 block">Best Material:</span>
                    <strong className="text-white font-bold">Hard Cured Concrete</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Feature List */}
            <div className="space-y-2.5 text-xs text-slate-300 pt-2">
              <div className="flex items-center gap-2.5">
                <FiCheckCircle className="text-red-500 shrink-0" size={16} />
                <span><strong>40% Faster Cut Rate:</strong> Turbo-vented segments lower drag and increase footage per minute.</span>
              </div>
              <div className="flex items-center gap-2.5">
                <FiCheckCircle className="text-red-500 shrink-0" size={16} />
                <span><strong>Laser-Welded Security:</strong> High-energy laser beam welds segment to core for 100% loss protection.</span>
              </div>
              <div className="flex items-center gap-2.5">
                <FiCheckCircle className="text-red-500 shrink-0" size={16} />
                <span><strong>Rapid Core Cooling:</strong> Radiated gullets prevent thermal expansion & blade warping under dry cutting.</span>
              </div>
            </div>

          </div>

          {/* BLADE 2: ENDURANCE MASTER (BARBARIAN DNA) */}
          <div className="bg-gradient-to-b from-slate-900 via-slate-900/90 to-black border border-blue-900/50 rounded-3xl p-6 sm:p-8 space-y-6 relative overflow-hidden group hover:border-blue-500/80 transition-all shadow-xl">
            
            {/* Header Tag */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-xs font-extrabold text-blue-400 uppercase tracking-widest">BLADE #2 • LONGEVITY SPECIALIST</span>
                <h3 className="text-2xl font-black text-white uppercase tracking-wide">PATRIOT ENDURANCE MASTER</h3>
                <p className="text-xs text-slate-400">Inspired by the Heavy-Duty Barbarian Extended Wear Bond</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-black text-xl">
                🛡️
              </div>
            </div>

            {/* Image & Key Spec */}
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="w-44 h-44 bg-slate-950 rounded-2xl p-2 border border-slate-800 flex items-center justify-center shrink-0">
                <img
                  src="/images/intro-offer/patriot-blade-2.png"
                  alt="Patriot Endurance Master"
                  className="max-h-full object-contain filter drop-shadow-[0_0_12px_rgba(37,99,235,0.4)]"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
                />
              </div>

              <div className="space-y-3 flex-1 text-xs">
                <div className="bg-blue-950/40 border border-blue-800/40 p-3 rounded-xl">
                  <span className="text-blue-400 font-bold block mb-1">PRIMARY ADVANTAGE:</span>
                  <span className="text-slate-200 font-medium">Maximum footage & extreme resistance against core undercut erosion in abrasive materials.</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 block">Segment Height:</span>
                    <strong className="text-white font-bold">14mm Drop Segment</strong>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 block">Best Material:</span>
                    <strong className="text-white font-bold">Asphalt & Green Concrete</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Feature List */}
            <div className="space-y-2.5 text-xs text-slate-300 pt-2">
              <div className="flex items-center gap-2.5">
                <FiCheckCircle className="text-blue-400 shrink-0" size={16} />
                <span><strong>2X Blade Lifespan:</strong> High-density matrix retains diamonds longer in harsh abrasive aggregate.</span>
              </div>
              <div className="flex items-center gap-2.5">
                <FiCheckCircle className="text-blue-400 shrink-0" size={16} />
                <span><strong>14mm Undercut Protection:</strong> Deep slanted drop-segments protect steel core from wearing thin.</span>
              </div>
              <div className="flex items-center gap-2.5">
                <FiCheckCircle className="text-blue-400 shrink-0" size={16} />
                <span><strong>Multi-Material Versatility:</strong> Slices effortlessly through green concrete, asphalt, brick & block.</span>
              </div>
            </div>

          </div>

        </div>

      </section>

      {/* ── SIDE BY SIDE SPECIFICATION COMPARISON TABLE ── */}
      <section className="py-12 px-4 lg:px-8 bg-slate-950/70 border-y border-slate-800/80">
        <div className="max-w-5xl mx-auto space-y-8">
          
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-black text-white uppercase tracking-wider">SIDE-BY-SIDE SPECIFICATIONS</h3>
            <p className="text-xs text-slate-400">Designed to give your crew the exact right tool for every job site condition.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-300 font-extrabold uppercase">
                  <th className="p-3.5">FEATURE / SPEC</th>
                  <th className="p-3.5 text-red-400">PATRIOT SPEED DEMON</th>
                  <th className="p-3.5 text-blue-400">PATRIOT ENDURANCE MASTER</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300 font-medium">
                <tr>
                  <td className="p-3.5 font-bold text-white">Primary Focus</td>
                  <td className="p-3.5 text-red-400 font-bold">Cutting Speed & Fast Production</td>
                  <td className="p-3.5 text-blue-400 font-bold">Maximum Lifespan & High Footage</td>
                </tr>
                <tr>
                  <td className="p-3.5 font-bold text-white">Segment Design</td>
                  <td className="p-3.5">12mm Turbo Vented Segments</td>
                  <td className="p-3.5">14mm Drop-Segment Undercut Protect</td>
                </tr>
                <tr>
                  <td className="p-3.5 font-bold text-white">Optimal Applications</td>
                  <td className="p-3.5">Cured Concrete, Rebar, Hard Aggregate, Granite</td>
                  <td className="p-3.5">Asphalt, Green Concrete, Brick, Block, Soft Stone</td>
                </tr>
                <tr>
                  <td className="p-3.5 font-bold text-white">Weld Technology</td>
                  <td className="p-3.5 text-emerald-400 font-bold">100% Pro-Grade Laser Weld</td>
                  <td className="p-3.5 text-emerald-400 font-bold">100% Pro-Grade Laser Weld</td>
                </tr>
                <tr>
                  <td className="p-3.5 font-bold text-white">Arbor Standard</td>
                  <td className="p-3.5">1" Arbor with 20mm Heavy Duty Bushing</td>
                  <td className="p-3.5">1" Arbor with 20mm Heavy Duty Bushing</td>
                </tr>
                <tr>
                  <td className="p-3.5 font-bold text-white">Cutting Mode</td>
                  <td className="p-3.5">Wet or Dry Cutting</td>
                  <td className="p-3.5">Wet or Dry Cutting</td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
      </section>

      {/* ── ORDER SECTION: CREDIT CARD vs 30-DAY BILLING ── */}
      <section id="order-section" className="py-16 px-4 lg:px-8 max-w-5xl mx-auto scroll-mt-16">
        
        <div className="bg-gradient-to-b from-slate-900 via-[#0b0d14] to-black border border-slate-700/80 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8 relative">
          
          {/* Badge */}
          <div className="text-center space-y-2">
            <span className="inline-block bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-black px-4 py-1 rounded-full uppercase tracking-wider">
              CLAIM YOUR 2-BLADE INTRODUCTORY PACKAGE
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">
              SELECT YOUR OPTIONS & CHECK OUT
            </h2>
            <p className="text-xs text-slate-400">Instant Online Processing or 30-Day Risk-Free Business Account Billing.</p>
          </div>

          {/* Size & Quantity Selector */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-950 p-5 rounded-2xl border border-slate-800">
            
            {/* Size Options */}
            <div className="space-y-2">
              <label className="text-xs font-extrabold text-slate-300 uppercase tracking-wider block">
                1. SELECT BLADE DIAMETER SIZE:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { size: "14", label: '14" BOGO Pack', price: "$99.99" },
                  { size: "16", label: '16" BOGO Pack', price: "$129.99" },
                  { size: "20", label: '20" BOGO Pack', price: "$169.99" },
                ].map(opt => (
                  <button
                    key={opt.size}
                    type="button"
                    onClick={() => setSelectedSize(opt.size as any)}
                    className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center ${
                      selectedSize === opt.size
                        ? "bg-red-600/20 border-red-500 text-white shadow-lg ring-1 ring-red-500"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span className="text-xs font-black uppercase">{opt.label}</span>
                    <span className="text-[11px] font-bold text-amber-400 mt-1">{opt.price}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity Selector */}
            <div className="space-y-2">
              <label className="text-xs font-extrabold text-slate-300 uppercase tracking-wider block">
                2. SELECT NUMBER OF PACKAGES:
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-12 h-11 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white font-black text-lg rounded-xl flex items-center justify-center"
                >
                  -
                </button>
                <div className="flex-1 bg-slate-900 border border-slate-800 h-11 rounded-xl flex items-center justify-center text-base font-black text-white">
                  {quantity} {quantity === 1 ? "Package (2 Blades)" : "Packages (" + (quantity * 2) + " Blades)"}
                </div>
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-12 h-11 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white font-black text-lg rounded-xl flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>

          </div>

          {/* Payment Method Tabs */}
          <div className="space-y-4">
            <label className="text-xs font-extrabold text-slate-300 uppercase tracking-wider block">
              3. CHOOSE PAYMENT & BILLING METHOD:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setActiveTab("credit_card")}
                className={`p-4 rounded-2xl border text-left transition-all flex items-center gap-3.5 ${
                  activeTab === "credit_card"
                    ? "bg-gradient-to-r from-red-950/80 to-slate-900 border-red-500 text-white shadow-xl ring-2 ring-red-500/50"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${activeTab === "credit_card" ? "bg-red-600 text-white" : "bg-slate-900 text-slate-400"}`}>
                  <FiCreditCard size={20} />
                </div>
                <div>
                  <div className="text-sm font-black uppercase text-white">INSTANT CREDIT CARD</div>
                  <div className="text-[11px] text-slate-400">Visa, Mastercard, Amex, Discover</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("30_day_billing")}
                className={`p-4 rounded-2xl border text-left transition-all flex items-center gap-3.5 ${
                  activeTab === "30_day_billing"
                    ? "bg-gradient-to-r from-blue-950/80 to-slate-900 border-blue-500 text-white shadow-xl ring-2 ring-blue-500/50"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${activeTab === "30_day_billing" ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400"}`}>
                  <FiFileText size={20} />
                </div>
                <div>
                  <div className="text-sm font-black uppercase text-white">30-DAY NET BILLING</div>
                  <div className="text-[11px] text-slate-400">Invoice Your Account / Call to Confirm</div>
                </div>
              </button>
            </div>
          </div>

          {/* Checkout Form */}
          <form onSubmit={handleSubmitOrder} className="space-y-6">
            
            {/* Customer Details */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                CUSTOMER & SHIPPING INFORMATION
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-400 mb-1">FULL NAME *</label>
                  <input
                    type="text"
                    name="customerName"
                    required
                    value={formData.customerName}
                    onChange={handleInputChange}
                    placeholder="e.g. John Miller"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-red-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-400 mb-1">COMPANY / BUSINESS NAME</label>
                  <input
                    type="text"
                    name="companyName"
                    value={formData.companyName}
                    onChange={handleInputChange}
                    placeholder="e.g. Apex Concrete Construction LLC"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-red-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-400 mb-1">EMAIL ADDRESS *</label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="john@apexconcrete.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-red-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-400 mb-1">PHONE NUMBER *</label>
                  <input
                    type="tel"
                    name="phone"
                    required
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="(555) 000-0000"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-red-500 font-medium"
                  />
                </div>
              </div>

              {/* Delivery Address */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-400 mb-1">STREET ADDRESS *</label>
                  <input
                    type="text"
                    name="address"
                    required
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="123 Industrial Parkway"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-red-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 mb-1">CITY *</label>
                  <input
                    type="text"
                    name="city"
                    required
                    value={formData.city}
                    onChange={handleInputChange}
                    placeholder="Dallas"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-red-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 mb-1">STATE / ZIP *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      name="state"
                      required
                      value={formData.state}
                      onChange={handleInputChange}
                      placeholder="TX"
                      className="w-16 bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-white text-center font-bold focus:outline-none focus:border-red-500 uppercase"
                    />
                    <input
                      type="text"
                      name="zip"
                      required
                      value={formData.zip}
                      onChange={handleInputChange}
                      placeholder="75001"
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-white text-center font-medium focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* TAB SPECIFIC PAYMENT FIELDS */}
            {activeTab === "credit_card" ? (
              <div className="space-y-4 bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
                <h4 className="text-xs font-black text-red-400 uppercase tracking-wider flex items-center gap-2">
                  <FiCreditCard /> CREDIT CARD PAYMENT DETAILS
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-400 mb-1">CARDHOLDER NAME</label>
                    <input
                      type="text"
                      name="cardName"
                      value={formData.cardName}
                      onChange={handleInputChange}
                      placeholder="Name as printed on card"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-red-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-400 mb-1">CARD NUMBER</label>
                    <input
                      type="text"
                      name="cardNumber"
                      value={formData.cardNumber}
                      onChange={handleInputChange}
                      placeholder="•••• •••• •••• ••••"
                      maxLength={19}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-red-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-400 mb-1">EXPIRY DATE</label>
                    <input
                      type="text"
                      name="cardExpiry"
                      value={formData.cardExpiry}
                      onChange={handleInputChange}
                      placeholder="MM/YY"
                      maxLength={5}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-3 text-white text-center focus:outline-none focus:border-red-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-400 mb-1">CVC CODE</label>
                    <input
                      type="password"
                      name="cardCvc"
                      value={formData.cardCvc}
                      onChange={handleInputChange}
                      placeholder="•••"
                      maxLength={4}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-3 text-white text-center focus:outline-none focus:border-red-500 font-mono"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 bg-blue-950/40 p-4 rounded-2xl border border-blue-900/60">
                <h4 className="text-xs font-black text-blue-400 uppercase tracking-wider flex items-center gap-2">
                  <FiFileText /> 30-DAY NET BILLING ACCOUNT CONFIRMATION
                </h4>
                <p className="text-xs text-slate-300">
                  Approved commercial accounts pay <strong>$0 TODAY</strong>. An itemized invoice for <strong>${totalPrice}</strong> will be included with your shipment, due in 30 days.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-400 mb-1">PURCHASE ORDER # (OPTIONAL)</label>
                    <input
                      type="text"
                      name="poNumber"
                      value={formData.poNumber}
                      onChange={handleInputChange}
                      placeholder="e.g. PO-9842"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-blue-500 font-medium"
                    />
                  </div>

                  <div className="flex items-end">
                    <a
                      href="tel:18008482634"
                      className="w-full bg-blue-900/60 hover:bg-blue-800/80 text-blue-200 border border-blue-600/50 rounded-xl px-3.5 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <FiPhone className="text-blue-400 animate-pulse" />
                      <span>PREFER TO CALL? (800) 848-2634</span>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Total & Submit Button */}
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase">ORDER TOTAL AMOUNT:</div>
                <div className="text-3xl font-black text-white tracking-tight">${totalPrice}</div>
                <div className="text-xs text-emerald-400 font-bold">Includes 2x Blades ({selectedSize}") + FREE Express Freight</div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full sm:w-auto px-8 py-4 rounded-xl font-black text-base uppercase tracking-wider text-white shadow-2xl transition-all flex items-center justify-center gap-2.5 ${
                  activeTab === "credit_card"
                    ? "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-red-600/40"
                    : "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-blue-600/40"
                }`}
              >
                {isSubmitting ? (
                  <span>PROCESSING ORDER...</span>
                ) : activeTab === "credit_card" ? (
                  <>
                    <FiCreditCard size={20} />
                    <span>SUBMIT CREDIT CARD ORDER (${totalPrice})</span>
                  </>
                ) : (
                  <>
                    <FiCheckSquare size={20} />
                    <span>CONFIRM 30-DAY BILLING ORDER</span>
                  </>
                )}
              </button>
            </div>

          </form>

        </div>

      </section>

      {/* ── PATRIOTIC TRUST & GUARANTEE SECTION ── */}
      <section className="py-16 px-4 lg:px-8 bg-slate-950 border-t border-slate-800">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl space-y-3">
            <div className="w-12 h-12 rounded-xl bg-red-600/20 text-red-500 flex items-center justify-center mx-auto text-2xl font-black">
              🇺🇸
            </div>
            <h4 className="text-lg font-black text-white uppercase">100% AMERICAN SERVICE</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Based in Austin, Texas. Expert customer support and dedicated diamond tooling specialists standing by.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl space-y-3">
            <div className="w-12 h-12 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center mx-auto">
              <FiShield size={24} />
            </div>
            <h4 className="text-lg font-black text-white uppercase">RISK-FREE 30-DAY GUARANTEE</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              If the Patriot blades don't out-cut your existing tools, return them for a 100% full refund or credit.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl space-y-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center mx-auto">
              <FiTruck size={24} />
            </div>
            <h4 className="text-lg font-black text-white uppercase">SAME-DAY EXPRESS SHIPPING</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Orders placed before 3:00 PM EST ship same day directly to your job site or equipment yard.
            </p>
          </div>

        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-8 px-4 border-t border-slate-800/80 text-center text-xs text-slate-500 space-y-3">
        <div className="flex items-center justify-center gap-2 font-bold text-slate-400">
          <span>TITAN DIAMOND USA</span>
          <span>•</span>
          <a href="tel:18008482634" className="hover:text-white transition-colors">(800) 848-2634</a>
          <span>•</span>
          <span>INDUSTRIAL DIAMOND TOOLS</span>
        </div>
        <p>© {new Date().getFullYear()} Titan Diamond Tools. All rights reserved. Professional Contractor Grade.</p>
      </footer>

      {/* ── STICKY MOBILE BOTTOM BAR (<768px) ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0c0d12]/95 backdrop-blur-xl border-t border-slate-800 p-3 flex items-center justify-between gap-3 shadow-2xl">
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase">2-BLADE PACKAGE</div>
          <div className="text-xl font-black text-white leading-none">${pricePerPack.toFixed(2)}</div>
          <div className="text-[9px] font-bold text-emerald-400">SAVE ${savings} + FREE SHIP</div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="tel:18008482634"
            className="w-10 h-10 bg-slate-900 border border-slate-700 text-blue-400 rounded-xl flex items-center justify-center"
          >
            <FiPhone size={18} />
          </a>
          <a
            href="#order-section"
            className="bg-gradient-to-r from-red-600 to-blue-600 text-white font-black text-xs uppercase px-4 py-3 rounded-xl tracking-wider shadow-lg flex items-center gap-1"
          >
            <span>CLAIM OFFER</span>
            <FiArrowRight size={14} />
          </a>
        </div>
      </div>

      {/* ── ORDER SUCCESS CONFIRMATION MODAL ── */}
      {orderCompleted && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0e1017] border border-slate-700 rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 relative shadow-2xl animate-fade-in text-slate-100">
            
            <button
              onClick={() => setOrderCompleted(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2"
            >
              <FiX size={20} />
            </button>

            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-3xl">
                ✓
              </div>
              <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                ORDER CONFIRMED • {orderCompleted.orderId}
              </span>
              <h3 className="text-2xl font-black text-white uppercase">THANK YOU FOR YOUR ORDER!</h3>
              <p className="text-xs text-slate-300">
                {orderCompleted.message}
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between border-b border-slate-900 pb-2">
                <span className="text-slate-400">Order Reference:</span>
                <strong className="text-white font-mono">{orderCompleted.orderId}</strong>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-2">
                <span className="text-slate-400">Item Package:</span>
                <strong className="text-white font-bold">2-Blade Patriot Pack ({orderCompleted.bladeSize})</strong>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-2">
                <span className="text-slate-400">Quantity:</span>
                <strong className="text-white">{orderCompleted.quantity} Pack(s)</strong>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-2">
                <span className="text-slate-400">Payment Terms:</span>
                <strong className="text-amber-400">
                  {orderCompleted.paymentMethod === "thirty_day_billing" ? "30-Day Net Invoice" : "Credit Card Paid"}
                </strong>
              </div>
              <div className="flex justify-between pt-1 text-sm font-black">
                <span className="text-slate-300">Total Amount:</span>
                <span className="text-white">${orderCompleted.totalAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => window.print()}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2"
              >
                <FiPrinter /> PRINT CONFIRMATION
              </button>
              <button
                onClick={() => setOrderCompleted(null)}
                className="flex-1 bg-gradient-to-r from-red-600 to-blue-600 text-white font-black py-3 rounded-xl text-xs uppercase"
              >
                DONE
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
