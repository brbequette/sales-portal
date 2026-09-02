"use client"

import { useState, useEffect, Suspense, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn, useSession } from "next-auth/react"
import Link from "next/link"
import Image from "next/image"
import { FiLock, FiMail, FiArrowRight, FiAlertCircle, FiShield, FiUsers, FiZap } from "react-icons/fi"
import { SparkCanvas } from "@/components/SparkCanvas"
import { isAdminRole } from "@/lib/roles"

type Portal = "customer" | "employee" | "admin"

function safeCallbackPath(value: string | null, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback
  return value
}

function ssoCompletionPath(callbackPath: string) {
  return `/auth/complete?callbackUrl=${encodeURIComponent(callbackPath)}`
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const requestedPortal = searchParams.get("portal")
  const [activeTab, setActiveTab] = useState<Portal>(requestedPortal === "employee" || requestedPortal === "admin" ? requestedPortal : "customer")

  // Customer Login State
  const [customerEmailOrPhone, setCustomerEmailOrPhone] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState(["", "", "", "", "", ""])
  const otpInputs = useRef<(HTMLInputElement | null)[]>([])

  // Employee Login State
  const [employeeEmail, setEmployeeEmail] = useState("")
  const [employeePassword, setEmployeePassword] = useState("")

  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (status === "authenticated") {
      if (activeTab === "admin" && isAdminRole(session?.user?.role)) router.replace("/admin")
      if (activeTab === "employee") router.replace(searchParams.get("callbackUrl") || "/dashboard")
    }
  }, [status, session, router, activeTab, searchParams])

  useEffect(() => {
    const authError = searchParams.get("error")
    if (authError) {
      if (authError === "CredentialsSignin") {
        setError("Invalid credentials.")
      } else {
        setError(`Authentication error: ${authError}`)
      }
      window.history.replaceState({}, "", "/login")
    }
  }, [searchParams])

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: customerEmailOrPhone })
      })
      
      const data = await res.json()
      if (res.ok) {
        setOtpSent(true)
      } else {
        setError(data.error || "Failed to send code.")
      }
    } catch (err) {
      setError("An error occurred.")
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    const code = otpCode.join("")
    if (code.length !== 6) return

    setLoading(true)
    setError("")
    
    try {
      const res = await fetch("/api/auth/magic-link/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: customerEmailOrPhone, code })
      })

      const data = await res.json()
      if (res.ok && data.token) {
        localStorage.setItem("td_customer_token", data.token)
        router.push("/customer-portal")
      } else {
        setError(data.error || "Invalid code.")
      }
    } catch (err) {
      setError("An error occurred.")
    } finally {
      setLoading(false)
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    
    const newCode = [...otpCode]
    newCode[index] = value
    setOtpCode(newCode)
    
    if (value && index < 5) {
      otpInputs.current[index + 1]?.focus()
    } else if (index === 5 && value) {
      // Auto verify when the last digit is entered
      setTimeout(() => {
        const code = [...newCode]
        code[index] = value
        if (code.join("").length === 6) {
           // We can't auto-verify safely without causing loops if state is stale, so let user click or we just call the verify function
           const finalCode = code.join("")
           fetchVerifyOtp(finalCode)
        }
      }, 100)
    }
  }

  const fetchVerifyOtp = async (code: string) => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/auth/magic-link/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: customerEmailOrPhone, code })
      })

      const data = await res.json()
      if (res.ok && data.token) {
        localStorage.setItem("td_customer_token", data.token)
        router.push("/customer-portal")
      } else {
        setError(data.error || "Invalid code.")
      }
    } catch (err) {
      setError("An error occurred.")
    } finally {
      setLoading(false)
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpCode[index] && index > 0) {
      otpInputs.current[index - 1]?.focus()
    }
  }

  const handleEmployeeLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await signIn("credentials", {
      email: employeeEmail,
      password: employeePassword,
      redirect: false,
    })

    if (res?.error) {
      setError("Invalid credentials.")
      setLoading(false)
    } else {
      router.push("/dashboard") // or whatever employee default is
    }
  }

  const handleZohoLogin = async () => {
    if (process.env.NODE_ENV === "development") {
      window.location.assign("https://www.tdusales.com/employee-login")
      return
    }
    setLoading(true)
    setError("")
    const callbackUrl = activeTab === "admin" ? "/admin" : safeCallbackPath(searchParams.get("callbackUrl"))
    try {
      // OAuth providers always redirect in NextAuth v4. Asking for a return
      // value and manually assigning it creates a second navigation/reload.
      await signIn("zoho", { callbackUrl: ssoCompletionPath(callbackUrl) })
    } catch {
      setError("Unable to connect to Zoho. Please try again.")
      setLoading(false)
    }
  }

  const selectPortal = (portal: Portal) => {
    setActiveTab(portal)
    setError("")
    const url = new URL(window.location.href)
    url.searchParams.set("portal", portal)
    window.history.replaceState({}, "", `${url.pathname}${url.search}`)
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <SparkCanvas />

      <div className="w-full max-w-md bg-neutral-900/90 backdrop-blur-2xl border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-[0_0_60px_rgba(245,158,11,0.15)] relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-block mb-3">
            <Image src="/images/brand/titan-diamond-2026.png" alt="Titan Diamond USA" width={128} height={80} className="h-12 w-auto mx-auto" />
          </Link>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400 block mb-1">
            {activeTab === "customer" ? "CONTRACTOR PORTAL" : activeTab === "employee" ? "EMPLOYEE & REP PORTAL" : "ADMINISTRATIVE PORTAL"}
          </span>
          <h1 className="text-2xl font-black uppercase text-white tracking-tight">LOGIN</h1>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 bg-neutral-950 rounded-xl p-1 mb-6 border border-white/5 text-[10px] font-bold">
          <button
            type="button"
            onClick={() => selectPortal("customer")}
            className={`py-2.5 rounded-lg transition-all ${activeTab === "customer" ? "bg-amber-500 text-neutral-950 font-black shadow" : "text-neutral-400 hover:text-white"}`}
          >
            Contractor
          </button>
          <button
            type="button"
            onClick={() => selectPortal("employee")}
            className={`flex-1 py-2.5 rounded-lg transition-all ${activeTab === "employee" ? "bg-amber-500 text-neutral-950 font-black shadow" : "text-neutral-400 hover:text-white"}`}
          >
            Employee
          </button>
          <button
            type="button"
            onClick={() => selectPortal("admin")}
            className={`py-2.5 rounded-lg transition-all ${activeTab === "admin" ? "bg-amber-500 text-neutral-950 font-black shadow" : "text-neutral-400 hover:text-white"}`}
          >
            Admin
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-3 font-medium">
            <FiAlertCircle className="w-5 h-5 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Forms */}
        {activeTab === "customer" ? (
          <div>
            {!otpSent ? (
              <form onSubmit={handleSendMagicLink} className="space-y-4">
                <div>
                  <label className="text-xs font-mono font-bold text-neutral-400 block mb-2">EMAIL OR PHONE NUMBER</label>
                  <div className="relative">
                    <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                    <input
                      type="text"
                      required
                      value={customerEmailOrPhone}
                      onChange={(e) => setCustomerEmailOrPhone(e.target.value)}
                      placeholder="Email or Phone..."
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading || !customerEmailOrPhone}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-neutral-950 font-black text-xs uppercase tracking-wider py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                >
                  {loading ? "SENDING..." : "SEND CODE"} <FiArrowRight size={16} />
                </button>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="text-center">
                  <p className="text-sm text-neutral-300 mb-2">We sent a 6-digit code to</p>
                  <p className="font-bold text-amber-400">{customerEmailOrPhone}</p>
                </div>
                
                <div className="flex justify-between gap-2">
                  {otpCode.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { otpInputs.current[index] = el }}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      className="w-12 h-14 text-center bg-neutral-950 border border-white/10 rounded-xl text-xl font-bold text-white focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  ))}
                </div>

                <button
                  onClick={handleVerifyOtp}
                  disabled={loading || otpCode.join("").length !== 6}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-neutral-950 font-black text-xs uppercase tracking-wider py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? "VERIFYING..." : "VERIFY CODE"} <FiArrowRight size={16} />
                </button>

                <div className="text-center">
                  <button onClick={() => setOtpSent(false)} className="text-xs text-neutral-500 hover:text-white transition-colors">
                    Use a different email or phone
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === "employee" ? (
          <div className="space-y-5">
          {process.env.NODE_ENV === "development" && <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3 text-xs leading-5 text-cyan-100"><b>Development login:</b> use your staff email and password below. Zoho SSO requires the registered secure production callback.</div>}
          <button type="button" onClick={handleZohoLogin} disabled={loading} className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-neutral-950 font-black text-xs uppercase tracking-wider py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"><FiZap />{loading ? "CONNECTING..." : process.env.NODE_ENV === "development" ? "OPEN SECURE ZOHO SSO" : "CONTINUE WITH ZOHO SSO"}</button>
          <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-widest text-neutral-600"><span className="h-px flex-1 bg-white/10" />Or staff credentials<span className="h-px flex-1 bg-white/10" /></div>
          <form onSubmit={handleEmployeeLogin} className="space-y-4">
            <div>
              <label className="text-xs font-mono font-bold text-neutral-400 block mb-2">EMPLOYEE EMAIL</label>
              <div className="relative">
                <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                <input
                  type="email"
                  required
                  value={employeeEmail}
                  onChange={(e) => setEmployeeEmail(e.target.value)}
                  placeholder="employee@titan.com"
                  className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-mono font-bold text-neutral-400 block mb-2">PASSWORD</label>
              <div className="relative">
                <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                <input
                  type="password"
                  required
                  value={employeePassword}
                  onChange={(e) => setEmployeePassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-neutral-950 font-black text-xs uppercase tracking-wider py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {loading ? "AUTHENTICATING..." : "LOG IN"} <FiArrowRight size={16} />
            </button>
          </form>
          </div>
        ) : (
          <div className="space-y-5 text-center">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-5"><FiShield className="mx-auto text-3xl text-amber-400" /><h2 className="mt-3 text-sm font-black uppercase">Approved administrators only</h2><p className="mt-2 text-xs leading-5 text-neutral-400">Use your company Zoho identity. Your Titan role is checked again before access is granted.</p></div>
            {status === "authenticated" && !isAdminRole(session?.user?.role) && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">This signed-in account does not have administrator access.</div>}
            {process.env.NODE_ENV === "development" && <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3 text-xs leading-5 text-cyan-100"><b>Development:</b> Zoho SSO opens the registered secure production portal. Use the Employee tab for local staff credentials.</div>}
            <button type="button" onClick={handleZohoLogin} disabled={loading || status === "loading"} className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-neutral-950 font-black text-xs uppercase tracking-wider py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"><FiUsers />{loading ? "CONNECTING..." : process.env.NODE_ENV === "development" ? "OPEN SECURE ZOHO SSO" : "CONTINUE WITH ZOHO SSO"}<FiArrowRight /></button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
