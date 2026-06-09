"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPasswordLogin, setShowPasswordLogin] = useState(false)
  const [processingZoho, setProcessingZoho] = useState(false)

  // Handle Zoho OAuth callback — read the encoded user from URL params
  useEffect(() => {
    const zohoAuth = searchParams.get("zoho_auth")
    const authError = searchParams.get("error")

    if (authError) {
      const messages: Record<string, string> = {
        token_failed: "Zoho authentication failed. Please try again.",
        no_email: "Could not retrieve your email from Zoho.",
        no_code: "Authorization was cancelled.",
        server_error: "A server error occurred. Please try again.",
      }
      setError(messages[authError] || `Authentication error: ${authError}`)
      // Clean URL
      window.history.replaceState({}, "", "/login")
      return
    }

    if (zohoAuth) {
      setProcessingZoho(true)
      try {
        const decoded = JSON.parse(atob(decodeURIComponent(zohoAuth)))
        if (decoded?.email) {
          localStorage.setItem("sales_portal_user", JSON.stringify(decoded))
          // Clean URL and force full reload to re-init ZohoProvider
          window.location.href = "/"
          return
        }
      } catch (e) {
        console.error("Failed to decode Zoho auth payload:", e)
        setError("Failed to process Zoho sign-in. Please try again.")
      }
      setProcessingZoho(false)
      window.history.replaceState({}, "", "/login")
    }
  }, [searchParams, router])

  const handleZohoLogin = () => {
    setLoading(true)
    setError("")
    // Redirect to our backend which initiates the Zoho OAuth flow, 
    // explicitly passing the origin to bypass Netlify proxy host rewrites.
    // Also attach a timestamp to aggressively bust browser 302 redirect caches.
    window.location.href = `/api/auth/zoho?origin=${encodeURIComponent(window.location.origin)}&t=${Date.now()}`
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json()

      if (response.ok && data.success) {
        try {
          localStorage.setItem("sales_portal_user", JSON.stringify(data.user))
        } catch (e) {
          console.warn("localStorage write blocked:", e)
        }
        window.location.href = "/"
      } else {
        setError(data.message || "Invalid email or password")
        setLoading(false)
      }
    } catch (err) {
      setError("An error occurred during authentication")
      setLoading(false)
    }
  }

  if (processingZoho) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-neutral-400 text-sm animate-pulse">Signing you in with Zoho...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute top-[-15%] left-[-10%] w-[45%] h-[45%] bg-emerald-600 rounded-full opacity-15 blur-[140px]"></div>
      <div className="absolute bottom-[-15%] right-[-10%] w-[45%] h-[45%] bg-sky-600 rounded-full opacity-15 blur-[140px]"></div>

      <div className="w-full max-w-md p-6 sm:p-8 bg-neutral-900/80 backdrop-blur-xl border border-neutral-800 rounded-2xl shadow-2xl relative z-10">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 mb-4 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
            <span className="font-black text-white text-2xl">T</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Titan Diamond</h1>
          <p className="text-neutral-500 mt-1 text-sm">Sales Portal</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Primary: Sign in with Zoho */}
        <button
          onClick={handleZohoLogin}
          disabled={loading}
          className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed text-sm"
        >
          {loading && !showPasswordLogin ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Redirecting to Zoho...
            </>
          ) : (
            <>
              {/* Zoho-style icon */}
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 6l4.5 4.5L2 15h3l4.5-4.5L5 6H2zm7 0l4.5 4.5L9 15h3l4.5-4.5L12 6H9zm7 0l4.5 4.5L16 15h3l4.5-4.5L19 6h-3z" opacity="0.9"/>
              </svg>
              Sign in with Zoho
            </>
          )}
        </button>

        <p className="text-center text-[11px] text-neutral-600 mt-3">
          Use your Zoho One account to sign in securely
        </p>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-800"></div>
          </div>
          <div className="relative flex justify-center">
            <button 
              onClick={() => setShowPasswordLogin(!showPasswordLogin)}
              className="px-3 py-1 bg-neutral-900 text-neutral-600 text-[11px] hover:text-neutral-400 transition-colors cursor-pointer"
            >
              {showPasswordLogin ? "Hide password login" : "Or use email & password"}
            </button>
          </div>
        </div>

        {/* Secondary: Password Login (collapsed by default) */}
        {showPasswordLogin && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4 animate-in fade-in duration-300">
            <div>
              <label className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                placeholder="you@titandiamond.net"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wider">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold rounded-xl border border-neutral-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed text-sm"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Sign In with Password"
              )}
            </button>
          </form>
        )}

        <div className="mt-8 text-center text-[11px] text-neutral-700">
          <p>Secure Enterprise Portal &bull; Titan Diamond &copy; {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
