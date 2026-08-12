"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useZoho } from "./ZohoProvider"

const PUBLIC_ROUTES = [
  "/",
  "/shop",
  "/catalog",
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
  const authorized = status === "authenticated" || Boolean(zohoContext?.email && zohoContext.isZohoUser)

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
