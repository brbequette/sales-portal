"use client"

import { createContext, useContext, useEffect, useState } from "react"

interface ZohoContextProps {
  isInitialized: boolean
  zohoContext: any | null // Holds the current sales rep / environment data
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
    // 1. Check if Zoho parameters are passed in the URL (for standard URL Web Tabs with merge fields)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const email = params.get("email")
      const name = params.get("name")
      const zohoId = params.get("zohoId") || params.get("id")

      if (email) {
        console.log("Auto-login from URL parameters:", { email, name, zohoId })
        const portalUser = {
          id: zohoId || email,
          name: name || email.split("@")[0],
          email: email,
          role: "Sales Representative",
          isZohoUser: true
        }
        try {
          localStorage.setItem("sales_portal_user", JSON.stringify(portalUser))
        } catch (e) {
          console.warn("localStorage write blocked:", e)
        }
        setZohoContext(portalUser)
        setIsInitialized(true)
        return
      }
    }

    // 2. Otherwise fall back to check for the ZOHO Widget SDK
    const checkZoho = setInterval(() => {
      if (typeof window !== "undefined" && (window as any).ZOHO) {
        clearInterval(checkZoho)
        console.log("Zoho SDK detected, initializing embeddedApp...")
        
        // Initialize the embedded app
        ;(window as any).ZOHO.embeddedApp.on("PageLoad", (entity: any) => {
          console.log("Zoho PageLoad Entity Context:", entity)
          setZohoContext(entity)
        })

        ;(window as any).ZOHO.embeddedApp.init().then(async () => {
          console.log("Zoho embedded app initialized.")
          try {
            const userResp = await (window as any).ZOHO.CRM.CONFIG.getCurrentUser()
            console.log("Current Zoho CRM User:", userResp)
            if (userResp && userResp.users && userResp.users.length > 0) {
              const zohoUser = userResp.users[0]
              const portalUser = {
                id: zohoUser.id,
                name: zohoUser.full_name,
                email: zohoUser.email,
                role: zohoUser.profile?.name || "Sales Representative",
                isZohoUser: true
              }
              // Save to localStorage so that the rest of the application can access it
              try {
                localStorage.setItem("sales_portal_user", JSON.stringify(portalUser))
              } catch (e) {
                console.warn("localStorage write blocked:", e)
              }
              setZohoContext(portalUser)
              setIsInitialized(true)
            } else {
              setIsInitialized(true)
            }
          } catch (err) {
            console.error("Error fetching current Zoho user:", err)
            setIsInitialized(true) // Still initialize so that standalone fallback works
          }
        }).catch((err: any) => {
          console.error("Zoho embeddedApp.init error:", err)
        })
      }
    }, 100)

    // Clear interval after 12 seconds if ZOHO doesn't load (standalone fallback)
    const timeout = setTimeout(() => {
      clearInterval(checkZoho)
    }, 12000)

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
