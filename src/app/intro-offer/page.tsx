"use client"

import React, { useState, useEffect } from "react"
import {
  FiZap,
  FiShield,
  FiClock,
  FiCheckCircle,
  FiPhone,
  FiCreditCard,
  FiFileText,
  FiTruck,
  FiStar,
  FiArrowRight,
  FiShoppingCart,
  FiX,
  FiPrinter,
  FiCheckSquare,
  FiActivity,
  FiCheck,
  FiMaximize2,
  FiCpu,
  FiLayers,
  FiTool,
  FiFeather
} from "react-icons/fi"

export default function StandalonePatriotOfferPage() {
  // Offer Selection State
  const [selectedSize, setSelectedSize] = useState<"14">("14")
  const [quantity, setQuantity] = useState<number>(1)
  const [activeTab, setActiveTab] = useState<"credit_card" | "30_day_billing">("credit_card")
  const [activeBladeTab, setActiveBladeTab] = useState<"speed" | "life">("speed")
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [orderCompleted, setOrderCompleted] = useState<any>(null)
  
  // Fullscreen Image Modal State
  const [fullscreenImage, setFullscreenImage] = useState<{ src: string; title: string; subtitle: string } | null>(null)

  // Live Sales Ticker State
  const [currentTickerIndex, setCurrentTickerIndex] = useState(0)
  const tickerEvents = [
    { name: "Mark S. (Apex Concrete)", location: "Dallas, TX", action: "Claimed 2x 14\" BOGO Packs", time: "2m ago" },
    { name: "Dave R. (RZR Sawing LLC)", location: "Phoenix, AZ", action: "Approved for 30-Day Net Billing", time: "5m ago" },
    { name: "Tyler M. (Midwest Paving)", location: "Chicago, IL", action: "Claimed 1x 16\" BOGO Pack", time: "8m ago" },
    { name: "Jason K. (Lone Star Cutters)", location: "Austin, TX", action: "Claimed 3x 14\" BOGO Packs", time: "12m ago" }
  ]

  useEffect(() => {
    const tickerInterval = setInterval(() => {
      setCurrentTickerIndex(prev => (prev + 1) % tickerEvents.length)
    }, 4000)
    return () => clearInterval(tickerInterval)
  }, [])

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

  // Live Countdown Timer State
  const [timeLeft, setTimeLeft] = useState({ hours: 11, minutes: 42, seconds: 18 })

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

  // BOGO Pricing Calculations (Fixed 14" Package: $99.99 Total)
  const pricePerPack = 99.99
  const regularValue = 459.98
  const savings = 360
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
          bladeSize: `14-inch BOGO Package (Buy 1 Get 1 Free)`,
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
          bladeSize: `14" BOGO Pack (2 Blades)`,
          quantity,
          address: `${formData.address}, ${formData.city}, ${formData.state} ${formData.zip}`,
        })
      } else {
        alert(data.error || "Order submission failed. Please verify your details or call (800) 848-2634.")
      }
    } catch (err) {
      console.error("Order error:", err)
      alert("Order submission error. Please try again or call (800) 848-2634 directly.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-slate-900 text-slate-900 font-sans selection:bg-red-600 selection:text-white pb-20 md:pb-0 overflow-x-hidden">

      {/* ── REAL AMERICAN FLAG VIDEO BACKGROUND (HIGHLY VISIBLE) ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        
        {/* Real HD Looping Flag Video */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-50 sm:opacity-60 scale-105 filter contrast-125 saturate-150"
        >
          <source src="https://assets.mixkit.co/videos/preview/mixkit-american-flag-waving-in-the-wind-41549-large.mp4" type="video/mp4" />
          <source src="https://cdn.coverr.co/videos/coverr-american-flag-waving-5282/1080p.mp4" type="video/mp4" />
        </video>

        {/* Lighting & Contrast Overlay to ensure extreme text legibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-white/20 to-slate-950/50" />
      </div>

      <div className="relative z-10">

        {/* ── TOP PATRIOTIC ANNOUNCEMENT BAR ── */}
        <div className="bg-gradient-to-r from-blue-950 via-red-600 to-blue-950 text-white py-2 px-3 text-center font-black tracking-wider text-[11px] sm:text-xs uppercase shadow-xl flex items-center justify-center gap-1.5 flex-wrap border-b border-red-500/50">
          <span className="flex items-center gap-1">
            <span>🇺🇸</span> <strong>AMERICAN BOGO OFFER:</strong> BUY 1 GET 1 FREE FOR $99.99
          </span>
          <span className="hidden sm:inline text-amber-300">•</span>
          <span className="text-amber-300 font-black">SAVE OVER $350 + FREE FREIGHT</span>
          <span className="hidden sm:inline text-amber-300">•</span>
          <a
            href="tel:18008482634"
            className="bg-white text-blue-950 px-2.5 py-0.5 rounded-full font-black text-[10px] sm:text-xs hover:bg-amber-300 transition-colors inline-flex items-center gap-1 shadow"
          >
            <FiPhone size={10} className="animate-pulse text-red-600" />
            <span>(800) 848-2634</span>
          </a>
        </div>

        {/* ── CLEAN LIGHT HEADER (GLASSMORPHIC BACKDROP) ── */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-3.5 sm:px-6 lg:px-10 py-3 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-red-600 via-blue-900 to-blue-600 p-0.5 shadow-md shrink-0">
              <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center font-black text-xl sm:text-2xl text-blue-900">
                T
              </div>
            </div>
            <div>
              <div className="text-base sm:text-xl font-black text-blue-950 tracking-wider flex items-center gap-1.5 leading-none">
                TITAN DIAMOND <span className="text-red-600 text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded bg-red-50 border border-red-200 uppercase">USA 🇺🇸</span>
              </div>
              <div className="text-[9px] sm:text-[10px] font-bold text-slate-500 tracking-widest uppercase mt-0.5">
                PRO CONTRACTOR TOOLING
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <a
              href="tel:18008482634"
              className="sm:hidden w-9 h-9 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl flex items-center justify-center shadow-sm active:scale-95 transition-transform"
            >
              <FiPhone size={16} className="animate-bounce text-blue-700" />
            </a>

            <a
              href="#order-section"
              className="bg-gradient-to-r from-red-600 to-blue-900 hover:from-red-500 hover:to-blue-800 text-white px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs font-black tracking-wider uppercase shadow-md transition-all flex items-center gap-1.5 active:scale-95"
            >
              <FiShoppingCart size={14} />
              <span className="hidden sm:inline">CLAIM BOGO $99.99</span>
              <span className="sm:hidden">BUY NOW</span>
            </a>
          </div>
        </header>

        {/* ── LIVE SOCIAL PROOF TICKER ── */}
        <div className="bg-blue-950/95 text-white py-1.5 px-3 border-b border-blue-900 shadow-md backdrop-blur-md">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-bold overflow-hidden w-full sm:w-auto">
              <span className="flex items-center gap-1 text-emerald-400 font-black shrink-0 text-[11px]">
                <FiActivity className="animate-pulse" /> LIVE JOBSITE ORDERS:
              </span>
              <span className="text-slate-200 text-[11px] truncate">
                <strong>{tickerEvents[currentTickerIndex].name}</strong> ({tickerEvents[currentTickerIndex].location}) — <span className="text-amber-300 font-extrabold">{tickerEvents[currentTickerIndex].action}</span>
              </span>
            </div>

            <div className="hidden lg:flex items-center gap-4 text-[11px] font-black text-slate-300">
              <span className="text-emerald-400">✓ 100% IN STOCK</span>
              <span>•</span>
              <span className="text-blue-300">⚡ SAME DAY FREIGHT</span>
              <span>•</span>
              <span className="text-amber-300">🛡️ 30-DAY GUARANTEE</span>
            </div>
          </div>
        </div>

        {/* ── HERO SECTION (REAL FLAG VIDEO BACKGROUND VISIBLE) ── */}
        <section className="relative pt-4 sm:pt-8 pb-10 sm:pb-16 px-3.5 sm:px-6 lg:px-10">
          
          <div className="max-w-7xl mx-auto space-y-5">
            
            {/* Top Patriotic Headline Tag */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 bg-white/95 border border-red-300 text-red-700 rounded-full px-3.5 py-1 text-[10px] sm:text-xs font-black uppercase tracking-wider shadow-md">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                <span>OFFICIAL CONTRACTOR INTRODUCTORY BOGO SPECIAL</span>
              </div>

              <h1 className="text-2xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight uppercase leading-tight max-w-4xl mx-auto drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
                BUY 1 SPEED DEMON, GET 1 ENDURANCE MASTER <span className="text-red-500">FREE!</span>
              </h1>
            </div>

            {/* ── MOBILE ABOVE-THE-FOLD FEATURED BLADE DISPLAY (GLASSMORPHIC OVER REAL FLAG VIDEO) ── */}
            <div className="bg-white/95 backdrop-blur-md rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 border border-slate-200/90 shadow-2xl max-w-4xl mx-auto space-y-4">
              
              <div className="text-center text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center justify-center gap-1">
                <FiMaximize2 className="text-red-600" /> CLICK ANY BLADE IMAGE TO EXPAND FULLSCREEN
              </div>

              {/* 2-Blade Product Graphic Container */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4 relative">
                
                {/* Blade 1: Speed Demon (Clickable Image) */}
                <div
                  onClick={() => setFullscreenImage({
                    src: "/images/intro-offer/patriot-blade-1.png",
                    title: '14" PATRIOT SPEED DEMON BLADE',
                    subtitle: "12mm Laser Welded Turbo Segments — Speed Specialist for Hard Concrete & Rebar"
                  })}
                  className="bg-gradient-to-b from-white to-red-50/50 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-red-200 text-center relative group cursor-pointer hover:border-red-500 transition-all hover:shadow-xl"
                >
                  <span className="absolute top-1.5 left-1.5 bg-red-600 text-white text-[8px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded shadow z-10">
                    PAY FOR BLADE #1 ($99.99)
                  </span>

                  <div className="absolute top-1.5 right-1.5 bg-white text-slate-700 p-1 rounded-full shadow hover:bg-red-600 hover:text-white transition-colors z-10">
                    <FiMaximize2 size={12} />
                  </div>
                  
                  <div className="w-full h-32 sm:h-48 relative my-1.5 flex items-center justify-center">
                    <img
                      src="/images/intro-offer/patriot-blade-1.png"
                      alt="Patriot Speed Demon Blade"
                      className="max-h-full object-contain filter drop-shadow-lg group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
                    />
                  </div>

                  <div className="text-[11px] sm:text-sm font-black text-blue-950 uppercase leading-tight">PATRIOT SPEED DEMON</div>
                  <div className="text-[9px] sm:text-xs text-red-600 font-bold mt-0.5">12mm Turbo Segments</div>
                </div>

                {/* Blade 2: Endurance Master (Clickable Image) */}
                <div
                  onClick={() => setFullscreenImage({
                    src: "/images/intro-offer/patriot-blade-2.png",
                    title: '14" PATRIOT ENDURANCE MASTER BLADE',
                    subtitle: "14mm Slanted Drop Segments — Longevity Specialist for Asphalt & Green Concrete"
                  })}
                  className="bg-gradient-to-b from-white to-emerald-50/60 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-emerald-300 text-center relative group cursor-pointer hover:border-emerald-500 transition-all hover:shadow-xl"
                >
                  <span className="absolute top-1.5 left-1.5 bg-emerald-600 text-white text-[8px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded shadow z-10 animate-pulse">
                    BLADE #2: 100% FREE!
                  </span>

                  <div className="absolute top-1.5 right-1.5 bg-white text-slate-700 p-1 rounded-full shadow hover:bg-emerald-600 hover:text-white transition-colors z-10">
                    <FiMaximize2 size={12} />
                  </div>
                  
                  <div className="w-full h-32 sm:h-48 relative my-1.5 flex items-center justify-center">
                    <img
                      src="/images/intro-offer/patriot-blade-2.png"
                      alt="Patriot Endurance Master Blade"
                      className="max-h-full object-contain filter drop-shadow-lg group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
                    />
                  </div>

                  <div className="text-[11px] sm:text-sm font-black text-blue-950 uppercase leading-tight">PATRIOT ENDURANCE MASTER</div>
                  <div className="text-[9px] sm:text-xs text-emerald-700 font-bold mt-0.5">14mm Drop Segments</div>
                </div>

              </div>

              {/* BOGO Pricing Callout Card */}
              <div className="bg-gradient-to-r from-blue-900 via-blue-950 to-slate-900 text-white p-3.5 sm:p-5 rounded-xl sm:rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                <div>
                  <div className="text-[10px] sm:text-xs font-black text-amber-300 uppercase tracking-wider">TOTAL REGULAR RETAIL VALUE: ${regularValue.toFixed(2)}</div>
                  <div className="text-xs sm:text-sm font-bold text-emerald-400 mt-0.5 flex items-center justify-center sm:justify-start gap-1">
                    <FiCheckCircle /> BUY 1 GET 1 FREE — SAVE ${savings}.00 TODAY!
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[9px] font-black uppercase bg-red-600 px-2 py-0.5 rounded shadow">BOGO TOTAL</span>
                    <div className="text-3xl sm:text-4xl font-black text-white leading-none mt-0.5">${pricePerPack.toFixed(2)}</div>
                  </div>

                  <a
                    href="#order-section"
                    className="bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white px-4 py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg transition-all flex items-center gap-1 active:scale-95 shrink-0"
                  >
                    <span>CLAIM NOW</span>
                    <FiArrowRight size={16} />
                  </a>
                </div>
              </div>

            </div>

            {/* Subheadline & Value Highlights */}
            <div className="max-w-3xl mx-auto text-center space-y-4 pt-2">
              <p className="text-xs sm:text-base text-slate-800 font-semibold leading-relaxed bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-lg">
                Buy <strong className="text-blue-900 font-bold">1x Patriot Speed Demon Blade</strong> for <strong className="text-red-600 font-black text-base sm:text-lg">$99.99</strong> (built for maximum cutting velocity through hard aggregate & cured concrete) and receive <strong className="text-emerald-700 font-bold">1x Patriot Endurance Master Blade</strong> (14mm drop segments for 2x lifespan on asphalt) <span className="text-red-600 font-black underline">100% FREE!</span>
              </p>

              {/* Bullet Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                
                <div className="bg-white/95 backdrop-blur-md border border-slate-200 p-3 rounded-xl flex items-start gap-2.5 shadow-md">
                  <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-black shrink-0 text-base">
                    ⚡
                  </div>
                  <div className="text-xs">
                    <strong className="text-blue-950 block font-black uppercase">BLADE #1: SPEED DEMON</strong>
                    <span className="text-slate-700 font-medium">12mm Laser Welded Segments. Slices 40% faster on hard cured concrete.</span>
                  </div>
                </div>

                <div className="bg-white/95 backdrop-blur-md border border-slate-200 p-3 rounded-xl flex items-start gap-2.5 shadow-md">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-black shrink-0 text-base">
                    🛡️
                  </div>
                  <div className="text-xs">
                    <strong className="text-blue-950 block font-black uppercase">BLADE #2: ENDURANCE MASTER (FREE)</strong>
                    <span className="text-slate-700 font-medium">14mm Drop Segments. Deep undercut protection for 2x asphalt life.</span>
                  </div>
                </div>

              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 justify-center pt-2">
                <a
                  href="#order-section"
                  className="w-full sm:w-auto bg-gradient-to-r from-red-600 via-red-500 to-blue-900 hover:from-red-500 hover:to-blue-800 text-white font-black text-sm sm:text-base px-8 py-4 rounded-xl shadow-xl transition-all flex items-center justify-center gap-2 uppercase tracking-wide active:scale-95"
                >
                  <span>CLAIM BOGO OFFER NOW ($99.99)</span>
                  <FiArrowRight size={18} />
                </a>

                <a
                  href="tel:18008482634"
                  className="w-full sm:w-auto bg-white/95 hover:bg-slate-100 text-slate-900 border border-slate-300 font-bold text-xs sm:text-sm px-6 py-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md active:scale-95"
                >
                  <FiPhone className="text-blue-700 animate-pulse" size={16} />
                  <span>CONFIRM 30-DAY BILLING</span>
                </a>
              </div>

              {/* Contractor Guarantees */}
              <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-800 font-bold pt-1 bg-white/90 backdrop-blur-md py-2 px-4 rounded-full border border-slate-200 inline-flex shadow-sm">
                <span className="flex items-center gap-1 text-[11px]">
                  <FiCheckCircle className="text-emerald-600" /> 100% Risk-Free Guarantee
                </span>
                <span className="flex items-center gap-1 text-[11px]">
                  <FiTruck className="text-blue-700" /> Free Same-Day Freight
                </span>
                <span className="flex items-center gap-1 text-[11px]">
                  <FiFileText className="text-amber-600" /> 30-Day Net Billing
                </span>
              </div>

            </div>

          </div>

        </section>

        {/* ── COUNTDOWN TIMER & STOCK BAR ── */}
        <section className="bg-blue-950 text-white py-5 px-3.5 sm:px-6 border-y border-blue-900 shadow-inner">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/50 flex items-center justify-center text-red-400 shrink-0">
                <FiClock size={22} className="animate-pulse" />
              </div>
              <div>
                <div className="text-[11px] font-black text-amber-300 uppercase tracking-wider">SPECIAL BOGO OFFER EXPIRES IN:</div>
                <div className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight flex items-center gap-1.5 justify-center md:justify-start mt-0.5">
                  <span className="bg-black/60 px-2.5 py-0.5 rounded border border-blue-800">{String(timeLeft.hours).padStart(2, '0')}h</span>
                  <span>:</span>
                  <span className="bg-black/60 px-2.5 py-0.5 rounded border border-blue-800">{String(timeLeft.minutes).padStart(2, '0')}m</span>
                  <span>:</span>
                  <span className="bg-black/60 px-2.5 py-0.5 rounded border border-blue-800">{String(timeLeft.seconds).padStart(2, '0')}s</span>
                </div>
              </div>
            </div>

            <div className="w-full md:w-80 space-y-1">
              <div className="flex justify-between text-[11px] font-black">
                <span className="text-slate-200">TODAY'S BOGO ALLOCATION:</span>
                <span className="text-amber-300">14 / 100 PACKS REMAINING</span>
              </div>
              <div className="w-full bg-blue-900 h-3 rounded-full overflow-hidden border border-blue-800 p-0.5">
                <div className="bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400 h-full rounded-full w-[86%] animate-pulse" />
              </div>
              <div className="text-[10px] text-slate-300 text-right font-bold">86% Claimed by contractors today</div>
            </div>

          </div>
        </section>

        {/* ── 4 FULL TECHNICAL SPECIFICATIONS BREAKDOWN ── */}
        <section className="py-12 sm:py-16 px-3.5 sm:px-6 lg:px-10 max-w-6xl mx-auto space-y-10">
          
          <div className="text-center space-y-2 max-w-3xl mx-auto">
            <span className="bg-blue-100/90 text-blue-900 border border-blue-200 text-[10px] sm:text-xs font-black px-3.5 py-1 rounded-full uppercase tracking-widest shadow-sm">
              ENGINEERING SPECIFICATIONS
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-blue-950 uppercase tracking-tight drop-shadow-[0_2px_8px_rgba(255,255,255,0.8)]">
              4 FULL CONTRACTOR SPECIFICATIONS
            </h2>
            <p className="text-xs sm:text-sm text-slate-900 font-bold bg-white/80 backdrop-blur-sm px-4 py-1 rounded-full inline-block">
              Engineered in the USA with heavy-duty laser welding and GE industrial synthetic diamond matrices.
            </p>
          </div>

          {/* 4 Specifications Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Spec 1: Segment Geometry & Weld */}
            <div className="bg-white/95 backdrop-blur-md border border-slate-200 p-5 rounded-2xl shadow-lg space-y-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-black text-lg">
                <FiLayers />
              </div>
              <div>
                <span className="text-[10px] font-black text-red-600 uppercase tracking-wider">SPECIFICATION #1</span>
                <h3 className="text-base font-black text-blue-950 uppercase">LASER WELD BOND & SEGMENT HEIGHT</h3>
              </div>
              <ul className="text-xs text-slate-700 space-y-1.5 font-medium border-t border-slate-100 pt-2">
                <li className="flex items-start gap-1.5">
                  <FiCheck className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>100% Direct Laser Welded:</strong> Tested to 14,000 PSI segment shear resistance.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <FiCheck className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Speed Demon:</strong> 12mm Turbo Vented Segments for high-velocity slurry clearing.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <FiCheck className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Endurance Master:</strong> 14mm Slanted Drop Segments prevent undercut core wear.</span>
                </li>
              </ul>
            </div>

            {/* Spec 2: Diamond Matrix */}
            <div className="bg-white/95 backdrop-blur-md border border-slate-200 p-5 rounded-2xl shadow-lg space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-black text-lg">
                <FiCpu />
              </div>
              <div>
                <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider">SPECIFICATION #2</span>
                <h3 className="text-base font-black text-blue-950 uppercase">GE SYNTHETIC DIAMOND CONCENTRATION</h3>
              </div>
              <ul className="text-xs text-slate-700 space-y-1.5 font-medium border-t border-slate-100 pt-2">
                <li className="flex items-start gap-1.5">
                  <FiCheck className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>High-Purity Diamonds:</strong> Premium GE/De Beers industrial synthetic diamond crystals.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <FiCheck className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>45% Diamond Concentration:</strong> Engineered for zero segment glazing under high RPMs.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <FiCheck className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Cobalt-Bronze Matrix:</strong> Self-sharpening bond exposes fresh diamond edges.</span>
                </li>
              </ul>
            </div>

            {/* Spec 3: Steel Core Tensioning */}
            <div className="bg-white/95 backdrop-blur-md border border-slate-200 p-5 rounded-2xl shadow-lg space-y-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-black text-lg">
                <FiFeather />
              </div>
              <div>
                <span className="text-[10px] font-black text-blue-800 uppercase tracking-wider">SPECIFICATION #3</span>
                <h3 className="text-base font-black text-blue-950 uppercase">TENSIONED ALLOY STEEL CORE</h3>
              </div>
              <ul className="text-xs text-slate-700 space-y-1.5 font-medium border-t border-slate-100 pt-2">
                <li className="flex items-start gap-1.5">
                  <FiCheck className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Pre-Tensioned Steel:</strong> Precision heat-treated alloy steel core eliminates wobble.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <FiCheck className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Thermal Expansion Slots:</strong> Laser-cut gullets dissipate heat during dry cuts.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <FiCheck className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Vibration Control:</strong> Smooth, straight cuts without flex or saw fatigue.</span>
                </li>
              </ul>
            </div>

            {/* Spec 4: Equipment & Arbor Specs */}
            <div className="bg-white/95 backdrop-blur-md border border-slate-200 p-5 rounded-2xl shadow-lg space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-lg">
                <FiTool />
              </div>
              <div>
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">SPECIFICATION #4</span>
                <h3 className="text-base font-black text-blue-950 uppercase">UNIVERSAL EQUIPMENT COMPATIBILITY</h3>
              </div>
              <ul className="text-xs text-slate-700 space-y-1.5 font-medium border-t border-slate-100 pt-2">
                <li className="flex items-start gap-1.5">
                  <FiCheck className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>1" Arbor + 20mm Bushing:</strong> Heavy-duty brass adapter bushing included.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <FiCheck className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Gas Cut-Off Saws:</strong> Fits Stihl TS420/500i, Husqvarna K770/970, Makita.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <FiCheck className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Walk-Behind & Table Saws:</strong> Approved for saws up to 20HP (Wet or Dry).</span>
                </li>
              </ul>
            </div>

          </div>

          {/* Tab Switcher for Deep Dive Comparison */}
          <div className="flex justify-center pt-4">
            <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm inline-flex gap-1.5 w-full sm:w-auto">
              <button
                onClick={() => setActiveBladeTab("speed")}
                className={`flex-1 sm:flex-initial px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-black text-[11px] sm:text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                  activeBladeTab === "speed"
                    ? "bg-red-600 text-white shadow-md"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FiZap /> SPEED DEMON DETAILS
              </button>
              <button
                onClick={() => setActiveBladeTab("life")}
                className={`flex-1 sm:flex-initial px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-black text-[11px] sm:text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                  activeBladeTab === "life"
                    ? "bg-blue-900 text-white shadow-md"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FiShield /> ENDURANCE MASTER DETAILS
              </button>
            </div>
          </div>

          {/* Dynamic Blade Info Panel */}
          {activeBladeTab === "speed" ? (
            <div className="bg-white/95 backdrop-blur-md border border-red-200 rounded-2xl sm:rounded-3xl p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center shadow-xl">
              <div className="lg:col-span-5 flex flex-col items-center cursor-pointer" onClick={() => setFullscreenImage({ src: "/images/intro-offer/patriot-blade-1.png", title: '14" Patriot Speed Demon Blade', subtitle: "12mm Laser Welded Turbo Segments" })}>
                <div className="w-44 h-44 sm:w-56 sm:h-56 relative flex items-center justify-center">
                  <img
                    src="/images/intro-offer/patriot-blade-1.png"
                    alt="Patriot Speed Demon"
                    className="max-h-full object-contain filter drop-shadow-md hover:scale-105 transition-transform"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
                  />
                </div>
                <span className="text-xs font-black text-red-600 uppercase mt-3 flex items-center gap-1">
                  <FiMaximize2 /> Click for Fullscreen Image
                </span>
              </div>

              <div className="lg:col-span-7 space-y-3.5 text-xs">
                <div className="flex items-center gap-2 text-red-600 font-black uppercase">
                  <FiZap /> SPEED SPECIALIST (MEDUSA MATRIX)
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-blue-950 uppercase">PATRIOT SPEED DEMON</h3>
                <p className="text-slate-700 leading-relaxed font-medium">
                  Engineered for maximum cutting speed on hard aggregate, cured concrete, and rebar. The 12mm turbo-vented segment design clears slurry rapidly, allowing your saw to run at full RPM without bogging down.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block font-bold">Cutting Speed Rating:</span>
                    <strong className="text-red-600 font-black text-xs sm:text-sm">9.9 / 10 (EXPERT FAST)</strong>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block font-bold">Primary Application:</span>
                    <strong className="text-blue-950 font-black text-xs sm:text-sm">Hard Concrete & Granite</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white/95 backdrop-blur-md border border-blue-200 rounded-2xl sm:rounded-3xl p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center shadow-xl">
              <div className="lg:col-span-5 flex flex-col items-center cursor-pointer" onClick={() => setFullscreenImage({ src: "/images/intro-offer/patriot-blade-2.png", title: '14" Patriot Endurance Master Blade', subtitle: "14mm Slanted Drop Segments" })}>
                <div className="w-44 h-44 sm:w-56 sm:h-56 relative flex items-center justify-center">
                  <img
                    src="/images/intro-offer/patriot-blade-2.png"
                    alt="Patriot Endurance Master"
                    className="max-h-full object-contain filter drop-shadow-md hover:scale-105 transition-transform"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
                  />
                </div>
                <span className="text-xs font-black text-blue-800 uppercase mt-3 flex items-center gap-1">
                  <FiMaximize2 /> Click for Fullscreen Image
                </span>
              </div>

              <div className="lg:col-span-7 space-y-3.5 text-xs">
                <div className="flex items-center gap-2 text-blue-800 font-black uppercase">
                  <FiShield /> LONGEVITY SPECIALIST (BARBARIAN BOND)
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-blue-950 uppercase">PATRIOT ENDURANCE MASTER</h3>
                <p className="text-slate-700 leading-relaxed font-medium">
                  Engineered for maximum footage and wear resistance. Features 14mm deep slanted drop-segments that protect the steel core from abrasive undercut wear when slicing through asphalt, green concrete, brick, and block.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block font-bold">Blade Lifespan Rating:</span>
                    <strong className="text-emerald-700 font-black text-xs sm:text-sm">2X EXTENDED FOOTAGE</strong>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block font-bold">Primary Application:</span>
                    <strong className="text-blue-950 font-black text-xs sm:text-sm">Asphalt & Green Concrete</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

        </section>

        {/* ── ORDER SECTION: CREDIT CARD vs 30-DAY BILLING ── */}
        <section id="order-section" className="py-12 sm:py-16 px-3.5 sm:px-6 lg:px-10 max-w-5xl mx-auto scroll-mt-16">
          
          <div className="bg-white/95 backdrop-blur-md border-2 border-slate-300 rounded-2xl sm:rounded-3xl p-4 sm:p-10 shadow-2xl space-y-6 sm:space-y-8 relative">
            
            <div className="text-center space-y-2">
              <span className="inline-block bg-blue-100 text-blue-900 border border-blue-200 text-[10px] sm:text-xs font-black px-3.5 py-1 rounded-full uppercase tracking-wider">
                OFFICIAL CONTRACTOR BOGO ORDER FORM
              </span>
              <h2 className="text-2xl sm:text-4xl font-black text-blue-950 uppercase tracking-tight">
                14" PATRIOT BOGO CHECKOUT
              </h2>
              <p className="text-xs text-slate-600 font-medium">Pay by Credit Card or Confirm 30-Day Business Account Billing.</p>
            </div>

            {/* Locked 14" Package Badge & Quantity Selector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-200">
              
              {/* Locked 14" BOGO Package Badge */}
              <div className="space-y-2">
                <label className="text-xs font-black text-blue-950 uppercase tracking-wider block">
                  1. SELECTED BOGO PACKAGE:
                </label>
                <div className="bg-blue-900 text-white p-3.5 rounded-xl border border-blue-900 shadow-md flex items-center justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-white">14" PATRIOT 2-BLADE BOGO PACK</div>
                    <div className="text-[11px] font-bold text-amber-300">1x 14" Speed + 1x 14" Life Blade</div>
                  </div>
                  <div className="text-right">
                    <span className="bg-red-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow">ONLY</span>
                    <div className="text-xl font-black text-white">$99.99</div>
                  </div>
                </div>
              </div>

              {/* Quantity Selector */}
              <div className="space-y-2">
                <label className="text-xs font-black text-blue-950 uppercase tracking-wider block">
                  2. QUANTITY OF BOGO PACKAGES:
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-13 h-12 bg-white border border-slate-300 hover:bg-slate-100 text-slate-900 font-black text-xl rounded-xl flex items-center justify-center active:scale-95 shrink-0 shadow-sm"
                  >
                    -
                  </button>
                  <div className="flex-1 bg-white border border-slate-300 h-12 rounded-xl flex items-center justify-center text-xs sm:text-sm font-black text-blue-950 px-2 shadow-sm">
                    {quantity} {quantity === 1 ? "Package (2 Blades)" : "Packages (" + (quantity * 2) + " Blades)"}
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-13 h-12 bg-white border border-slate-300 hover:bg-slate-100 text-slate-900 font-black text-xl rounded-xl flex items-center justify-center active:scale-95 shrink-0 shadow-sm"
                  >
                    +
                  </button>
                </div>
              </div>

            </div>

            {/* Payment Method Selector */}
            <div className="space-y-3">
              <label className="text-xs font-black text-blue-950 uppercase tracking-wider block">
                3. SELECT PAYMENT METHOD:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                <button
                  type="button"
                  onClick={() => setActiveTab("credit_card")}
                  className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all flex items-center gap-3.5 active:scale-95 ${
                    activeTab === "credit_card"
                      ? "bg-red-50 border-red-600 text-red-950 shadow-md ring-2 ring-red-600/30"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${activeTab === "credit_card" ? "bg-red-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                    <FiCreditCard size={20} />
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-black uppercase text-blue-950">CREDIT CARD CHECKOUT</div>
                    <div className="text-[10px] sm:text-[11px] text-slate-500">Visa, Mastercard, Amex, Discover</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("30_day_billing")}
                  className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all flex items-center gap-3.5 active:scale-95 ${
                    activeTab === "30_day_billing"
                      ? "bg-blue-50 border-blue-800 text-blue-950 shadow-md ring-2 ring-blue-800/30"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${activeTab === "30_day_billing" ? "bg-blue-900 text-white" : "bg-slate-200 text-slate-600"}`}>
                    <FiFileText size={20} />
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-black uppercase text-blue-950">30-DAY NET BILLING</div>
                    <div className="text-[10px] sm:text-[11px] text-slate-500">Invoice Account / Call to Confirm</div>
                  </div>
                </button>

              </div>
            </div>

            {/* Form Fields */}
            <form onSubmit={handleSubmitOrder} className="space-y-6">
              
              <div className="space-y-4">
                <h4 className="text-xs font-black text-blue-950 uppercase tracking-wider border-b border-slate-200 pb-2">
                  CUSTOMER & SHIPPING INFORMATION
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">FULL NAME *</label>
                    <input
                      type="text"
                      name="customerName"
                      required
                      value={formData.customerName}
                      onChange={handleInputChange}
                      placeholder="e.g. John Miller"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-base sm:text-xs text-slate-900 focus:outline-none focus:border-red-600 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">COMPANY NAME (OPTIONAL)</label>
                    <input
                      type="text"
                      name="companyName"
                      value={formData.companyName}
                      onChange={handleInputChange}
                      placeholder="e.g. Apex Concrete LLC"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-base sm:text-xs text-slate-900 focus:outline-none focus:border-red-600 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">EMAIL ADDRESS *</label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="john@apexconcrete.com"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-base sm:text-xs text-slate-900 focus:outline-none focus:border-red-600 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">PHONE NUMBER *</label>
                    <input
                      type="tel"
                      name="phone"
                      required
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="(555) 000-0000"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-base sm:text-xs text-slate-900 focus:outline-none focus:border-red-600 font-medium"
                    />
                  </div>
                </div>

                {/* Delivery Address */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">SHIPPING STREET ADDRESS *</label>
                    <input
                      type="text"
                      name="address"
                      required
                      value={formData.address}
                      onChange={handleInputChange}
                      placeholder="123 Industrial Parkway"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-base sm:text-xs text-slate-900 focus:outline-none focus:border-red-600 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">CITY *</label>
                    <input
                      type="text"
                      name="city"
                      required
                      value={formData.city}
                      onChange={handleInputChange}
                      placeholder="Dallas"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-base sm:text-xs text-slate-900 focus:outline-none focus:border-red-600 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">STATE / ZIP *</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        name="state"
                        required
                        value={formData.state}
                        onChange={handleInputChange}
                        placeholder="TX"
                        className="w-16 bg-slate-50 border border-slate-300 rounded-xl px-3 py-3 text-base sm:text-xs text-slate-900 text-center font-bold focus:outline-none focus:border-red-600 uppercase"
                      />
                      <input
                        type="text"
                        name="zip"
                        required
                        value={formData.zip}
                        onChange={handleInputChange}
                        placeholder="75001"
                        className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-3 text-base sm:text-xs text-slate-900 text-center font-medium focus:outline-none focus:border-red-600"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* TAB SPECIFIC INPUTS */}
              {activeTab === "credit_card" ? (
                <div className="space-y-4 bg-red-50/50 p-4 sm:p-5 rounded-2xl border border-red-200">
                  <h4 className="text-xs font-black text-red-700 uppercase tracking-wider flex items-center gap-2">
                    <FiCreditCard /> CREDIT CARD DETAILS
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
                    <div className="sm:col-span-2">
                      <label className="block font-bold text-slate-700 mb-1">NAME ON CARD</label>
                      <input
                        type="text"
                        name="cardName"
                        value={formData.cardName}
                        onChange={handleInputChange}
                        placeholder="Name as printed on card"
                        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-base sm:text-xs text-slate-900 focus:outline-none focus:border-red-600 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">CARD NUMBER</label>
                      <input
                        type="text"
                        name="cardNumber"
                        value={formData.cardNumber}
                        onChange={handleInputChange}
                        placeholder="•••• •••• •••• ••••"
                        maxLength={19}
                        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-base sm:text-xs text-slate-900 focus:outline-none focus:border-red-600 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">EXPIRY DATE</label>
                      <input
                        type="text"
                        name="cardExpiry"
                        value={formData.cardExpiry}
                        onChange={handleInputChange}
                        placeholder="MM/YY"
                        maxLength={5}
                        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-base sm:text-xs text-slate-900 text-center focus:outline-none focus:border-red-600 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">CVC CODE</label>
                      <input
                        type="password"
                        name="cardCvc"
                        value={formData.cardCvc}
                        onChange={handleInputChange}
                        placeholder="•••"
                        maxLength={4}
                        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-base sm:text-xs text-slate-900 text-center focus:outline-none focus:border-red-600 font-mono"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 bg-blue-50/50 p-4 sm:p-5 rounded-2xl border border-blue-200">
                  <h4 className="text-xs font-black text-blue-900 uppercase tracking-wider flex items-center gap-2">
                    <FiFileText /> 30-DAY NET BILLING CONFIRMATION
                  </h4>
                  <p className="text-xs text-slate-700 font-medium">
                    Approved commercial accounts pay <strong>$0 TODAY</strong>. An itemized invoice for <strong>${totalPrice}</strong> will be included with your shipment, due in 30 days.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">PURCHASE ORDER # (OPTIONAL)</label>
                      <input
                        type="text"
                        name="poNumber"
                        value={formData.poNumber}
                        onChange={handleInputChange}
                        placeholder="e.g. PO-9842"
                        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-base sm:text-xs text-slate-900 focus:outline-none focus:border-blue-900 font-medium"
                      />
                    </div>

                    <div className="flex items-end">
                      <a
                        href="tel:18008482634"
                        className="w-full bg-blue-900 hover:bg-blue-800 text-white rounded-xl px-4 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors active:scale-95 shadow-sm"
                      >
                        <FiPhone className="text-amber-300 animate-pulse" />
                        <span>CALL IN: (800) 848-2634</span>
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Total & Submit Button */}
              <div className="bg-slate-950 text-white p-4 sm:p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                <div className="text-center sm:text-left">
                  <div className="text-xs font-bold text-slate-300 uppercase">TOTAL AMOUNT DUE:</div>
                  <div className="text-3xl font-black text-white tracking-tight">${totalPrice}</div>
                  <div className="text-xs text-emerald-400 font-bold">Includes 2x 14" Blades (BOGO Pack) + FREE Freight</div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full sm:w-auto px-8 py-4 rounded-xl font-black text-sm sm:text-base uppercase tracking-wider text-white shadow-2xl transition-all flex items-center justify-center gap-2.5 active:scale-95 ${
                    activeTab === "credit_card"
                      ? "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-red-600/40"
                      : "bg-gradient-to-r from-blue-700 to-blue-900 hover:from-blue-600 hover:to-blue-800 shadow-blue-900/40"
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

        {/* ── PATRIOTIC TRUST & FOOTER ── */}
        <section className="py-12 sm:py-16 px-3.5 sm:px-6 lg:px-10 bg-white/90 backdrop-blur-md border-t border-slate-200">
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 text-center">
            
            <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-2.5 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center mx-auto text-2xl font-black">
                🇺🇸
              </div>
              <h4 className="text-base sm:text-lg font-black text-blue-950 uppercase">100% AMERICAN OWNED & SERVICED</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Based in Austin, Texas. Expert customer support and dedicated diamond tooling specialists standing by.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-2.5 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                <FiShield size={24} />
              </div>
              <h4 className="text-base sm:text-lg font-black text-blue-950 uppercase">RISK-FREE 30-DAY GUARANTEE</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                If these Patriot blades don't out-cut your existing tools, return them for a 100% full refund or credit.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-2.5 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center mx-auto">
                <FiTruck size={24} />
              </div>
              <h4 className="text-base sm:text-lg font-black text-blue-950 uppercase">SAME-DAY EXPRESS FREIGHT</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Orders placed before 3:00 PM EST ship same day directly to your job site or equipment yard.
              </p>
            </div>

          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="py-8 px-4 border-t border-slate-200 bg-slate-100/90 text-center text-xs text-slate-600 space-y-2">
          <div className="flex items-center justify-center gap-2 font-black text-blue-950 flex-wrap">
            <span>TITAN DIAMOND TOOLS USA</span>
            <span>•</span>
            <a href="tel:18008482634" className="hover:text-red-600 transition-colors">(800) 848-2634</a>
            <span>•</span>
            <span>INDUSTRIAL CONTRACTOR GRADE</span>
          </div>
          <p>© {new Date().getFullYear()} Titan Diamond. All rights reserved.</p>
        </footer>

        {/* ── HIGH-CONVERTING STICKY MOBILE BOTTOM BAR ── */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-2xl border-t border-slate-300 p-3 flex items-center justify-between gap-2.5 shadow-[0_-10px_25px_rgba(0,0,0,0.15)]">
          <div>
            <div className="text-[9px] font-black text-red-600 uppercase tracking-widest">BUY 1 GET 1 FREE</div>
            <div className="text-xl font-black text-blue-950 leading-none">${pricePerPack.toFixed(2)}</div>
            <div className="text-[9px] font-bold text-emerald-700 mt-0.5">SAVE ${savings} + FREE SHIP</div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="tel:18008482634"
              className="w-10 h-10 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl flex items-center justify-center shrink-0 active:scale-95 shadow-sm"
            >
              <FiPhone size={18} />
            </a>
            <a
              href="#order-section"
              className="bg-gradient-to-r from-red-600 to-blue-900 text-white font-black text-xs uppercase px-4 py-3 rounded-xl tracking-wider shadow-md flex items-center gap-1.5 active:scale-95 shrink-0"
            >
              <span>CLAIM OFFER</span>
              <FiArrowRight size={14} />
            </a>
          </div>
        </div>

        {/* ── FULLSCREEN BLADE IMAGE PREVIEW MODAL ── */}
        {fullscreenImage && (
          <div
            onClick={() => setFullscreenImage(null)}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative bg-gradient-to-b from-slate-900 to-black border border-slate-700 rounded-3xl max-w-3xl w-full p-6 text-center space-y-4 shadow-2xl cursor-default"
            >
              <button
                onClick={() => setFullscreenImage(null)}
                className="absolute top-4 right-4 bg-slate-800 text-slate-300 hover:text-white p-2 rounded-full border border-slate-700 shadow-md transition-colors"
              >
                <FiX size={22} />
              </button>

              <div>
                <span className="bg-red-600 text-white font-black text-[10px] uppercase px-3 py-1 rounded-full tracking-widest shadow">
                  HIGH RESOLUTION PATRIOT RENDER
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-white uppercase mt-2">{fullscreenImage.title}</h3>
                <p className="text-xs text-slate-300 font-medium">{fullscreenImage.subtitle}</p>
              </div>

              <div className="w-full h-80 sm:h-96 relative flex items-center justify-center py-4 bg-black/40 rounded-2xl border border-slate-800/80">
                <img
                  src={fullscreenImage.src}
                  alt={fullscreenImage.title}
                  className="max-h-full max-w-full object-contain filter drop-shadow-[0_0_30px_rgba(220,38,38,0.5)] animate-scale-in"
                />
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setFullscreenImage(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-6 py-3 rounded-xl text-xs uppercase"
                >
                  CLOSE PREVIEW
                </button>

                <a
                  href="#order-section"
                  onClick={() => setFullscreenImage(null)}
                  className="bg-gradient-to-r from-red-600 to-blue-600 text-white font-black px-6 py-3 rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-lg"
                >
                  <FiShoppingCart size={14} />
                  <span>CLAIM BOGO OFFER NOW ($99.99)</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ── ORDER SUCCESS CONFIRMATION MODAL ── */}
        {orderCompleted && (
          <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white border border-slate-300 rounded-3xl max-w-xl w-full p-5 sm:p-8 space-y-6 relative shadow-2xl text-slate-900 max-h-[90vh] overflow-y-auto">
              
              <button
                onClick={() => setOrderCompleted(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-2"
              >
                <FiX size={20} />
              </button>

              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl font-black">
                  ✓
                </div>
                <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                  ORDER CONFIRMED • {orderCompleted.orderId}
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-blue-950 uppercase">THANK YOU FOR YOUR ORDER!</h3>
                <p className="text-xs text-slate-600 font-medium">
                  {orderCompleted.message}
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Order Reference:</span>
                  <strong className="text-blue-950 font-mono">{orderCompleted.orderId}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Item Package:</span>
                  <strong className="text-blue-950 font-bold">{orderCompleted.bladeSize}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Quantity:</span>
                  <strong className="text-blue-950">{orderCompleted.quantity} Pack(s)</strong>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Payment Terms:</span>
                  <strong className="text-amber-700">
                    {orderCompleted.paymentMethod === "thirty_day_billing" ? "30-Day Net Invoice" : "Credit Card Paid"}
                  </strong>
                </div>
                <div className="flex justify-between pt-1 text-sm font-black">
                  <span className="text-slate-700">Total Amount:</span>
                  <span className="text-blue-950">${orderCompleted.totalAmount.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.print()}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2"
                >
                  <FiPrinter /> PRINT RECEIPT
                </button>
                <button
                  onClick={() => setOrderCompleted(null)}
                  className="flex-1 bg-gradient-to-r from-red-600 to-blue-900 text-white font-black py-3 rounded-xl text-xs uppercase"
                >
                  DONE
                </button>
              </div>

            </div>
          </div>
        )}

      </div>

    </div>
  )
}
