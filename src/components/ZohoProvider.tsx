"use client"

import { createContext, useContext, useEffect, useState } from "react"

interface ZohoContextProps {
  isInitialized: boolean
  zohoContext: any | null
}

const ZohoContext = createContext<ZohoContextProps>({
  isInitialized: false,
  zohoContext: null,
})

export const useZoho = () => useContext(ZohoContext)

export function ZohoProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false)
  const [zohoContext, setZohoContext] = useState<any | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    // 1. URL params (Zoho Web Tab with Append Params or merge fields)
    const params = new URLSearchParams(window.location.search)
    // Handle all common Zoho param name formats
    const email = params.get("email") || params.get("userEmail") || params.get("user_email") || params.get("Email")
    const name = params.get("name") || params.get("userName") || params.get("user_name") || params.get("fullName") || params.get("Name")
    const zohoId = params.get("zohoId") || params.get("id") || params.get("userId") || params.get("user_id") || params.get("userID") || params.get("ID")

    if (email) {
      console.log("Auto-login from URL parameters:", { email, name, zohoId })

      const portalUser = {
        id: zohoId || email,
        name: name || email.split("@")[0],
        email,
        role: params.get("role") || params.get("Role") || params.get("userRole") || "Sales Representative",
        isZohoUser: true,
      }
      try { localStorage.setItem("sales_portal_user", JSON.stringify(portalUser)) } catch {}
      setZohoContext(portalUser)
      setIsInitialized(true)
      return
    }

    // 2. Existing saved session (standalone / mobile app)
    try {
      const saved = localStorage.getItem("sales_portal_user")
      if (saved) {
        const parsedUser = JSON.parse(saved)
        if (parsedUser?.email) {
          console.log("Restored session from localStorage:", parsedUser.email)
          setZohoContext(parsedUser)
          setIsInitialized(true)
          return
        }
      }
    } catch {}

    // 3. Check for Zoho SDK (embedded CRM widget)
    const checkZoho = setInterval(() => {
      if ((window as any).ZOHO) {
        clearInterval(checkZoho)
        clearTimeout(timeout)
        console.log("Zoho SDK detected, initializing embeddedApp...")

        // Failsafe timeout in case init() hangs (e.g. running standalone but script is loaded)
        const initFallback = setTimeout(() => {
          console.warn("Zoho embeddedApp.init timed out. Proceeding in standalone mode.")
          setIsInitialized(true)
        }, 3000)

        ;(window as any).ZOHO.embeddedApp.on("PageLoad", (entity: any) => {
          console.log("Zoho PageLoad Entity Context:", entity)
          setZohoContext(entity)
        })

        ;(window as any).ZOHO.embeddedApp.init().then(async () => {
          clearTimeout(initFallback)
          try {
            const userResp = await (window as any).ZOHO.CRM.CONFIG.getCurrentUser()
            if (userResp?.users?.length > 0) {
              const zohoUser = userResp.users[0]
              const portalUser = {
                id: zohoUser.id,
                name: zohoUser.full_name,
                email: zohoUser.email,
                role: zohoUser.profile?.name || "Sales Representative",
                isZohoUser: true,
              }
              try { localStorage.setItem("sales_portal_user", JSON.stringify(portalUser)) } catch {}
              setZohoContext(portalUser)
            }
          } catch (err) {
            console.error("Error fetching current Zoho user:", err)
          } finally {
            setIsInitialized(true)
          }
        }).catch((err: any) => {
          clearTimeout(initFallback)
          console.error("Zoho embeddedApp.init error:", err)
          setIsInitialized(true)
        })
      }
    }, 100)

    // 4. No Zoho SDK after 2 seconds → standalone mode, go to login
    const timeout = setTimeout(() => {
      clearInterval(checkZoho)
      setIsInitialized(true) // Let the app redirect to /login
    }, 2000)

    return () => {
      clearInterval(checkZoho)
      clearTimeout(timeout)
    }
  }, [])

  return (
    <ZohoContext.Provider value={{ isInitialized, zohoContext }}>
      {children}
    </ZohoContext.Provider>
  )
}
