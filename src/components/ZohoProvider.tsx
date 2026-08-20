"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { sessionGet, sessionSet, TTL } from "@/lib/dataCache"

export interface PortalUser {
  id: string
  dbId?: string
  zohoId?: string
  repId?: string
  name?: string | null
  fullName?: string | null
  email: string
  role?: string
  isZohoUser: boolean
}

async function getFreshPortalUser(email: string) {
  const cacheKey = `portal-user:${email.toLowerCase()}`
  const cached = sessionGet<Partial<PortalUser>>(cacheKey, TTL.TEN_MIN)
  if (cached) return cached

  const response = await fetch(`/api/get-user?email=${encodeURIComponent(email)}`)
  if (!response.ok) return null
  const user = await response.json() as Partial<PortalUser>
  if (user.email) sessionSet(cacheKey, user)
  return user
}

interface ZohoContextProps {
  isInitialized: boolean
  zohoContext: PortalUser | null
}

interface EmbeddedZohoUser {
  id: string
  full_name?: string
  email: string
  profile?: { name?: string }
}

interface ZohoSdk {
  embeddedApp: { init: () => Promise<void> }
  CRM: { CONFIG: { getCurrentUser: () => Promise<{ users?: EmbeddedZohoUser[] }> } }
}

const ZohoContext = createContext<ZohoContextProps>({ isInitialized: false, zohoContext: null })

export const useZoho = () => useContext(ZohoContext)

const NON_STAFF_ROUTES = [
  "/", "/about", "/admin-login", "/blade-comparator", "/blade-finder", "/careers",
  "/contact", "/customer-portal", "/employee-login", "/intro-offer", "/knowledge-test", "/login",
  "/privacy", "/rep-portal", "/resources", "/rpm-calculator", "/shop", "/signature-series", "/terms", "/unit-converter",
]

function isNonStaffRoute(pathname: string) {
  return NON_STAFF_ROUTES.some((route) => pathname === route || (route !== "/" && pathname.startsWith(`${route}/`)))
}

export function ZohoProvider({ children }: { children: React.ReactNode }) {
  const [sdkInitialized, setSdkInitialized] = useState(false)
  const [embeddedUser, setEmbeddedUser] = useState<PortalUser | null>(null)
  const { data: session, status } = useSession()
  const pathname = usePathname() || "/"
  const sessionUser = status === "authenticated" && session?.user?.email
    ? { ...session.user, email: session.user.email, isZohoUser: true } satisfies PortalUser
    : null
  const skipSdk = isNonStaffRoute(pathname)

  useEffect(() => {
    if (typeof window === "undefined" || status !== "unauthenticated" || skipSdk) return

    let disposed = false
    let initializationTimer: ReturnType<typeof setTimeout> | undefined

    const sdkTimer = setInterval(() => {
      const zoho = (window as Window & { ZOHO?: ZohoSdk }).ZOHO
      if (!zoho) return

      clearInterval(sdkTimer)
      initializationTimer = setTimeout(() => {
        if (!disposed) setSdkInitialized(true)
      }, 3000)

      zoho.embeddedApp.init().then(async () => {
        if (initializationTimer) clearTimeout(initializationTimer)
        try {
          const response = await zoho.CRM.CONFIG.getCurrentUser()
          const zohoUser = response.users?.[0]
          if (!zohoUser || disposed) return

          const portalUser: PortalUser = {
            id: zohoUser.id,
            zohoId: zohoUser.id,
            name: zohoUser.full_name,
            fullName: zohoUser.full_name,
            email: zohoUser.email,
            role: zohoUser.profile?.name || "Sales Representative",
            isZohoUser: true,
          }
          const databaseUser = await getFreshPortalUser(zohoUser.email).catch(() => null)
          if (!disposed) setEmbeddedUser(databaseUser ? { ...portalUser, ...databaseUser, email: zohoUser.email, isZohoUser: true } : portalUser)
        } finally {
          if (!disposed) setSdkInitialized(true)
        }
      }).catch(() => {
        if (!disposed) setSdkInitialized(true)
      })
    }, 100)

    const sdkTimeout = setTimeout(() => {
      clearInterval(sdkTimer)
      if (!disposed) setSdkInitialized(true)
    }, 2000)

    return () => {
      disposed = true
      clearInterval(sdkTimer)
      clearTimeout(sdkTimeout)
      if (initializationTimer) clearTimeout(initializationTimer)
    }
  }, [skipSdk, status])

  const isInitialized = status !== "loading" && (Boolean(sessionUser) || skipSdk || sdkInitialized)
  return <ZohoContext.Provider value={{ isInitialized, zohoContext: sessionUser || embeddedUser }}>{children}</ZohoContext.Provider>
}
