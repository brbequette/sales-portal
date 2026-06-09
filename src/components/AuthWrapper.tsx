"use client"

import { useZoho } from "./ZohoProvider"
import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { isInitialized, zohoContext } = useZoho()
  const router = useRouter()
  const pathname = usePathname()
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [checking, setChecking] = useState(true)
  const [isLoginPage, setIsLoginPage] = useState(false)

  // Use synchronous window.location to determine initial login page status
  // which is immune to Next.js client-side router hydration delay
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsLoginPage(window.location.pathname.includes("/login"))
    }
  }, [pathname])

  // Fast-path: if URL carries Zoho merge-field params (email or zohoId),
  // the user is already identified — authorize immediately without waiting
  // for the full SDK. This mirrors how the Commission Hub handles autologin.
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get("email") || params.get("zohoId") || params.get("id")) {
      setIsAuthorized(true)
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    if (isLoginPage) {
      if (isInitialized && zohoContext) {
        console.log("Zoho session found while on login page. Redirecting to dashboard.")
        window.location.href = "/"
        return
      }
      setIsAuthorized(true)
      setChecking(false)
      return
    }

    // 2. Read local user safely to prevent SecurityErrors in sandboxed frames
    let localUserJson = null
    try {
      localUserJson = typeof window !== "undefined" ? localStorage.getItem("sales_portal_user") : null
    } catch (e) {
      console.warn("localStorage read blocked:", e)
    }
    const hasLocalUser = !!localUserJson

    // 3. If we have a local user cached (already logged in), authorize immediately.
    if (hasLocalUser) {
      setIsAuthorized(true)
      setChecking(false)
      return
    }

    // 4. If the Zoho SDK successfully initialized (running as a Widget), authorize immediately.
    // Wait, if isInitialized is true but no zohoContext, we shouldn't authorize them if they have no session,
    // but the downstream page.tsx handles redirecting to /login if !currentUser. So we just unblock rendering.
    if (isInitialized) {
      setIsAuthorized(true)
      setChecking(false)
      return
    }

    // 5. Fallback: Wait for Zoho SDK initialization.
    // If it doesn't initialize and we don't have a local user, redirect to /login.
    // We wait 10s to give the Zoho embedded app SDK enough time to load inside
    // Zoho CRM iframes — matching the Commission Hub's behavior.
    const timer = setTimeout(() => {
      let currentLocalUserJson = null
      try {
        currentLocalUserJson = typeof window !== "undefined" ? localStorage.getItem("sales_portal_user") : null
      } catch (e) {
        console.warn("localStorage read blocked in timer:", e)
      }
      const currentHasLocalUser = !!currentLocalUserJson

      // Also check URL params one more time before giving up
      const params = new URLSearchParams(window.location.search)
      const hasUrlParams = !!(params.get("email") || params.get("zohoId") || params.get("id"))
      
      if (!isInitialized && !currentHasLocalUser && !hasUrlParams) {
        console.log("Authorization timeout. Redirecting to login.")
        window.location.href = "/login"
      }
      setChecking(false)
    }, 10000)

    return () => clearTimeout(timer)

  }, [isInitialized, zohoContext, router, isLoginPage])

  if (isLoginPage) return <>{children}</>

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
