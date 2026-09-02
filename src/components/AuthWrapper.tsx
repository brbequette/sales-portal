"use client"

import { useEffect, useRef, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useZoho } from "./ZohoProvider"

const PUBLIC_ROUTES = [
  "/",
  "/shop",
  "/about",
  "/contact",
  "/resources",
  "/technical-information",
  "/blade-finder",
  "/applications",
  "/signature-series",
  "/knowledge-test",
  "/rpm-calculator",
  "/blade-comparator",
  "/unit-converter",
  "/tools",
  "/training",
  "/docs",
  "/careers",
  "/admin-login",
  "/employee-login",
  "/customer-portal",
  "/privacy",
  "/terms",
  "/login",
  "/display",
  "/intro-offer",
  "/rep-portal",
]

function isPublicRoute(pathname: string) {
  return pathname === "/"
    || PUBLIC_ROUTES.some((route) => route !== "/" && (pathname === route || pathname.startsWith(`${route}/`)))
    || pathname.startsWith("/tv")
    || pathname.startsWith("/print/")
}

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { isInitialized, zohoContext } = useZoho()
  const { status } = useSession()
  const pathname = usePathname() || "/"
  const redirected = useRef(false)
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  )
  const publicPage = isPublicRoute(pathname)
  const isLocalhost = hydrated && (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  )
  const isDevQueryBypass = useSyncExternalStore(
    callback => {
      window.addEventListener("popstate", callback)
      queueMicrotask(callback)
      return () => window.removeEventListener("popstate", callback)
    },
    () => process.env.NODE_ENV === "development" && new URLSearchParams(window.location.search).get("bypass") === "true",
    () => false,
  )
  const isSecondDisplayFrame = useSyncExternalStore(
    callback => {
      window.addEventListener("popstate", callback)
      queueMicrotask(callback)
      return () => window.removeEventListener("popstate", callback)
    },
    () => new URLSearchParams(window.location.search).get("display") === "1",
    () => false,
  )
  const isBypass = isDevQueryBypass || (isLocalhost && (
    localStorage.getItem("x-bypass-auth") === "true" ||
    sessionStorage.getItem("x-bypass-auth") === "true" ||
    new URLSearchParams(window.location.search).get("bypass") === "true"
  ))
  const authorized = status === "authenticated" || Boolean(zohoContext?.email && zohoContext.isZohoUser) || isBypass

  useEffect(() => {
    if (publicPage || status === "loading" || !isInitialized || authorized || redirected.current) return
    redirected.current = true
    window.location.assign("/employee-login")
  }, [authorized, isInitialized, publicPage, status])

  if (publicPage) return <>{children}</>

  // A second-display iframe shares this origin's authenticated cookie. Let its
  // route render while NextAuth hydrates instead of blanking the entire screen
  // on every synchronized navigation. Once hydration completes, the redirect
  // above still removes an unauthenticated frame; protected routes and APIs
  // continue to perform their own server-side authorization.
  if (!isSecondDisplayFrame && !isBypass && (!isInitialized || status === "loading" || !authorized)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-(--background) text-(--foreground)">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-(--primary) border-t-transparent rounded-full animate-spin mb-4" />
          <p>Verifying credentials...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
