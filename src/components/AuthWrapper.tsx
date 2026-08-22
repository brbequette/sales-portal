"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useZoho } from "./ZohoProvider"

const PUBLIC_ROUTES = [
  "/",
  "/shop",
  "/about",
  "/contact",
  "/resources",
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
  const publicPage = isPublicRoute(pathname)
  const isLocalhost = typeof window !== "undefined" && (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  )
  const isBypass = isLocalhost && (
    localStorage.getItem("x-bypass-auth") === "true" ||
    sessionStorage.getItem("x-bypass-auth") === "true" ||
    new URLSearchParams(window.location.search).get("bypass") === "true"
  )
  const authorized = status === "authenticated" || Boolean(zohoContext?.email && zohoContext.isZohoUser) || isBypass

  useEffect(() => {
    if (publicPage || status === "loading" || !isInitialized || authorized || redirected.current) return
    redirected.current = true
    window.location.assign("/employee-login")
  }, [authorized, isInitialized, publicPage, status])

  if (publicPage) return <>{children}</>

  if (!isInitialized || status === "loading" || !authorized) {
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
