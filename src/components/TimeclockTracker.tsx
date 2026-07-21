"use client"


import { useEffect, useRef } from "react"
import { useZoho } from "./ZohoProvider"
import { usePathname } from "next/navigation"

export function TimeclockTracker() {
  const { zohoContext: currentUser } = useZoho()
  const pathname = usePathname()
  
  // Track last time we sent a ping to avoid spam
  const lastPingTime = useRef<number>(0)
  // Keep pathname in a ref so navigation doesn't restart the interval
  const pathnameRef = useRef(pathname)
  useEffect(() => { pathnameRef.current = pathname }, [pathname])

  useEffect(() => {
    // Only track if logged in
    if (!currentUser?.id) return

    const sendPing = async () => {
      const now = Date.now()
      // Throttle pings to once per 5 minutes max
      if (now - lastPingTime.current < 300000) return
      
      try {
        lastPingTime.current = now
        
        const res = await fetch("/api/timeclock/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            userId: currentUser.id,
            email: currentUser.email,
            name: currentUser.name || currentUser.fullName || "Zoho User"
          })
        })
        if (res.ok) {
          const data = await res.json()
          if (data.entry) {
            console.debug("Timeclock sync status:", data.active ? "active" : "inactive")
          }
        }
      } catch (err) {
        console.error("Timeclock ping failed", err)
      }
    }

    // Ping on mount (first access)
    sendPing()

    // Ping loop every 5 minutes to stay within the 20-minute inactivity threshold
    const interval = setInterval(sendPing, 300000)
    
    // Activity listeners — reset throttle so the next ping fires immediately on activity
    let throttleTimeout: NodeJS.Timeout | null = null
    const handleActivity = () => {
      if (!throttleTimeout) {
        // Reset the throttle so the next interval tick will fire a ping
        lastPingTime.current = 0
        throttleTimeout = setTimeout(() => {
          throttleTimeout = null
        }, 30000) // only react to DOM events every 30s max
      }
    }

    window.addEventListener("mousemove", handleActivity)
    window.addEventListener("keydown", handleActivity)
    window.addEventListener("click", handleActivity)
    window.addEventListener("scroll", handleActivity)

    return () => {
      clearInterval(interval)
      window.removeEventListener("mousemove", handleActivity)
      window.removeEventListener("keydown", handleActivity)
      window.removeEventListener("click", handleActivity)
      window.removeEventListener("scroll", handleActivity)
      if (throttleTimeout) clearTimeout(throttleTimeout)
    }
  }, [currentUser?.id])

  return null
}

