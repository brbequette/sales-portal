"use client"


import { useZoho } from "./ZohoProvider"
import { useEffect, useState, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useSession } from "next-auth/react"

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { isInitialized, zohoContext } = useZoho()
  const { status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [checking, setChecking] = useState(true)
  const redirected = useRef(false)

  // Detect login page synchronously from window.location (immune to Next.js hydration delay)
  const isLoginPage = typeof window !== "undefined" && window.location.pathname.includes("/login")

  // Fast-path: if URL carries Zoho merge-field params (email or zohoId),
  // the user is already identified — authorize immediately
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get("email") || params.get("zohoId") || params.get("id")) {
      setIsAuthorized(true)
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    // Login page always renders — no auth gating needed
    if (isLoginPage) {
      setIsAuthorized(true)
      setChecking(false)
      return
    }

    // Wait for NextAuth to finish checking
    if (status === "loading") {
      return
    }

    // If NextAuth has authenticated the user
    if (status === "authenticated") {
      setIsAuthorized(true)
      setChecking(false)
      return
    }

    // Check localStorage directly for fast unlock (before ZohoProvider finishes)
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("sales_portal_user") : null
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.email) {
          setIsAuthorized(true)
          setChecking(false)
          return
        }
      }
    } catch {}

    // If ZohoProvider has finished initializing
    if (isInitialized) {
      if (zohoContext?.email) {
        // User is authenticated
        setIsAuthorized(true)
        setChecking(false)
      } else {
        // No session found — redirect to login
        if (!redirected.current) {
          redirected.current = true
          console.log("No session found. Redirecting to login.")
          window.location.href = "/login"
        }
        setChecking(false)
      }
      return
    }

    // Fallback timeout: if ZohoProvider hasn't initialized after 5 seconds,
    // check localStorage one more time then redirect
    const timer = setTimeout(() => {
      let hasUser = false
      try {
        const saved = typeof window !== "undefined" ? localStorage.getItem("sales_portal_user") : null
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed?.email) hasUser = true
        }
      } catch {}

      const params = new URLSearchParams(window.location.search)
      const hasUrlParams = !!(params.get("email") || params.get("zohoId") || params.get("id"))

      if (!hasUser && !hasUrlParams && !redirected.current) {
        redirected.current = true
        console.log("Auth timeout. Redirecting to login.")
        window.location.href = "/login"
      }
      setChecking(false)
    }, 5000)

    return () => clearTimeout(timer)

  }, [isInitialized, zohoContext, isLoginPage, status])

  // Login page always renders immediately
  if (isLoginPage) return <>{children}</>

  // Still checking — show loading
  if (checking || !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-(--background) text-(--foreground)">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-(--primary) border-t-transparent rounded-full animate-spin mb-4"></div>
          <p>Verifying credentials...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

