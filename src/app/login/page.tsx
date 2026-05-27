"use client"

import { useState } from "react"

import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
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
        router.push("/")
      } else {
        setError(data.message || "Invalid email or password")
        setLoading(false)
      }
    } catch (err) {
      setError("An error occurred during authentication")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-(--background) text-(--foreground) relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-(--primary) rounded-full opacity-20 blur-[120px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full opacity-20 blur-[120px]"></div>

      <div className="w-full max-w-md p-8 bg-(--card)/80 backdrop-blur-xl border border-(--border) rounded-2xl shadow-2xl relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-(--primary)/20 mb-4 ring-1 ring-(--primary)/50 shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]">
            <svg className="w-8 h-8 text-(--primary)" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Titan Diamond</h1>
          <p className="text-gray-400 mt-2">Sign in to your Sales Portal</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/50 text-red-400 text-sm flex items-center gap-2">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-black/40 border border-(--border) rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-(--primary) focus:border-transparent transition-all"
              placeholder="agent@titandiamond.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-black/40 border border-(--border) rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-(--primary) focus:border-transparent transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-(--primary) hover:bg-(--primary)/90 text-white font-semibold rounded-xl shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Authenticating...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Secure Enterprise Portal &bull; Unauthorized access is prohibited</p>
        </div>
      </div>
    </div>
  )
}
