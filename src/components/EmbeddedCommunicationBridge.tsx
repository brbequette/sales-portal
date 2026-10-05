"use client"
import { useEffect } from 'react'

// Embedded workspaces use the host window's single phone/AI/messages panel.
export function EmbeddedCommunicationBridge() {
  useEffect(() => {
    if (window.parent === window) return
    const names = ['inAppDial', 'openTitanAi', 'titan:open-messages']
    const relay = (event: Event) => {
      try {
        if (window.parent.location.origin !== window.location.origin) return
        window.parent.dispatchEvent(new CustomEvent(event.type, { detail: (event as CustomEvent).detail }))
      } catch { /* A cross-origin parent never receives customer context. */ }
    }
    names.forEach(name => window.addEventListener(name, relay))
    return () => names.forEach(name => window.removeEventListener(name, relay))
  }, [])
  return null
}
