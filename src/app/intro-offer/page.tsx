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
  FiLock,
  FiDollarSign,
  FiAward
} from "react-icons/fi"

export default function StandalonePatriotOfferPage() {
  // Offer Selection State
  const [selectedSize, setSelectedSize] = useState<"14" | "16" | "20">("14")
  const [quantity, setQuantity] = useState<number>(1)
  const [activeTab, setActiveTab] = useState<"credit_card" | "30_day_billing">("credit_card")
  const [activeBladeTab, setActiveBladeTab] = useState<"speed" | "life">("speed")
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [orderCompleted, setOrderCompleted] = useState<any>(null)

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

  // BOGO Pricing Calculations ($99.99 for 14", $129.99 for 16", $169.99 for 20")
  const pricePerPack = selectedSize === "14" ? 99.99 : selectedSize === "16" ? 129.99 : 169.99
  const regularValue = selectedSize === "14" ? 459.98 : selectedSize === "16" ? 529.98 : 649.98
  const savings = Math.round(regularValue - pricePerPack)
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
          bladeSize: `${selectedSize}-inch BOGO Package (Buy 1 Get 1 Free)`,
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
          bladeSize: `${selectedSize}" BOGO Pack (2 Blades)`,
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
    <div className="min-h-screen bg-[#040507] text-slate-100 font-sans selection:bg-red-600 selection:text-white pb-20 md:pb-0">

      {/* ── TOP PATRIOTIC ANNOUNCEMENT BAR (MOBILE OPTIMIZED) ── */}
      <div className="bg-gradient-to-r from-blue-700 via-red-600 to-blue-700 text-white py-2 px-3 text-center font-black tracking-wider text-[11px] sm:text-xs uppercase shadow-xl flex items-center justify-center gap-1.5 flex-wrap border-b border-red-500/30">
        <span className="flex items-center gap-1">
          <span>🇺🇸</span> <strong>BOGO SPECIAL:</strong> BUY 1 GET 1 FREE FOR $99.99
        </span>
        <span className="hidden sm:inline text-amber-300">•</span>
        <span className="text-amber-300 font-black">SAVE OVER $350</span>
        <span className="hidden sm:inline text-amber-300">•</span>
        <a
          href="tel:18008482634"
          className="bg-white text-blue-950 px-2.5 py-0.5 rounded-full font-black text-[10px] sm:text-xs hover:bg-yellow-300 transition-colors inline-flex items-center gap-1 shadow-md ml-1"
        >
          <FiPhone size={10} className="animate-pulse text-red-600" />
          <span>(800) 848-2634</span>
        </a>
      </div>

      {/* ── STANDALONE CUSTOMER HEADER (MOBILE OPTIMIZED) ── */}
      <header className="sticky top-0 z-30 bg-[#07090e]/95 backdrop-blur-2xl border-b border-slate-800/90 px-3.5 sm:px-6 lg:px-10 py-3 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-red-600 via-white to-blue-600 p-0.5 shadow-[0_0_20px_rgba(220,38,38,0.5)] shrink-0">
            <div className="w-full h-full bg-[#07090e] rounded-[10px] flex items-center justify-center font-black text-xl sm:text-2xl text-white">
              T
            </div>
          </div>
          <div>
            <div className="text-base sm:text-xl font-black text-white tracking-wider flex items-center gap-1.5 leading-none">
              TITAN DIAMOND <span className="text-red-500 text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded bg-red-950/90 border border-red-700/60 uppercase">USA 🇺🇸</span>
            </div>
            <div className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 tracking-widest uppercase mt-0.5">
              PRO DIAMOND TOOLING
            </div>
          </div>
        </div>

        {/* Mobile Header Actions */}
        <div className="flex items-center gap-2">
          <a
            href="tel:18008482634"
            className="sm:hidden w-9 h-9 bg-blue-950/90 border border-blue-600/50 text-blue-400 rounded-xl flex items-center justify-center shadow-md active:scale-95 transition-transform"
          >
            <FiPhone size={16} className="animate-bounce" />
          </a>

          <a
            href="#order-section"
            className="bg-gradient-to-r from-red-600 via-red-500 to-blue-600 hover:from-red-500 hover:to-blue-500 text-white px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs font-black tracking-wider uppercase shadow-[0_0_20px_rgba(220,38,38,0.5)] transition-all flex items-center gap-1.5 active:scale-95"
          >
            <FiShoppingCart size={14} />
            <span className="hidden sm:inline">CLAIM BOGO $99.99</span>
            <span className="sm:hidden">BUY NOW</span>
          </a>
        </div>
      </header>

      {/* ── LIVE SOCIAL PROOF TICKER ── */}
      <div className="bg-slate-950/90 border-b border-slate-800/80 py-2 px-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-300 font-bold overflow-hidden w-full sm:w-auto">
            <span className="flex items-center gap-1 text-emerald-400 font-black shrink-0 text-[11px]">
              <FiActivity className="animate-pulse" /> LIVE ORDERS:
            </span>
            <span className="text-slate-100 text-[11px] truncate">
              <strong>{tickerEvents[currentTickerIndex].name}</strong> — <span className="text-amber-400 font-extrabold">{tickerEvents[currentTickerIndex].action}</span>
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-4 text-[11px] font-black text-slate-400">
            <span className="text-emerald-400">✓ 100% IN STOCK</span>
            <span>•</span>
            <span className="text-blue-400">⚡ SAME DAY SHIPPING</span>
            <span>•</span>
            <span className="text-amber-400">🛡️ 30-DAY GUARANTEE</span>
          </div>
        </div>
      </div>

      {/* ── HERO SECTION (MOBILE FIRST OVERHAUL) ── */}
      <section className="relative overflow-hidden pt-6 sm:pt-10 pb-12 sm:pb-20 px-3.5 sm:px-6 lg:px-10 border-b border-slate-800/80 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950/40 via-[#040507] to-[#040507]">
        
        {/* Glow & Backdrop Effects */}
        <div className="absolute top-0 left-1/3 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-red-600/15 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-10 right-1/4 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-blue-600/15 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center relative z-10">

          {/* Left Column: Mobile Optimized Headline & BOGO Deal Callouts */}
          <div className="lg:col-span-7 space-y-5 text-center lg:text-left">
            
            {/* Eagle Shield Badge */}
            <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-red-950 via-slate-900 to-blue-950 border border-red-500/40 rounded-full px-3.5 py-1 text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-100 shadow-xl">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span>OFFICIAL CONTRACTOR BOGO INTRO OFFER</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight uppercase leading-[1.1]">
              BUY 1 SPEED DEMON, <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-amber-300 to-blue-500">
                GET 1 ENDURANCE MASTER FREE!
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-sm sm:text-base lg:text-lg text-slate-300 font-medium leading-relaxed max-w-2xl mx-auto lg:mx-0">
              Buy <strong className="text-amber-400 font-bold">1x Patriot Speed Demon Blade</strong> for <strong className="text-white font-black text-base sm:text-xl">$99.99</strong> and receive <strong className="text-blue-400 font-bold">1x Patriot Endurance Master Blade</strong> (14mm drop segments for 2x lifespan) <span className="text-emerald-400 font-black underline decoration-emerald-500 underline-offset-4">100% FREE!</span>
            </p>

            {/* HIGH-IMPACT BOGO PRICING CARD (FEATURED PROMINENTLY) */}
            <div className="bg-gradient-to-r from-slate-900 via-[#0a0d14] to-black border-2 border-amber-500/70 p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-[0_0_35px_rgba(245,158,11,0.25)] flex flex-col sm:flex-row items-center justify-between gap-4 max-w-xl mx-auto lg:mx-0 relative overflow-hidden text-left">
              <div className="w-full sm:w-auto text-center sm:text-left">
                <div className="text-[10px] sm:text-xs font-black text-amber-400 uppercase tracking-widest">TOTAL RETAIL VALUE</div>
                <div className="text-lg sm:text-xl font-bold text-slate-500 line-through">${regularValue.toFixed(2)}</div>
                <div className="text-xs font-black text-emerald-400 mt-0.5 flex items-center justify-center sm:justify-start gap-1">
                  <FiCheckCircle /> BUY 1 GET 1 FREE — SAVE ${savings}.00!
                </div>
              </div>

              <div className="w-full sm:w-auto text-center sm:text-right border-t sm:border-t-0 sm:border-l border-slate-800 pt-3 sm:pt-0 sm:pl-6">
                <span className="bg-red-600 text-white text-[9px] sm:text-[10px] font-black uppercase px-2.5 py-0.5 rounded shadow">
                  BOGO OFFER PRICE
                </span>
                <div className="text-4xl sm:text-5xl font-black text-white tracking-tight mt-0.5">${pricePerPack.toFixed(2)}</div>
                <div className="text-[11px] font-bold text-blue-400 mt-0.5">Includes 2x Blades + Free Express Freight</div>
              </div>
            </div>

            {/* Core Feature Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-xl mx-auto lg:mx-0">
              
              <div className="bg-gradient-to-br from-red-950/40 via-slate-900 to-slate-950 border border-red-800/40 p-3 rounded-xl flex items-start gap-2.5 shadow-md">
                <div className="w-9 h-9 rounded-lg bg-red-600/20 text-red-500 flex items-center justify-center font-black shrink-0 text-base">
                  ⚡
                </div>
                <div className="text-xs">
                  <strong className="text-white block font-black uppercase">BLADE #1: PATRIOT SPEED DEMON</strong>
                  <span className="text-slate-300 font-medium">12mm Laser Welded Segments. Cut 40% faster on hard concrete.</span>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-950/40 via-slate-900 to-slate-950 border border-blue-800/40 p-3 rounded-xl flex items-start gap-2.5 shadow-md">
                <div className="w-9 h-9 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-black shrink-0 text-base">
                  🛡️
                </div>
                <div className="text-xs">
                  <strong className="text-white block font-black uppercase">BLADE #2: ENDURANCE MASTER (FREE)</strong>
                  <span className="text-slate-300 font-medium">14mm Drop Segments. 2x lifespan on asphalt & green concrete.</span>
                </div>
              </div>

            </div>

            {/* Hero Action CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 justify-center lg:justify-start pt-1">
              <a
                href="#order-section"
                className="w-full sm:w-auto bg-gradient-to-r from-red-600 via-red-500 to-blue-600 hover:from-red-500 hover:to-blue-500 text-white font-black text-sm sm:text-base px-8 py-4 rounded-xl shadow-[0_0_30px_rgba(220,38,38,0.5)] transition-all flex items-center justify-center gap-2 uppercase tracking-wide active:scale-95"
              >
                <span>CLAIM BOGO OFFER NOW ($99.99)</span>
                <FiArrowRight size={18} />
              </a>

              <a
                href="tel:18008482634"
                className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold text-xs sm:text-sm px-6 py-4 rounded-xl transition-colors flex items-center justify-center gap-2 active:scale-95"
              >
                <FiPhone className="text-blue-400 animate-pulse" size={16} />
                <span>CONFIRM 30-DAY BILLING</span>
              </a>
            </div>

            {/* Contractor Trust Badges */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-xs text-slate-300 font-bold pt-1">
              <span className="flex items-center gap-1 text-[11px]">
                <FiCheckCircle className="text-emerald-400" /> 100% Risk-Free Guarantee
              </span>
              <span className="flex items-center gap-1 text-[11px]">
                <FiTruck className="text-blue-400" /> Free Same-Day Freight
              </span>
              <span className="flex items-center gap-1 text-[11px]">
                <FiFileText className="text-amber-400" /> 30-Day Net Billing
              </span>
            </div>

          </div>

          {/* Right Column: Flashy Patriotic 2-Blade Product Card */}
          <div className="lg:col-span-5 relative">
            
            <div className="relative rounded-2xl sm:rounded-3xl bg-gradient-to-br from-red-600/40 via-slate-800/60 to-blue-600/40 p-0.5 sm:p-1 shadow-[0_0_40px_rgba(37,99,235,0.3)] border border-slate-700/80">
              
              <div className="bg-[#07090e] rounded-[15px] sm:rounded-[22px] p-4 sm:p-6 space-y-4 sm:space-y-6 relative overflow-hidden">
                
                {/* Header Badge */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <span className="bg-red-600 text-white font-black text-[9px] sm:text-[10px] uppercase tracking-widest px-2.5 py-0.5 rounded shadow">
                    2-BLADE PATRIOT BOGO PACK
                  </span>
                  <span className="text-amber-400 font-black text-xs flex items-center gap-1">
                    <FiStar fill="currentColor" size={13} /> 4.9/5 RATED
                  </span>
                </div>

                {/* 2 Blade Graphics Display Grid */}
                <div className="grid grid-cols-2 gap-3 relative">
                  
                  {/* Blade 1 */}
                  <div className="bg-gradient-to-b from-slate-900 to-black p-2.5 rounded-xl border border-red-900/50 text-center relative">
                    <span className="absolute top-1.5 left-1.5 bg-red-600 text-white text-[8px] sm:text-[9px] font-black uppercase px-1.5 py-0.5 rounded shadow">
                      PAY $99.99
                    </span>
                    <div className="w-full h-36 sm:h-44 relative my-1 sm:my-2 flex items-center justify-center overflow-hidden">
                      <img
                        src="/images/intro-offer/patriot-blade-1.png"
                        alt="Patriot Speed Demon"
                        className="max-h-full object-contain filter drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
                      />
                    </div>
                    <div className="text-[11px] sm:text-xs font-black text-white uppercase">SPEED DEMON</div>
                    <div className="text-[9px] sm:text-[10px] text-red-400 font-bold">12mm Turbo Segments</div>
                  </div>

                  {/* Blade 2 */}
                  <div className="bg-gradient-to-b from-slate-900 to-black p-2.5 rounded-xl border border-emerald-900/60 text-center relative">
                    <span className="absolute top-1.5 left-1.5 bg-emerald-600 text-white text-[8px] sm:text-[9px] font-black uppercase px-1.5 py-0.5 rounded shadow animate-pulse">
                      100% FREE!
                    </span>
                    <div className="w-full h-36 sm:h-44 relative my-1 sm:my-2 flex items-center justify-center overflow-hidden">
                      <img
                        src="/images/intro-offer/patriot-blade-2.png"
                        alt="Patriot Endurance Master"
                        className="max-h-full object-contain filter drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
                      />
                    </div>
                    <div className="text-[11px] sm:text-xs font-black text-white uppercase">ENDURANCE MASTER</div>
                    <div className="text-[9px] sm:text-[10px] text-emerald-400 font-bold">14mm Drop Segments</div>
                  </div>

                </div>

                {/* Offer Summary Box */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">Package Contents:</span>
                    <strong className="text-white">1x Speed + 1x Life Blade</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">Arbor Standard:</span>
                    <strong className="text-white">1" with 20mm Bushing</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">Total Price:</span>
                    <strong className="text-amber-400 font-black text-sm">$99.99 (BOGO Deal)</strong>
                  </div>
                </div>

                <div className="text-center pt-1 border-t border-slate-800/80 text-[10px] sm:text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
                  🇺🇸 PROUDLY ENGINEERED IN THE USA 🇺🇸
                </div>

              </div>

            </div>

          </div>

        </div>

      </section>

      {/* ── COUNTDOWN TIMER & STOCK BAR ── */}
      <section className="bg-gradient-to-r from-red-950 via-slate-900 to-blue-950 border-y border-slate-800 py-5 px-3.5 sm:px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/50 flex items-center justify-center text-red-500 shrink-0">
              <FiClock size={22} className="animate-pulse" />
            </div>
            <div>
              <div className="text-[11px] font-black text-red-400 uppercase tracking-wider">SPECIAL BOGO OFFER EXPIRES IN:</div>
              <div className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight flex items-center gap-1.5 justify-center md:justify-start mt-0.5">
                <span className="bg-black/80 px-2.5 py-0.5 rounded border border-slate-700">{String(timeLeft.hours).padStart(2, '0')}h</span>
                <span>:</span>
                <span className="bg-black/80 px-2.5 py-0.5 rounded border border-slate-700">{String(timeLeft.minutes).padStart(2, '0')}m</span>
                <span>:</span>
                <span className="bg-black/80 px-2.5 py-0.5 rounded border border-slate-700">{String(timeLeft.seconds).padStart(2, '0')}s</span>
              </div>
            </div>
          </div>

          <div className="w-full md:w-80 space-y-1">
            <div className="flex justify-between text-[11px] font-black">
              <span className="text-slate-300">TODAY'S BOGO ALLOCATION:</span>
              <span className="text-amber-400">14 / 100 PACKS REMAINING</span>
            </div>
            <div className="w-full bg-black h-3 rounded-full overflow-hidden border border-slate-800 p-0.5">
              <div className="bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400 h-full rounded-full w-[86%] animate-pulse" />
            </div>
            <div className="text-[10px] text-slate-400 text-right font-bold">86% Claimed by contractors today</div>
          </div>

        </div>
      </section>

      {/* ── INTERACTIVE BLADE COMPARISON ── */}
      <section className="py-12 sm:py-16 px-3.5 sm:px-6 lg:px-10 max-w-6xl mx-auto space-y-8">
        
        <div className="text-center space-y-2 max-w-3xl mx-auto">
          <span className="bg-blue-950 text-blue-400 border border-blue-800 text-[10px] sm:text-xs font-black px-3.5 py-1 rounded-full uppercase tracking-widest">
            THE ULTIMATE DUAL-THREAT COMBO
          </span>
          <h2 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tight">
            WHY CONTRACTORS NEED BOTH BLADES
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            One blade cuts through hard aggregate like butter; the other delivers maximum footage on abrasive asphalt. You get both in this BOGO package!
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex justify-center">
          <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 inline-flex gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => setActiveBladeTab("speed")}
              className={`flex-1 sm:flex-initial px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-black text-[11px] sm:text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                activeBladeTab === "speed"
                  ? "bg-red-600 text-white shadow-lg shadow-red-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <FiZap /> SPEED DEMON
            </button>
            <button
              onClick={() => setActiveBladeTab("life")}
              className={`flex-1 sm:flex-initial px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-black text-[11px] sm:text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                activeBladeTab === "life"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <FiShield /> ENDURANCE MASTER
            </button>
          </div>
        </div>

        {/* Dynamic Blade Info Panel */}
        {activeBladeTab === "speed" ? (
          <div className="bg-gradient-to-b from-slate-900 to-black border border-red-900/60 rounded-2xl sm:rounded-3xl p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center shadow-2xl">
            <div className="lg:col-span-5 flex flex-col items-center">
              <div className="w-44 h-44 sm:w-56 sm:h-56 relative flex items-center justify-center">
                <img
                  src="/images/intro-offer/patriot-blade-1.png"
                  alt="Patriot Speed Demon"
                  className="max-h-full object-contain filter drop-shadow-[0_0_20px_rgba(220,38,38,0.7)]"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
                />
              </div>
              <span className="text-xs font-black text-red-400 uppercase mt-3">12mm Laser Welded Segments</span>
            </div>

            <div className="lg:col-span-7 space-y-3.5 text-xs">
              <div className="flex items-center gap-2 text-red-500 font-black uppercase">
                <FiZap /> SPEED SPECIALIST (MEDUSA MATRIX)
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white uppercase">PATRIOT SPEED DEMON</h3>
              <p className="text-slate-300 leading-relaxed font-medium">
                Engineered for maximum cutting speed on hard aggregate, cured concrete, and rebar. The 12mm turbo-vented segment design clears slurry rapidly, allowing your saw to run at full RPM without bogging down.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block font-bold">Cutting Speed Rating:</span>
                  <strong className="text-emerald-400 font-black text-xs sm:text-sm">9.9 / 10 (EXPERT FAST)</strong>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block font-bold">Primary Application:</span>
                  <strong className="text-white font-black text-xs sm:text-sm">Hard Concrete & Granite</strong>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-b from-slate-900 to-black border border-blue-900/60 rounded-2xl sm:rounded-3xl p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center shadow-2xl">
            <div className="lg:col-span-5 flex flex-col items-center">
              <div className="w-44 h-44 sm:w-56 sm:h-56 relative flex items-center justify-center">
                <img
                  src="/images/intro-offer/patriot-blade-2.png"
                  alt="Patriot Endurance Master"
                  className="max-h-full object-contain filter drop-shadow-[0_0_20px_rgba(37,99,235,0.7)]"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
                />
              </div>
              <span className="text-xs font-black text-blue-400 uppercase mt-3">14mm Drop Segments (Undercut Guard)</span>
            </div>

            <div className="lg:col-span-7 space-y-3.5 text-xs">
              <div className="flex items-center gap-2 text-blue-400 font-black uppercase">
                <FiShield /> LONGEVITY SPECIALIST (BARBARIAN BOND)
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white uppercase">PATRIOT ENDURANCE MASTER</h3>
              <p className="text-slate-300 leading-relaxed font-medium">
                Engineered for maximum footage and wear resistance. Features 14mm deep slanted drop-segments that protect the steel core from abrasive undercut wear when slicing through asphalt, green concrete, brick, and block.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block font-bold">Blade Lifespan Rating:</span>
                  <strong className="text-emerald-400 font-black text-xs sm:text-sm">2X EXTENDED FOOTAGE</strong>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block font-bold">Primary Application:</span>
                  <strong className="text-white font-black text-xs sm:text-sm">Asphalt & Green Concrete</strong>
                </div>
              </div>
            </div>
          </div>
        )}

      </section>

      {/* ── ORDER SECTION: CREDIT CARD vs 30-DAY BILLING ── */}
      <section id="order-section" className="py-12 sm:py-16 px-3.5 sm:px-6 lg:px-10 max-w-5xl mx-auto scroll-mt-16">
        
        <div className="bg-gradient-to-b from-slate-900 via-[#0a0c12] to-black border-2 border-slate-700/80 rounded-2xl sm:rounded-3xl p-4 sm:p-10 shadow-2xl space-y-6 sm:space-y-8 relative">
          
          <div className="text-center space-y-2">
            <span className="inline-block bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] sm:text-xs font-black px-3.5 py-1 rounded-full uppercase tracking-wider">
              OFFICIAL CONTRACTOR BOGO ORDER FORM
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tight">
              SELECT YOUR BLADE SIZE & CHECK OUT
            </h2>
            <p className="text-xs text-slate-400">Pay by Credit Card or Confirm 30-Day Business Account Billing.</p>
          </div>

          {/* Size & Quantity Selector */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 bg-slate-950 p-4 sm:p-6 rounded-2xl border border-slate-800">
            
            {/* Size Options (Big Mobile Tap Buttons) */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider block">
                1. SELECT BLADE DIAMETER:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { size: "14", label: '14" BOGO', price: "$99.99" },
                  { size: "16", label: '16" BOGO', price: "$129.99" },
                  { size: "20", label: '20" BOGO', price: "$169.99" },
                ].map(opt => (
                  <button
                    key={opt.size}
                    type="button"
                    onClick={() => setSelectedSize(opt.size as any)}
                    className={`min-h-[52px] p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center active:scale-95 ${
                      selectedSize === opt.size
                        ? "bg-red-600/20 border-red-500 text-white shadow-lg ring-2 ring-red-500/50"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span className="text-xs font-black uppercase">{opt.label}</span>
                    <span className="text-xs font-black text-amber-400 mt-0.5">{opt.price}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity Selector (Big 52px Tap Targets) */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider block">
                2. QUANTITY OF BOGO PACKAGES:
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-13 h-12 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white font-black text-xl rounded-xl flex items-center justify-center active:scale-95 shrink-0"
                >
                  -
                </button>
                <div className="flex-1 bg-slate-900 border border-slate-800 h-12 rounded-xl flex items-center justify-center text-xs sm:text-sm font-black text-white px-2">
                  {quantity} {quantity === 1 ? "Package (2 Blades)" : "Packages (" + (quantity * 2) + " Blades)"}
                </div>
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-13 h-12 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white font-black text-xl rounded-xl flex items-center justify-center active:scale-95 shrink-0"
                >
                  +
                </button>
              </div>
            </div>

          </div>

          {/* Payment Method Selector */}
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-300 uppercase tracking-wider block">
              3. SELECT PAYMENT METHOD:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              
              <button
                type="button"
                onClick={() => setActiveTab("credit_card")}
                className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all flex items-center gap-3.5 active:scale-95 ${
                  activeTab === "credit_card"
                    ? "bg-gradient-to-r from-red-950/80 to-slate-900 border-red-500 text-white shadow-xl ring-2 ring-red-500/50"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${activeTab === "credit_card" ? "bg-red-600 text-white" : "bg-slate-900 text-slate-400"}`}>
                  <FiCreditCard size={20} />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-black uppercase text-white">CREDIT CARD CHECKOUT</div>
                  <div className="text-[10px] sm:text-[11px] text-slate-400">Visa, Mastercard, Amex, Discover</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("30_day_billing")}
                className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all flex items-center gap-3.5 active:scale-95 ${
                  activeTab === "30_day_billing"
                    ? "bg-gradient-to-r from-blue-950/80 to-slate-900 border-blue-500 text-white shadow-xl ring-2 ring-blue-500/50"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${activeTab === "30_day_billing" ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400"}`}>
                  <FiFileText size={20} />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-black uppercase text-white">30-DAY NET BILLING</div>
                  <div className="text-[10px] sm:text-[11px] text-slate-400">Invoice Account / Call to Confirm</div>
                </div>
              </button>

            </div>
          </div>

          {/* Form Fields (text-base on inputs for iOS Safari anti-auto-zoom fix) */}
          <form onSubmit={handleSubmitOrder} className="space-y-6">
            
            <div className="space-y-4">
              <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                CUSTOMER & SHIPPING INFORMATION
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-400 mb-1">FULL NAME *</label>
                  <input
                    type="text"
                    name="customerName"
                    required
                    value={formData.customerName}
                    onChange={handleInputChange}
                    placeholder="e.g. John Miller"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-red-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-400 mb-1">COMPANY NAME (OPTIONAL)</label>
                  <input
                    type="text"
                    name="companyName"
                    value={formData.companyName}
                    onChange={handleInputChange}
                    placeholder="e.g. Apex Concrete LLC"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-red-500 font-medium"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-red-500 font-medium"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-red-500 font-medium"
                  />
                </div>
              </div>

              {/* Delivery Address */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5 text-xs">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-400 mb-1">SHIPPING STREET ADDRESS *</label>
                  <input
                    type="text"
                    name="address"
                    required
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="123 Industrial Parkway"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-red-500 font-medium"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-red-500 font-medium"
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
                      className="w-16 bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-base sm:text-xs text-white text-center font-bold focus:outline-none focus:border-red-500 uppercase"
                    />
                    <input
                      type="text"
                      name="zip"
                      required
                      value={formData.zip}
                      onChange={handleInputChange}
                      placeholder="75001"
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-base sm:text-xs text-white text-center font-medium focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* TAB SPECIFIC INPUTS */}
            {activeTab === "credit_card" ? (
              <div className="space-y-4 bg-slate-950/80 p-4 sm:p-5 rounded-2xl border border-slate-800">
                <h4 className="text-xs font-black text-red-400 uppercase tracking-wider flex items-center gap-2">
                  <FiCreditCard /> CREDIT CARD DETAILS
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-400 mb-1">NAME ON CARD</label>
                    <input
                      type="text"
                      name="cardName"
                      value={formData.cardName}
                      onChange={handleInputChange}
                      placeholder="Name as printed on card"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-red-500 font-medium"
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
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-red-500 font-mono"
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
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-base sm:text-xs text-white text-center focus:outline-none focus:border-red-500 font-mono"
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
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-base sm:text-xs text-white text-center focus:outline-none focus:border-red-500 font-mono"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 bg-blue-950/40 p-4 sm:p-5 rounded-2xl border border-blue-900/60">
                <h4 className="text-xs font-black text-blue-400 uppercase tracking-wider flex items-center gap-2">
                  <FiFileText /> 30-DAY NET BILLING CONFIRMATION
                </h4>
                <p className="text-xs text-slate-300 font-medium">
                  Approved commercial accounts pay <strong>$0 TODAY</strong>. An itemized invoice for <strong>${totalPrice}</strong> will be included with your shipment, due in 30 days.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  <div>
                    <label className="block font-bold text-slate-400 mb-1">PURCHASE ORDER # (OPTIONAL)</label>
                    <input
                      type="text"
                      name="poNumber"
                      value={formData.poNumber}
                      onChange={handleInputChange}
                      placeholder="e.g. PO-9842"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                    />
                  </div>

                  <div className="flex items-end">
                    <a
                      href="tel:18008482634"
                      className="w-full bg-blue-900/60 hover:bg-blue-800/80 text-blue-200 border border-blue-600/50 rounded-xl px-4 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors active:scale-95"
                    >
                      <FiPhone className="text-blue-400 animate-pulse" />
                      <span>CALL IN: (800) 848-2634</span>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Total & Submit Button */}
            <div className="bg-slate-950 p-4 sm:p-6 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <div className="text-xs font-bold text-slate-400 uppercase">TOTAL AMOUNT DUE:</div>
                <div className="text-3xl font-black text-white tracking-tight">${totalPrice}</div>
                <div className="text-xs text-emerald-400 font-bold">Includes 2x Blades ({selectedSize}" BOGO) + FREE Freight</div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full sm:w-auto px-8 py-4 rounded-xl font-black text-sm sm:text-base uppercase tracking-wider text-white shadow-2xl transition-all flex items-center justify-center gap-2.5 active:scale-95 ${
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

      {/* ── PATRIOTIC TRUST & FOOTER ── */}
      <section className="py-12 sm:py-16 px-3.5 sm:px-6 lg:px-10 bg-slate-950 border-t border-slate-800">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 text-center">
          
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-2.5">
            <div className="w-12 h-12 rounded-xl bg-red-600/20 text-red-500 flex items-center justify-center mx-auto text-2xl font-black">
              🇺🇸
            </div>
            <h4 className="text-base sm:text-lg font-black text-white uppercase">100% AMERICAN OWNED & SERVICED</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Based in Austin, Texas. Expert customer support and dedicated diamond tooling specialists standing by.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-2.5">
            <div className="w-12 h-12 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center mx-auto">
              <FiShield size={24} />
            </div>
            <h4 className="text-base sm:text-lg font-black text-white uppercase">RISK-FREE 30-DAY GUARANTEE</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              If these Patriot blades don't out-cut your existing tools, return them for a 100% full refund or credit.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-2.5">
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center mx-auto">
              <FiTruck size={24} />
            </div>
            <h4 className="text-base sm:text-lg font-black text-white uppercase">SAME-DAY EXPRESS FREIGHT</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Orders placed before 3:00 PM EST ship same day directly to your job site or equipment yard.
            </p>
          </div>

        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-8 px-4 border-t border-slate-800 text-center text-xs text-slate-500 space-y-2">
        <div className="flex items-center justify-center gap-2 font-black text-slate-300 flex-wrap">
          <span>TITAN DIAMOND TOOLS USA</span>
          <span>•</span>
          <a href="tel:18008482634" className="hover:text-white transition-colors">(800) 848-2634</a>
          <span>•</span>
          <span>INDUSTRIAL GRADE</span>
        </div>
        <p>© {new Date().getFullYear()} Titan Diamond. All rights reserved.</p>
      </footer>

      {/* ── HIGH-CONVERTING STICKY MOBILE BOTTOM BAR (<768px) ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#06080e]/95 backdrop-blur-2xl border-t border-slate-800/90 p-3 flex items-center justify-between gap-2.5 shadow-[0_-10px_25px_rgba(0,0,0,0.8)]">
        <div>
          <div className="text-[9px] font-black text-amber-400 uppercase tracking-widest">BUY 1 GET 1 FREE</div>
          <div className="text-xl font-black text-white leading-none">${pricePerPack.toFixed(2)}</div>
          <div className="text-[9px] font-bold text-emerald-400 mt-0.5">SAVE OVER ${savings} + FREE SHIP</div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="tel:18008482634"
            className="w-10 h-10 bg-slate-900 border border-slate-700 text-blue-400 rounded-xl flex items-center justify-center shrink-0 active:scale-95 shadow-md"
          >
            <FiPhone size={18} />
          </a>
          <a
            href="#order-section"
            className="bg-gradient-to-r from-red-600 via-red-500 to-blue-600 text-white font-black text-xs uppercase px-4 py-3 rounded-xl tracking-wider shadow-[0_0_20px_rgba(220,38,38,0.6)] flex items-center gap-1.5 active:scale-95 shrink-0"
          >
            <span>CLAIM OFFER</span>
            <FiArrowRight size={14} />
          </a>
        </div>
      </div>

      {/* ── ORDER SUCCESS CONFIRMATION MODAL ── */}
      {orderCompleted && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0e1017] border border-slate-700 rounded-3xl max-w-xl w-full p-5 sm:p-8 space-y-6 relative shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
            
            <button
              onClick={() => setOrderCompleted(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2"
            >
              <FiX size={20} />
            </button>

            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-2xl font-black">
                ✓
              </div>
              <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                ORDER CONFIRMED • {orderCompleted.orderId}
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-white uppercase">THANK YOU FOR YOUR ORDER!</h3>
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
                <strong className="text-white font-bold">{orderCompleted.bladeSize}</strong>
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
                <FiPrinter /> PRINT RECEIPT
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
