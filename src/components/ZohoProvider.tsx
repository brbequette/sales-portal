"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { useSession } from "next-auth/react"

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
  const { data: session, status } = useSession()

  useEffect(() => {
    if (typeof window === "undefined") return

    const currentPath = window.location.pathname

    // ── LOGIN PAGE: Never run SDK init, only handle incoming zoho_auth ──
    // The login page handles its own zoho_auth param decoding.
    // We just need to check if there's already a session to redirect away.
    if (currentPath.includes("/login")) {
      try {
        const saved = localStorage.getItem("sales_portal_user")
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed?.email) {
            setZohoContext(parsed)
          }
        }
      } catch {}
      setIsInitialized(true)
      return // No SDK init needed on login page
    }

    // ── STEP 1: NextAuth Session ──
    if (status === "loading") return
    if (status === "authenticated" && session?.user) {
      console.log("Restored session from NextAuth:", session.user.email)
      setZohoContext(session.user)
      setIsInitialized(true)
      try {
        localStorage.setItem("sales_portal_user", JSON.stringify(session.user))
      } catch {}
      return
    }

    // ── STEP 2: URL params (Zoho Web Tab with Append Params or merge fields) ──
    const params = new URLSearchParams(window.location.search)
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
      setZohoContext(portalUser)
      setIsInitialized(true)

      // Sync fresh role from DB in background
      fetch(`/api/get-user?email=${encodeURIComponent(email)}`)
        .then(res => res.json())
        .then(realUser => {
          if (realUser?.email) {
            const updatedUser = { ...portalUser, ...realUser, isZohoUser: true }
            try { localStorage.setItem("sales_portal_user", JSON.stringify(updatedUser)) } catch {}
            setZohoContext(updatedUser)
          } else {
            try { localStorage.setItem("sales_portal_user", JSON.stringify(portalUser)) } catch {}
          }
        })
        .catch(() => {
          try { localStorage.setItem("sales_portal_user", JSON.stringify(portalUser)) } catch {}
        })

      return
    }

    // ── STEP 2: Existing saved session (standalone / mobile) ──
    try {
      const saved = localStorage.getItem("sales_portal_user")
      if (saved) {
        const parsedUser = JSON.parse(saved)
        if (parsedUser?.email) {
          console.log("Restored session from localStorage:", parsedUser.email)
          setZohoContext(parsedUser)
          setIsInitialized(true)

          // Sync fresh role from DB in background (non-blocking)
          fetch(`/api/get-user?email=${encodeURIComponent(parsedUser.email)}`)
            .then(res => res.json())
            .then(realUser => {
              if (realUser?.email) {
                const updatedUser = { ...parsedUser, ...realUser, isZohoUser: true }
                try { localStorage.setItem("sales_portal_user", JSON.stringify(updatedUser)) } catch {}
                setZohoContext(updatedUser)
              }
            })
            .catch(() => {})

          return // ← CRITICAL: Skip SDK init entirely when localStorage session exists
        }
      }
    } catch {}

    // ── STEP 3: Check for Zoho SDK (embedded CRM widget) ──
    // Only reached when there's NO localStorage session and NO URL params.
    // This means we're either:
    //   a) Running inside a Zoho CRM iframe (widget)
    //   b) A new user with no session → will fall through to login redirect
    const checkZoho = setInterval(() => {
      if ((window as any).ZOHO) {
        clearInterval(checkZoho)
        clearTimeout(timeout)
        console.log("Zoho SDK detected, initializing embeddedApp...")

        // Failsafe: if init() hangs (running standalone but SDK script loaded), give up after 3s
        const initFallback = setTimeout(() => {
          console.warn("Zoho embeddedApp.init timed out. Standalone mode — redirecting to login.")
          setIsInitialized(true) // Let AuthWrapper redirect to /login
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
              setZohoContext(portalUser)

              // Sync fresh role from DB
              fetch(`/api/get-user?email=${encodeURIComponent(zohoUser.email)}`)
                .then(res => res.json())
                .then(realUser => {
                  if (realUser?.email) {
                    const updatedUser = { ...portalUser, ...realUser, isZohoUser: true }
                    try { localStorage.setItem("sales_portal_user", JSON.stringify(updatedUser)) } catch {}
                    setZohoContext(updatedUser)
                  } else {
                    try { localStorage.setItem("sales_portal_user", JSON.stringify(portalUser)) } catch {}
                  }
                })
                .catch(() => {
                  try { localStorage.setItem("sales_portal_user", JSON.stringify(portalUser)) } catch {}
                })
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

    // ── STEP 4: No SDK after 2 seconds → standalone mode, go to login ──
    const timeout = setTimeout(() => {
      clearInterval(checkZoho)
      console.log("No Zoho SDK and no session. Standalone mode.")
      setIsInitialized(true) // AuthWrapper or page will redirect to /login
    }, 2000)

    return () => {
      clearInterval(checkZoho)
      clearTimeout(timeout)
    }
  }, [status, session])

  return (
    <ZohoContext.Provider value={{ isInitialized, zohoContext }}>
      {children}
    </ZohoContext.Provider>
  )
}
