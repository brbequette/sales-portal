"use client"

import React, { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useZoho } from "@/components/ZohoProvider"
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
  FiMaximize2,
  FiCpu,
  FiLayers,
  FiTool,
  FiFeather,
  FiChevronLeft,
  FiChevronRight,
  FiCheck,
  FiArrowLeft
} from "react-icons/fi"

export default function AppleStylePatriotOfferPage() {
  const { zohoContext: user } = useZoho()
  const isAdmin = (user?.role || "").toLowerCase().includes("admin") || (user?.role || "").toLowerCase() === "administrator"

  // Hero Slider State (3 Slides)
  const [currentSlide, setCurrentSlide] = useState<number>(0)
  const totalSlides = 3

  // Offer State
  const [quantity, setQuantity] = useState<number>(1)
  const [activeTab, setActiveTab] = useState<"credit_card" | "30_day_billing">("credit_card")
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [orderCompleted, setOrderCompleted] = useState<any>(null)
  
  // Fullscreen Image Modal State
  const [fullscreenImage, setFullscreenImage] = useState<{ src: string; title: string; subtitle: string } | null>(null)

  // Parallax Scroll Y position tracking & scroll progress
  const [scrollY, setScrollY] = useState(0)
  const [scrollProgress, setScrollProgress] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight
      setScrollY(currentScrollY)
      setScrollProgress(totalHeight > 0 ? (currentScrollY / totalHeight) * 100 : 0)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Auto-play Hero Slider every 6 seconds
  useEffect(() => {
    const slideInterval = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % totalSlides)
    }, 6000)
    return () => clearInterval(slideInterval)
  }, [])

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
        alert(data.error || "Order submission failed. Please verify your details or call (480) 470-2577.")
      }
    } catch (err) {
      console.error("Order error:", err)
      alert("Order submission error. Please try again or call (480) 470-2577 directly.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div data-theme="light" className="intro-offer-page light-theme relative min-h-screen bg-[#05070c] text-slate-100 font-sans selection:bg-red-600 selection:text-white pb-20 md:pb-0 overflow-x-hidden">

      {/* ── TOP SCROLL PROGRESS BAR ── */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-slate-900 z-50">
        <div
          className="h-full bg-gradient-to-r from-red-600 via-amber-400 to-blue-600 transition-all duration-150 ease-out shadow-[0_0_10px_rgba(220,38,38,0.8)]"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* ── REAL AMERICAN FLAG VIDEO BACKGROUND (DYNAMIC PARALLAX) ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-35 sm:opacity-45 filter contrast-125 saturate-150 transition-transform duration-100 ease-out"
          style={{ transform: `translateY(${scrollY * 0.18}px) scale(1.08)` }}
        >
          <source src="https://assets.mixkit.co/videos/preview/mixkit-american-flag-waving-in-the-wind-41549-large.mp4" type="video/mp4" />
          <source src="https://cdn.coverr.co/videos/coverr-american-flag-waving-5282/1080p.mp4" type="video/mp4" />
        </video>

        {/* Ambient Dark Gradient Vignette for Apple-Style Sleek Depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#05070c]/90 via-[#05070c]/50 to-[#05070c]/95" />
      </div>

      <div className="relative z-10">

        {/* ── HEADER ── */}
        <header className="sticky top-1 z-40 bg-[#080b12]/90 backdrop-blur-2xl border-b border-white/10 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-2xl transition-all">
          
          {/* Logo & Admin Back Button */}
          <div className="flex items-center gap-3">
            <img
              src="/images/titan-spartan-logo.png"
              alt="Titan Diamond USA Spartan Logo"
              className="h-12 sm:h-16 w-auto object-contain filter drop-shadow-[0_0_18px_rgba(255,255,255,0.6)]"
            />
            <div className="hidden sm:block border-l border-white/15 pl-3">
              <span className="text-sm font-black uppercase text-white tracking-wider block">TITAN DIAMOND USA</span>
              <span className="text-xs text-red-500 font-extrabold">PATRIOT BOGO SPECIAL ($99.99)</span>
            </div>
            {isAdmin && (
              <Link
                href="/admin"
                className="ml-3 flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
              >
                <FiArrowLeft size={14} />
                <span>Admin Dashboard</span>
              </Link>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:block text-right">
              <span className="text-xs font-extrabold text-amber-400 block leading-none">BUY 1 GET 1 FREE</span>
              <span className="text-[10px] text-emerald-400 font-bold">Save $360 + Free Shipping</span>
            </div>

            <a
              href="tel:14804702577"
              className="hidden sm:flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/15 px-4 py-2 rounded-full text-xs font-black transition-all shadow-md"
            >
              <FiPhone size={13} className="text-blue-400 animate-pulse" />
              <span>(480) 470-2577</span>
            </a>

            <a
              href="#order-section"
              className="bg-gradient-to-r from-red-600 via-red-500 to-blue-600 hover:from-red-500 hover:to-blue-500 text-white px-5 sm:px-6 py-2.5 rounded-full text-xs sm:text-sm font-black uppercase tracking-wider shadow-[0_0_20px_rgba(220,38,38,0.6)] transition-all active:scale-95 flex items-center gap-1.5"
            >
              <span>CLAIM BOGO</span>
              <FiArrowRight size={16} />
            </a>
          </div>
        </header>

        {/* ── LIVE SOCIAL PROOF TICKER ── */}
        <div className="bg-blue-950/70 border-b border-blue-900/50 backdrop-blur-md py-1.5 px-4 text-xs text-slate-300">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden truncate">
              <span className="text-emerald-400 font-black flex items-center gap-1 shrink-0 text-[11px]">
                <FiActivity className="animate-pulse" /> LIVE JOBSITE ORDERS:
              </span>
              <span className="text-slate-200 text-[11px] truncate">
                <strong>{tickerEvents[currentTickerIndex].name}</strong> ({tickerEvents[currentTickerIndex].location}) — <span className="text-amber-300 font-extrabold">{tickerEvents[currentTickerIndex].action}</span>
              </span>
            </div>

            <div className="hidden lg:flex items-center gap-4 text-[11px] font-bold text-slate-400">
              <span className="text-emerald-400">✓ 100% IN STOCK</span>
              <span>•</span>
              <span className="text-blue-300">⚡ SAME DAY FREIGHT</span>
              <span>•</span>
              <span className="text-amber-300">🛡️ 30-DAY GUARANTEE</span>
            </div>
          </div>
        </div>

        {/* ── APPLE-STYLE 3-SLIDE HERO CAROUSEL ── */}
        <section className="relative pt-6 sm:pt-10 pb-12 sm:pb-20 px-3.5 sm:px-8 max-w-6xl mx-auto">
          
          <div className="flex items-center justify-between mb-4 max-w-4xl mx-auto">
            
            <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
              <button
                onClick={() => setCurrentSlide(0)}
                className={`text-[10px] font-black uppercase px-3 py-1 rounded-full transition-all flex items-center gap-1 ${
                  currentSlide === 0 ? "bg-red-600 text-white shadow-md" : "text-slate-400 hover:text-white"
                }`}
              >
                <span>SLIDE 1: BOGO DEAL</span>
              </button>

              <button
                onClick={() => setCurrentSlide(1)}
                className={`text-[10px] font-black uppercase px-3 py-1 rounded-full transition-all flex items-center gap-1 ${
                  currentSlide === 1 ? "bg-red-600 text-white shadow-md" : "text-slate-400 hover:text-white"
                }`}
              >
                <span>SLIDE 2: SPEED DEMON</span>
              </button>

              <button
                onClick={() => setCurrentSlide(2)}
                className={`text-[10px] font-black uppercase px-3 py-1 rounded-full transition-all flex items-center gap-1 ${
                  currentSlide === 2 ? "bg-emerald-600 text-white shadow-md" : "text-slate-400 hover:text-white"
                }`}
              >
                <span>SLIDE 3: ENDURANCE MASTER</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentSlide((currentSlide - 1 + totalSlides) % totalSlides)}
                className="w-9 h-9 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-white/15 text-white flex items-center justify-center transition-colors active:scale-95 shadow-md"
              >
                <FiChevronLeft size={18} />
              </button>
              <button
                onClick={() => setCurrentSlide((currentSlide + 1) % totalSlides)}
                className="w-9 h-9 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-white/15 text-white flex items-center justify-center transition-colors active:scale-95 shadow-md"
              >
                <FiChevronRight size={18} />
              </button>
            </div>

          </div>

          <div className="relative bg-gradient-to-b from-white/10 via-white/5 to-transparent border border-white/15 rounded-3xl p-5 sm:p-10 shadow-[0_20px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl overflow-hidden">
            
            <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-80 h-80 bg-red-600/25 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-80 h-80 bg-blue-600/25 rounded-full blur-[100px] pointer-events-none" />

            {currentSlide === 0 && (
              <div className="space-y-6 text-center animate-fade-in">
                
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 bg-gradient-to-r from-red-950/90 via-slate-900/90 to-blue-950/90 border border-red-500/40 rounded-full px-4 py-1 text-xs font-black uppercase tracking-widest text-white shadow-lg">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    <span>SLIDE 1 OF 3 • OFFICIAL BOGO INTRODUCTORY PACKAGE</span>
                  </div>

                  <h1 className="text-3xl sm:text-6xl font-black text-white tracking-tight uppercase leading-tight">
                    BUY 1 SPEED DEMON, GET 1 ENDURANCE MASTER <span className="text-red-500">FREE!</span>
                  </h1>

                  <p className="text-xs sm:text-base text-slate-300 font-light max-w-2xl mx-auto">
                    Both 14" Patriot Blades included in one package for <strong className="text-emerald-400 font-black text-sm sm:text-lg">$99.99</strong>. (Regular Value: ${regularValue.toFixed(2)} — Save ${savings} today!).
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-6 relative max-w-4xl mx-auto">
                  
                  <div
                    onClick={() => setFullscreenImage({
                      src: "/images/intro-offer/patriot-blade-1.png",
                      title: '14" PATRIOT SPEED DEMON BLADE',
                      subtitle: "12mm Laser Welded Turbo Segments — Speed Specialist for Hard Concrete & Rebar"
                    })}
                    className="relative bg-gradient-to-b from-slate-900/90 to-black/90 p-3.5 sm:p-6 rounded-2xl border border-red-500/40 text-center cursor-pointer group hover:border-red-500 transition-all duration-300 hover:shadow-[0_0_40px_rgba(220,38,38,0.5)] transform hover:-translate-y-1"
                  >
                    <span className="absolute top-2 left-2 bg-red-600 text-white text-[8px] sm:text-[10px] font-black uppercase px-2.5 py-0.5 rounded shadow z-10">
                      PAY FOR BLADE #1 ($99.99)
                    </span>

                    <div className="w-full h-36 sm:h-56 relative my-2 flex items-center justify-center">
                      <img
                        src="/images/intro-offer/patriot-blade-1.png"
                        alt="Patriot Speed Demon"
                        className="max-h-full object-contain filter drop-shadow-[0_0_25px_rgba(220,38,38,0.6)] group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
                      />
                    </div>

                    <h3 className="text-sm sm:text-lg font-black text-white uppercase leading-tight">PATRIOT SPEED DEMON</h3>
                    <p className="text-[10px] sm:text-xs text-red-400 font-bold mt-0.5">12mm Turbo Segments</p>
                  </div>

                  <div
                    onClick={() => setFullscreenImage({
                      src: "/images/intro-offer/patriot-blade-2.png",
                      title: '14" PATRIOT ENDURANCE MASTER BLADE',
                      subtitle: "14mm Slanted Drop Segments — Longevity Specialist for Asphalt & Green Concrete"
                    })}
                    className="relative bg-gradient-to-b from-slate-900/90 to-black/90 p-3.5 sm:p-6 rounded-2xl border border-emerald-500/50 text-center cursor-pointer group hover:border-emerald-400 transition-all duration-300 hover:shadow-[0_0_40px_rgba(16,185,129,0.5)] transform hover:-translate-y-1"
                  >
                    <span className="absolute top-2 left-2 bg-emerald-600 text-white text-[8px] sm:text-[10px] font-black uppercase px-2.5 py-0.5 rounded shadow z-10 animate-pulse">
                      BLADE #2: 100% FREE!
                    </span>

                    <div className="w-full h-36 sm:h-56 relative my-2 flex items-center justify-center">
                      <img
                        src="/images/intro-offer/patriot-blade-2.png"
                        alt="Patriot Endurance Master"
                        className="max-h-full object-contain filter drop-shadow-[0_0_25px_rgba(16,185,129,0.6)] group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
                      />
                    </div>

                    <h3 className="text-sm sm:text-lg font-black text-white uppercase leading-tight">PATRIOT ENDURANCE MASTER</h3>
                    <p className="text-[10px] sm:text-xs text-emerald-400 font-bold mt-0.5">14mm Drop Segments</p>
                  </div>

                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  <a
                    href="#order-section"
                    className="w-full sm:w-auto bg-gradient-to-r from-red-600 via-red-500 to-blue-600 hover:from-red-500 hover:to-blue-500 text-white font-black text-sm px-8 py-4 rounded-xl shadow-[0_0_30px_rgba(220,38,38,0.6)] transition-all uppercase tracking-wide active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span>CLAIM BOGO OFFER NOW ($99.99)</span>
                    <FiArrowRight size={18} />
                  </a>

                  <button
                    onClick={() => setCurrentSlide(1)}
                    className="w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white border border-white/15 font-bold text-xs px-6 py-4 rounded-xl transition-all"
                  >
                    VIEW PRODUCT ATTRIBUTES →
                  </button>
                </div>

              </div>
            )}

            {currentSlide === 1 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center text-left animate-fade-in">
                
                <div className="lg:col-span-6 space-y-4">
                  <span className="bg-red-950 text-red-400 border border-red-800 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest inline-block">
                    SLIDE 2 OF 3 • BLADE #1 ATTRIBUTES
                  </span>
                  
                  <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight leading-none">
                    PATRIOT SPEED DEMON
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 font-light leading-relaxed">
                    Built for extreme cutting velocity through hard aggregate, cured concrete, and heavy steel rebar. The 12mm turbo-vented segment design clears slurry rapidly, allowing your saw to cut 40% faster at maximum RPM.
                  </p>

                  <div className="space-y-2 pt-1 text-xs">
                    <div className="bg-slate-900/90 border border-white/10 p-3 rounded-xl flex items-center justify-between">
                      <span className="text-slate-400 font-bold">Segment Geometry:</span>
                      <strong className="text-red-400 font-black">12mm Turbo Vented Segments</strong>
                    </div>
                    <div className="bg-slate-900/90 border border-white/10 p-3 rounded-xl flex items-center justify-between">
                      <span className="text-slate-400 font-bold">Cutting Velocity Score:</span>
                      <strong className="text-red-400 font-black">9.9 / 10 (EXPERT FAST)</strong>
                    </div>
                    <div className="bg-slate-900/90 border border-white/10 p-3 rounded-xl flex items-center justify-between">
                      <span className="text-slate-400 font-bold">Laser Weld Resistance:</span>
                      <strong className="text-white font-black">14,000 PSI Shear Strength</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <a
                      href="#order-section"
                      className="bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase px-6 py-3.5 rounded-xl shadow-lg transition-all"
                    >
                      CLAIM BOGO ($99.99)
                    </a>
                    <button
                      onClick={() => setCurrentSlide(2)}
                      className="text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1"
                    >
                      <span>NEXT: ENDURANCE MASTER</span>
                      <FiChevronRight />
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-6 flex justify-center">
                  <div
                    onClick={() => setFullscreenImage({
                      src: "/images/intro-offer/patriot-blade-1.png",
                      title: '14" PATRIOT SPEED DEMON BLADE',
                      subtitle: "12mm Laser Welded Turbo Segments"
                    })}
                    className="w-64 h-64 sm:w-80 sm:h-80 relative flex items-center justify-center cursor-pointer group"
                  >
                    <div className="absolute inset-0 bg-red-600/30 rounded-full blur-[80px] pointer-events-none" />
                    <img
                      src="/images/intro-offer/patriot-blade-1.png"
                      alt="Patriot Speed Demon"
                      className="max-h-full object-contain filter drop-shadow-[0_0_35px_rgba(220,38,38,0.7)] group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                </div>

              </div>
            )}

            {currentSlide === 2 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center text-left animate-fade-in">
                
                <div className="lg:col-span-6 flex justify-center order-2 lg:order-1">
                  <div
                    onClick={() => setFullscreenImage({
                      src: "/images/intro-offer/patriot-blade-2.png",
                      title: '14" PATRIOT ENDURANCE MASTER BLADE',
                      subtitle: "14mm Slanted Drop Segments"
                    })}
                    className="w-64 h-64 sm:w-80 sm:h-80 relative flex items-center justify-center cursor-pointer group"
                  >
                    <div className="absolute inset-0 bg-emerald-600/30 rounded-full blur-[80px] pointer-events-none" />
                    <img
                      src="/images/intro-offer/patriot-blade-2.png"
                      alt="Patriot Endurance Master"
                      className="max-h-full object-contain filter drop-shadow-[0_0_35px_rgba(16,185,129,0.7)] group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                </div>

                <div className="lg:col-span-6 order-1 lg:order-2 space-y-4">
                  <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest inline-block">
                    SLIDE 3 OF 3 • BLADE #2 ATTRIBUTES (100% FREE)
                  </span>
                  
                  <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight leading-none">
                    PATRIOT ENDURANCE MASTER
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 font-light leading-relaxed">
                    Engineered for maximum footage and wear resistance. Features 14mm deep slanted drop-segments that shield the steel core from abrasive undercut wear when slicing through asphalt, green concrete, brick, and block.
                  </p>

                  <div className="space-y-2 pt-1 text-xs">
                    <div className="bg-slate-900/90 border border-white/10 p-3 rounded-xl flex items-center justify-between">
                      <span className="text-slate-400 font-bold">Segment Geometry:</span>
                      <strong className="text-emerald-400 font-black">14mm Slanted Drop Segments</strong>
                    </div>
                    <div className="bg-slate-900/90 border border-white/10 p-3 rounded-xl flex items-center justify-between">
                      <span className="text-slate-400 font-bold">Lifespan Extension:</span>
                      <strong className="text-emerald-400 font-black">2X EXTENDED FOOTAGE (200%+)</strong>
                    </div>
                    <div className="bg-slate-900/90 border border-white/10 p-3 rounded-xl flex items-center justify-between">
                      <span className="text-slate-400 font-bold">Undercut Protection:</span>
                      <strong className="text-white font-black">Deep Core Shield Technology</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <a
                      href="#order-section"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase px-6 py-3.5 rounded-xl shadow-lg transition-all"
                    >
                      CLAIM BOGO ($99.99)
                    </a>
                    <button
                      onClick={() => setCurrentSlide(0)}
                      className="text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1"
                    >
                      <span>BACK TO BOGO DEAL</span>
                      <FiChevronRight />
                    </button>
                  </div>
                </div>

              </div>
            )}

          </div>

        </section>

        {/* ── PARALLAX SCROLL FEATURE BLOCK 1 ── */}
        <section className="py-20 sm:py-32 px-4 sm:px-8 border-t border-white/10 bg-gradient-to-b from-[#05070c] via-slate-950 to-[#05070c]">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
              <span className="text-xs font-black text-red-500 uppercase tracking-widest bg-red-950/80 border border-red-800/60 px-3.5 py-1 rounded-full inline-block">
                VELOCIMETER TECHNOLOGY
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight leading-tight">
                SLICES 40% FASTER. <br />
                <span className="text-red-500">ZERO BOGGING.</span>
              </h2>
              <p className="text-base text-slate-300 leading-relaxed font-light">
                The <strong className="text-white font-bold">Patriot Speed Demon</strong> is engineered with 12mm turbo-vented segments that channel water and slurry instantly out of the cut zone. Your saw stays at full RPM, slicing through hard concrete, river rock, and heavy rebar without resistance.
              </p>

              <div className="grid grid-cols-2 gap-4 pt-2 text-left">
                <div className="bg-slate-900/80 border border-white/10 p-4 rounded-xl backdrop-blur-md transform hover:scale-105 transition-transform">
                  <div className="text-3xl font-black text-red-500 font-mono">9.9 / 10</div>
                  <div className="text-xs font-bold text-slate-300 uppercase mt-1">Cutting Speed Rating</div>
                </div>
                <div className="bg-slate-900/80 border border-white/10 p-4 rounded-xl backdrop-blur-md transform hover:scale-105 transition-transform">
                  <div className="text-3xl font-black text-white font-mono">14,000 PSI</div>
                  <div className="text-xs font-bold text-slate-300 uppercase mt-1">Laser Weld Strength</div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 flex justify-center">
              <div
                className="relative w-72 h-72 sm:w-96 sm:h-96 flex items-center justify-center group"
                style={{ transform: `translateY(${Math.sin(scrollY * 0.002) * 20}px)` }}
              >
                <div className="absolute inset-0 bg-red-600/20 rounded-full blur-[80px] pointer-events-none group-hover:bg-red-600/30 transition-all" />
                <img
                  src="/images/intro-offer/patriot-blade-1.png"
                  alt="Patriot Speed Demon"
                  className="max-h-full object-contain filter drop-shadow-[0_0_40px_rgba(220,38,38,0.7)] group-hover:scale-105 transition-transform duration-500 cursor-pointer"
                  onClick={() => setFullscreenImage({
                    src: "/images/intro-offer/patriot-blade-1.png",
                    title: '14" PATRIOT SPEED DEMON BLADE',
                    subtitle: "12mm Laser Welded Turbo Segments"
                  })}
                />
              </div>
            </div>

          </div>
        </section>

        {/* ── PARALLAX SCROLL FEATURE BLOCK 2 ── */}
        <section className="py-20 sm:py-32 px-4 sm:px-8 border-t border-white/10 bg-gradient-to-b from-[#05070c] via-blue-950/40 to-[#05070c]">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            <div className="lg:col-span-6 order-2 lg:order-1 flex justify-center">
              <div
                className="relative w-72 h-72 sm:w-96 sm:h-96 flex items-center justify-center group"
                style={{ transform: `translateY(${Math.cos(scrollY * 0.002) * 20}px)` }}
              >
                <div className="absolute inset-0 bg-blue-600/20 rounded-full blur-[80px] pointer-events-none group-hover:bg-blue-600/30 transition-all" />
                <img
                  src="/images/intro-offer/patriot-blade-2.png"
                  alt="Patriot Endurance Master"
                  className="max-h-full object-contain filter drop-shadow-[0_0_40px_rgba(37,99,235,0.7)] group-hover:scale-105 transition-transform duration-500 cursor-pointer"
                  onClick={() => setFullscreenImage({
                    src: "/images/intro-offer/patriot-blade-2.png",
                    title: '14" PATRIOT ENDURANCE MASTER BLADE',
                    subtitle: "14mm Slanted Drop Segments"
                  })}
                />
              </div>
            </div>

            <div className="lg:col-span-6 order-1 lg:order-2 space-y-6 text-center lg:text-left">
              <span className="text-xs font-black text-blue-400 uppercase tracking-widest bg-blue-950/80 border border-blue-800/60 px-3.5 py-1 rounded-full inline-block">
                UNDERCUT GUARD SYSTEM
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight leading-tight">
                2X EXTENDED FOOTAGE. <br />
                <span className="text-blue-400">ZERO CORE WEAR.</span>
              </h2>
              <p className="text-base text-slate-300 leading-relaxed font-light">
                Abrasive asphalt and green concrete wear out ordinary blades fast by undercutting the steel core. The <strong className="text-white font-bold">Patriot Endurance Master</strong> features 14mm deep slanted drop-segments that shield the core steel, extending blade lifespan by over 200%.
              </p>

              <div className="grid grid-cols-2 gap-4 pt-2 text-left">
                <div className="bg-slate-900/80 border border-white/10 p-4 rounded-xl backdrop-blur-md transform hover:scale-105 transition-transform">
                  <div className="text-3xl font-black text-emerald-400 font-mono">200%+</div>
                  <div className="text-xs font-bold text-slate-300 uppercase mt-1">Extended Footage</div>
                </div>
                <div className="bg-slate-900/80 border border-white/10 p-4 rounded-xl backdrop-blur-md transform hover:scale-105 transition-transform">
                  <div className="text-3xl font-black text-white font-mono">14mm</div>
                  <div className="text-xs font-bold text-slate-300 uppercase mt-1">Deep Drop Segments</div>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* ── 4 TECHNICAL SPECIFICATIONS GRID ── */}
        <section className="py-20 sm:py-32 px-4 sm:px-8 border-t border-white/10 max-w-6xl mx-auto space-y-12">
          
          <div className="text-center space-y-3 max-w-3xl mx-auto">
            <span className="text-xs font-black text-amber-400 uppercase tracking-widest bg-amber-950/80 border border-amber-800/60 px-4 py-1.5 rounded-full inline-block">
              ENGINEERING MATRIX
            </span>
            <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight">
              4 PRO SPECIFICATIONS
            </h2>
            <p className="text-sm text-slate-400 font-light">
              Built to rigid industrial tolerances for high-horsepower gas saws and equipment yards.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="bg-gradient-to-b from-slate-900/90 to-black/90 border border-white/15 p-6 rounded-2xl space-y-3 shadow-xl backdrop-blur-md hover:border-red-500/50 transition-all hover:shadow-[0_0_30px_rgba(220,38,38,0.3)]">
              <div className="w-10 h-10 rounded-xl bg-red-600/20 text-red-500 flex items-center justify-center font-black text-xl">
                <FiLayers />
              </div>
              <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">SPEC #1</span>
              <h3 className="text-lg font-black text-white uppercase">LASER WELD BOND & SEGMENT HEIGHT</h3>
              <p className="text-xs text-slate-300 leading-relaxed font-medium">
                100% direct laser welding fused to high-tensile core steel. Tested up to 14,000 PSI shear resistance to eliminate segment loss under extreme cut pressures.
              </p>
            </div>

            <div className="bg-gradient-to-b from-slate-900/90 to-black/90 border border-white/15 p-6 rounded-2xl space-y-3 shadow-xl backdrop-blur-md hover:border-amber-400/50 transition-all hover:shadow-[0_0_30px_rgba(251,191,36,0.3)]">
              <div className="w-10 h-10 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center font-black text-xl">
                <FiCpu />
              </div>
              <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">SPEC #2</span>
              <h3 className="text-lg font-black text-white uppercase">GE SYNTHETIC DIAMOND CONCENTRATION</h3>
              <p className="text-xs text-slate-300 leading-relaxed font-medium">
                High-grade GE/De Beers synthetic diamond crystals embedded in proprietary cobalt-bronze self-sharpening matrix at 45% concentration for fast, continuous cutting.
              </p>
            </div>

            <div className="bg-gradient-to-b from-slate-900/90 to-black/90 border border-white/15 p-6 rounded-2xl space-y-3 shadow-xl backdrop-blur-md hover:border-blue-400/50 transition-all hover:shadow-[0_0_30px_rgba(96,165,250,0.3)]">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-black text-xl">
                <FiFeather />
              </div>
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">SPEC #3</span>
              <h3 className="text-lg font-black text-white uppercase">PRE-TENSIONED HIGH-ALLOY STEEL CORE</h3>
              <p className="text-xs text-slate-300 leading-relaxed font-medium">
                Heat-treated alloy steel core precision pre-tensioned to eliminate blade wobble, vibration, and thermal warping at high cut speeds.
              </p>
            </div>

            <div className="bg-gradient-to-b from-slate-900/90 to-black/90 border border-white/15 p-6 rounded-2xl space-y-3 shadow-xl backdrop-blur-md hover:border-emerald-400/50 transition-all hover:shadow-[0_0_30px_rgba(52,211,153,0.3)]">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-black text-xl">
                <FiTool />
              </div>
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">SPEC #4</span>
              <h3 className="text-lg font-black text-white uppercase">UNIVERSAL 1" & 20MM ARBOR FIT</h3>
              <p className="text-xs text-slate-300 leading-relaxed font-medium">
                Standard 1" Arbor with heavy-duty 20mm adapter bushing included. Fully compatible with Stihl, Husqvarna, Makita, and all gas cut-off saws up to 20HP.
              </p>
            </div>

          </div>

        </section>

        {/* ── SLEEK CHECKOUT SECTION ── */}
        <section id="order-section" className="py-20 sm:py-32 px-4 sm:px-8 max-w-5xl mx-auto scroll-mt-20">
          
          <div className="bg-gradient-to-b from-slate-900/95 via-[#080b12] to-black border-2 border-white/20 rounded-3xl p-6 sm:p-12 shadow-[0_20px_80px_rgba(0,0,0,0.9)] space-y-8 backdrop-blur-2xl">
            
            <div className="text-center space-y-3">
              <span className="bg-red-600 text-white text-xs font-black px-4 py-1 rounded-full uppercase tracking-widest shadow-lg">
                OFFICIAL CONTRACTOR BOGO ORDER
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight">
                CLAIM YOUR 14" BOGO PACKAGE
              </h2>
              <p className="text-xs text-slate-400">Pay by Credit Card or Confirm 30-Day Commercial Account Billing.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-black/60 p-6 rounded-2xl border border-white/10">
              
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider block">
                  1. SELECTED PACKAGE:
                </label>
                <div className="bg-gradient-to-r from-blue-950 to-slate-900 text-white p-4 rounded-xl border border-blue-500/40 shadow-lg flex items-center justify-between">
                  <div>
                    <div className="text-sm font-black uppercase text-white">14" PATRIOT 2-BLADE BOGO PACK</div>
                    <div className="text-xs font-bold text-amber-400">1x 14" Speed + 1x 14" Life Blade</div>
                  </div>
                  <div className="text-right">
                    <span className="bg-red-600 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded shadow">BOGO DEAL</span>
                    <div className="text-2xl font-black text-white">$99.99</div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider block">
                  2. QUANTITY OF BOGO PACKAGES:
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-14 h-14 bg-slate-900 border border-white/15 hover:bg-slate-800 text-white font-black text-2xl rounded-xl flex items-center justify-center active:scale-95 shrink-0 shadow-md"
                  >
                    -
                  </button>
                  <div className="flex-1 bg-slate-900 border border-white/15 h-14 rounded-xl flex items-center justify-center text-sm font-black text-white px-2 shadow-md">
                    {quantity} {quantity === 1 ? "Package (2 Blades)" : "Packages (" + (quantity * 2) + " Blades)"}
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-14 h-14 bg-slate-900 border border-white/15 hover:bg-slate-800 text-white font-black text-2xl rounded-xl flex items-center justify-center active:scale-95 shrink-0 shadow-md"
                  >
                    +
                  </button>
                </div>
              </div>

            </div>

            <div className="space-y-3">
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider block">
                3. SELECT PAYMENT METHOD:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                <button
                  type="button"
                  onClick={() => setActiveTab("credit_card")}
                  className={`p-4 rounded-2xl border text-left transition-all flex items-center gap-4 active:scale-95 ${
                    activeTab === "credit_card"
                      ? "bg-gradient-to-r from-red-950/90 to-slate-900 border-red-500 text-white shadow-xl ring-2 ring-red-500/50"
                      : "bg-black/40 border-white/10 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${activeTab === "credit_card" ? "bg-red-600 text-white" : "bg-slate-800 text-slate-400"}`}>
                    <FiCreditCard size={22} />
                  </div>
                  <div>
                    <div className="text-sm font-black uppercase text-white">CREDIT CARD CHECKOUT</div>
                    <div className="text-xs text-slate-400">Visa, Mastercard, Amex, Discover</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("30_day_billing")}
                  className={`p-4 rounded-2xl border text-left transition-all flex items-center gap-4 active:scale-95 ${
                    activeTab === "30_day_billing"
                      ? "bg-gradient-to-r from-blue-950/90 to-slate-900 border-blue-500 text-white shadow-xl ring-2 ring-blue-500/50"
                      : "bg-black/40 border-white/10 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${activeTab === "30_day_billing" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"}`}>
                    <FiFileText size={22} />
                  </div>
                  <div>
                    <div className="text-sm font-black uppercase text-white">30-DAY NET BILLING</div>
                    <div className="text-xs text-slate-400">Invoice Account / Call to Confirm</div>
                  </div>
                </button>

              </div>
            </div>

            {/* Form Fields */}
            <form onSubmit={handleSubmitOrder} className="space-y-6">
              
              <div className="space-y-4">
                <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider border-b border-white/10 pb-2">
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
                      className="w-full bg-slate-900 border border-white/15 rounded-xl px-4 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-red-500 font-medium"
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
                      className="w-full bg-slate-900 border border-white/15 rounded-xl px-4 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-red-500 font-medium"
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
                      className="w-full bg-slate-900 border border-white/15 rounded-xl px-4 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-red-500 font-medium"
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
                      className="w-full bg-slate-900 border border-white/15 rounded-xl px-4 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-red-500 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs min-w-0 overflow-hidden">
                  <div className="sm:col-span-5 min-w-0">
                    <label className="block font-bold text-slate-400 mb-1">SHIPPING STREET ADDRESS *</label>
                    <input
                      type="text"
                      name="address"
                      required
                      value={formData.address}
                      onChange={handleInputChange}
                      placeholder="123 Industrial Parkway"
                      className="w-full bg-slate-900 border border-white/15 rounded-xl px-3.5 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-red-500 font-medium"
                    />
                  </div>

                  <div className="sm:col-span-4 min-w-0">
                    <label className="block font-bold text-slate-400 mb-1">CITY *</label>
                    <input
                      type="text"
                      name="city"
                      required
                      value={formData.city}
                      onChange={handleInputChange}
                      placeholder="Dallas"
                      className="w-full bg-slate-900 border border-white/15 rounded-xl px-3.5 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-red-500 font-medium"
                    />
                  </div>

                  <div className="sm:col-span-3 min-w-0">
                    <label className="block font-bold text-slate-400 mb-1">STATE / ZIP *</label>
                    <div className="flex gap-1.5 min-w-0 w-full">
                      <input
                        type="text"
                        name="state"
                        required
                        value={formData.state}
                        onChange={handleInputChange}
                        placeholder="TX"
                        className="w-12 sm:w-14 shrink-0 bg-slate-900 border border-white/15 rounded-xl px-2 py-3 text-base sm:text-xs text-white text-center font-bold focus:outline-none focus:border-red-500 uppercase"
                      />
                      <input
                        type="text"
                        name="zip"
                        required
                        value={formData.zip}
                        onChange={handleInputChange}
                        placeholder="75001"
                        className="min-w-0 flex-1 bg-slate-900 border border-white/15 rounded-xl px-2 py-3 text-base sm:text-xs text-white text-center font-medium focus:outline-none focus:border-red-500"
                      />
                    </div>
                  </div>
                </div>

              </div>

              {activeTab === "credit_card" ? (
                <div className="space-y-4 bg-slate-900/80 p-5 rounded-2xl border border-red-500/40">
                  <h4 className="text-xs font-black text-red-400 uppercase tracking-wider flex items-center gap-2">
                    <FiCreditCard /> CREDIT CARD DETAILS
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="sm:col-span-2">
                      <label className="block font-bold text-slate-400 mb-1">NAME ON CARD</label>
                      <input
                        type="text"
                        name="cardName"
                        value={formData.cardName}
                        onChange={handleInputChange}
                        placeholder="Name as printed on card"
                        className="w-full bg-black/60 border border-white/15 rounded-xl px-4 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-red-500 font-medium"
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
                        className="w-full bg-black/60 border border-white/15 rounded-xl px-4 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-red-500 font-mono"
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
                        className="w-full bg-black/60 border border-white/15 rounded-xl px-4 py-3 text-base sm:text-xs text-white text-center focus:outline-none focus:border-red-500 font-mono"
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
                        className="w-full bg-black/60 border border-white/15 rounded-xl px-4 py-3 text-base sm:text-xs text-white text-center focus:outline-none focus:border-red-500 font-mono"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 bg-blue-950/40 p-5 rounded-2xl border border-blue-500/40">
                  <h4 className="text-xs font-black text-blue-400 uppercase tracking-wider flex items-center gap-2">
                    <FiFileText /> 30-DAY NET BILLING CONFIRMATION
                  </h4>
                  <p className="text-xs text-slate-300 font-medium">
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
                        className="w-full bg-black/60 border border-white/15 rounded-xl px-4 py-3 text-base sm:text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                      />
                    </div>

                    <div className="flex items-end">
                      <a
                        href="tel:14804702577"
                        className="w-full bg-blue-900 hover:bg-blue-800 text-white rounded-xl px-4 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors active:scale-95 shadow-md"
                      >
                        <FiPhone className="text-amber-300 animate-pulse" />
                        <span>CALL IN: (480) 470-2577</span>
                      </a>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-black/80 text-white p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 border border-white/15 shadow-2xl">
                <div className="text-center sm:text-left">
                  <div className="text-xs font-bold text-slate-400 uppercase">TOTAL AMOUNT DUE:</div>
                  <div className="text-4xl font-black text-white tracking-tight">${totalPrice}</div>
                  <div className="text-xs text-emerald-400 font-bold">Includes 2x 14" Blades (BOGO Pack) + FREE Freight</div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full sm:w-auto px-9 py-4 rounded-xl font-black text-base uppercase tracking-wider text-white shadow-2xl transition-all flex items-center justify-center gap-2.5 active:scale-95 ${
                    activeTab === "credit_card"
                      ? "bg-gradient-to-r from-red-600 via-red-500 to-blue-600 hover:from-red-500 hover:to-blue-500 shadow-red-600/50"
                      : "bg-gradient-to-r from-blue-600 via-blue-500 to-blue-700 hover:from-blue-500 hover:to-blue-600 shadow-blue-600/50"
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

        {/* ── FOOTER ── */}
        <footer className="py-12 px-4 border-t border-white/10 bg-[#05070c] text-center text-xs text-slate-500 space-y-3">
          <div className="flex items-center justify-center gap-3 font-black text-slate-300 flex-wrap">
            <span>TITAN DIAMOND TOOLS USA</span>
            <span>•</span>
            <a href="tel:14804702577" className="hover:text-white transition-colors">(480) 470-2577</a>
            <span>•</span>
            <span>INDUSTRIAL CONTRACTOR GRADE</span>
          </div>
          <p>© {new Date().getFullYear()} Titan Diamond. All rights reserved.</p>
        </footer>

        {/* ── STICKY MOBILE BOTTOM BAR ── */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#080b12]/95 backdrop-blur-2xl border-t border-white/15 p-3 flex items-center justify-between gap-3 shadow-[0_-10px_30px_rgba(0,0,0,0.9)]">
          <div>
            <div className="text-[9px] font-black text-amber-400 uppercase tracking-widest">BUY 1 GET 1 FREE</div>
            <div className="text-xl font-black text-white leading-none">${pricePerPack.toFixed(2)}</div>
            <div className="text-[9px] font-bold text-emerald-400 mt-0.5">SAVE ${savings} + FREE SHIP</div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="tel:14804702577"
              className="w-10 h-10 bg-slate-900 border border-white/20 text-blue-400 rounded-xl flex items-center justify-center shrink-0 active:scale-95 shadow-md"
            >
              <FiPhone size={18} />
            </a>
            <a
              href="#order-section"
              className="bg-gradient-to-r from-red-600 via-red-500 to-blue-600 text-white font-black text-xs uppercase px-4 py-3 rounded-xl tracking-wider shadow-lg flex items-center gap-1.5 active:scale-95 shrink-0"
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
              className="relative bg-gradient-to-b from-slate-900 to-black border border-white/20 rounded-3xl max-w-3xl w-full p-6 text-center space-y-4 shadow-2xl cursor-default"
            >
              <button
                onClick={() => setFullscreenImage(null)}
                className="absolute top-4 right-4 bg-slate-800 text-slate-300 hover:text-white p-2 rounded-full border border-white/10 shadow-md transition-colors"
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

              <div className="w-full h-80 sm:h-96 relative flex items-center justify-center py-4 bg-black/50 rounded-2xl border border-white/10">
                <img
                  src={fullscreenImage.src}
                  alt={fullscreenImage.title}
                  className="max-h-full max-w-full object-contain filter drop-shadow-[0_0_40px_rgba(220,38,38,0.6)] animate-scale-in"
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
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-950 border border-white/20 rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 relative shadow-2xl text-white max-h-[90vh] overflow-y-auto">
              
              <button
                onClick={() => setOrderCompleted(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white p-2"
              >
                <FiX size={20} />
              </button>

              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-xl font-black">
                  ✓
                </div>
                <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                  ORDER CONFIRMED • {orderCompleted.orderId}
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-white uppercase">THANK YOU FOR YOUR ORDER!</h3>
                <p className="text-xs text-slate-300 font-medium">
                  {orderCompleted.message}
                </p>
              </div>

              <div className="bg-slate-900 p-4 rounded-2xl border border-white/10 space-y-2 text-xs">
                <div className="flex justify-between border-b border-white/10 pb-2">
                  <span className="text-slate-400">Order Reference:</span>
                  <strong className="text-white font-mono">{orderCompleted.orderId}</strong>
                </div>
                <div className="flex justify-between border-b border-white/10 pb-2">
                  <span className="text-slate-400">Item Package:</span>
                  <strong className="text-white font-bold">{orderCompleted.bladeSize}</strong>
                </div>
                <div className="flex justify-between border-b border-white/10 pb-2">
                  <span className="text-slate-400">Quantity:</span>
                  <strong className="text-white">{orderCompleted.quantity} Pack(s)</strong>
                </div>
                <div className="flex justify-between border-b border-white/10 pb-2">
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
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/10 font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2"
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

    </div>
  )
}
