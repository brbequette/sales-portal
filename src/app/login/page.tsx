"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn, useSession } from "next-auth/react"
import Link from "next/link"
import { FiLock, FiMail, FiArrowRight, FiCheckCircle, FiShield, FiAlertCircle } from "react-icons/fi"
import { SparkCanvas } from "@/components/SparkCanvas"

function ContractorLoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [loginMode, setLoginMode] = useState<"password" | "account">("password")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/account")
    }
  }, [status, router])

  useEffect(() => {
    const authError = searchParams.get("error")
    if (authError) {
      if (authError === "CredentialsSignin") {
        setError("Invalid contractor email or password.")
      } else {
        setError(`Authentication error: ${authError}`)
      }
      window.history.replaceState({}, "", "/login")
    }
  }, [searchParams])

  const handleContractorLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    // Fast client-side demo account bypass for contractor testing
    if (email === "contractor@titan.com" || accountNumber === "TITAN-8890") {
      if (typeof window !== "undefined") {
        localStorage.setItem("td_customer_session", JSON.stringify({
          accountName: "Apex Sawing & Core Drilling",
          accountNumber: "TITAN-8890",
          tier: "Platinum Wholesale (25% OFF)",
          repName: "Mark Johnson",
          repPhone: "(800) 555-0199 ext 104"
        }))
      }
      router.push("/account")
      return
    }

    const res = await signIn("credentials", {
      email: email || accountNumber,
      password,
      redirect: false,
    })

    if (res?.error) {
      setError("Invalid contractor credentials. Try demo email: contractor@titan.com with password: demo")
      setLoading(false)
    } else {
      router.push("/account")
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <SparkCanvas />

      <div className="w-full max-w-md bg-neutral-900/90 backdrop-blur-2xl border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-[0_0_60px_rgba(245,158,11,0.15)] relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-block mb-3">
            <img src="/titan-logo.png" alt="Titan Diamond USA" className="h-12 w-auto mx-auto" />
          </Link>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400 block mb-1">CONTRACTOR ACCOUNT PORTAL</span>
          <h1 className="text-2xl font-black uppercase text-white tracking-tight">CONTRACTOR LOGIN</h1>
          <p className="text-xs text-neutral-400 mt-1">Access Wholesale Tier Pricing & Order Management</p>
        </div>

        {/* Benefits Banner */}
        <div className="mb-6 bg-neutral-950/80 border border-white/10 rounded-2xl p-4 text-xs space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold">
            <FiCheckCircle size={14} /> Wholesale Pricing Active Upon Sign-In
          </div>
          <p className="text-neutral-400 text-[11px]">
            Contractor account holders unlock wholesale volume discounts, order status tracking, and direct sales rep support.
          </p>
        </div>

        {/* Login Mode Tabs */}
        <div className="flex bg-neutral-950 rounded-xl p-1 mb-6 border border-white/5 text-xs font-bold">
          <button
            type="button"
            onClick={() => setLoginMode("password")}
            className={`flex-1 py-2.5 rounded-lg transition-all ${loginMode === "password" ? "bg-amber-500 text-neutral-950 font-black shadow" : "text-neutral-400 hover:text-white"}`}
          >
            Email & Password
          </button>
          <button
            type="button"
            onClick={() => setLoginMode("account")}
            className={`flex-1 py-2.5 rounded-lg transition-all ${loginMode === "account" ? "bg-amber-500 text-neutral-950 font-black shadow" : "text-neutral-400 hover:text-white"}`}
          >
            Account # Verification
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-3 font-medium">
            <FiAlertCircle className="w-5 h-5 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleContractorLogin} className="space-y-4">
          {loginMode === "password" ? (
            <>
              <div>
                <label className="text-xs font-mono font-bold text-neutral-400 block mb-2">CONTRACTOR EMAIL ADDRESS</label>
                <div className="relative">
                  <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contractor@titan.com"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-mono font-bold text-neutral-400 block mb-2">ACCOUNT PASSWORD</label>
                <div className="relative">
                  <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs font-mono font-bold text-neutral-400 block mb-2">CONTRACTOR ACCOUNT NUMBER</label>
              <div className="relative">
                <FiShield className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                <input
                  type="text"
                  required
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="e.g. TITAN-8890"
                  className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-neutral-950 font-black text-xs uppercase tracking-wider py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            {loading ? "AUTHENTICATING..." : "LOG IN TO CONTRACTOR PORTAL"} <FiArrowRight size={16} />
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/10 text-center space-y-3">
          <p className="text-xs text-neutral-400">
            Don't have a contractor account yet?{" "}
            <Link href="/contact" className="text-amber-400 font-bold hover:underline">
              Request Wholesale Account
            </Link>
          </p>
          <div className="pt-2">
            <Link
              href="/employee-login"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-400 hover:text-amber-400 transition-colors"
            >
              👔 Titan Employee / Sales Rep Login →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ContractorLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ContractorLoginContent />
    </Suspense>
  )
}
