"use client"

import { useEffect, useRef } from "react"
import { useZoho } from "./ZohoProvider"
import { usePathname } from "next/navigation"

export function TimeclockTracker() {
  const { zohoContext: currentUser } = useZoho()
  const pathname = usePathname()
  
  // Track last time we sent a ping to avoid spam
  const lastPingTime = useRef<number>(0)
  // Track if we need to send a ping (i.e. activity occurred)
  const hasActivity = useRef<boolean>(true)

  useEffect(() => {
    // Only track if logged in
    if (!currentUser?.id) return

    const sendPing = async () => {
      // Don't ping if no activity occurred since last ping
      if (!hasActivity.current) return
      
      const now = Date.now()
      // Throttle pings to exactly once per minute max
      if (now - lastPingTime.current < 60000) return
      
      try {
        lastPingTime.current = now
        hasActivity.current = false // Reset activity flag
        
        await fetch("/api/timeclock/ping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUser.id })
        })
      } catch (err) {
        console.error("Timeclock ping failed", err)
      }
    }

    // Ping on mount (first access)
    sendPing()

    // Ping loop every minute
    const interval = setInterval(sendPing, 60000)
    
    // Activity listeners
    const markActivity = () => {
      hasActivity.current = true
    }

    // Throttle the event listeners
    let throttleTimeout: NodeJS.Timeout | null = null
    const handleActivity = () => {
      if (!throttleTimeout) {
        markActivity()
        throttleTimeout = setTimeout(() => {
          throttleTimeout = null
        }, 5000) // only react to DOM events every 5s max
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
  }, [currentUser?.id, pathname])

  return null
}
