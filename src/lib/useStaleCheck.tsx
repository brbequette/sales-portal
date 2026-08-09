"use client"

import { useEffect, useRef, useState } from "react"
import { FiRefreshCw } from "react-icons/fi"

/**
 * useStaleCheck — stale-while-revalidate update detection hook.
 *
 * After `delayMs` (default 2s), fires a single lightweight `?checkOnly=true`
 * request. If the response signature (count|latestUpdatedAt) differs from
 * the stored signature, `onUpdateAvailable` fires and `updateAvailable` becomes true.
 *
 * Usage:
 *   const { updateAvailable, dismissUpdate } = useStaleCheck({
 *     url: "/api/get-collections",
 *     sig: `${invoices.length}|${invoices[0]?.updatedAt}`,
 *     onUpdateAvailable: () => setUpdateAvailable(true),
 *   })
 */
export function useStaleCheck({
  url,
  sig,
  enabled = true,
  delayMs = 2000,
}: {
  url: string
  sig: string | null | undefined
  enabled?: boolean
  delayMs?: number
}) {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const lastSigRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !sig) return
    // Store first sig — nothing to compare against on first load
    if (!lastSigRef.current) {
      lastSigRef.current = sig
      return
    }
    setUpdateAvailable(false)
    const timer = setTimeout(async () => {
      try {
        const separator = url.includes("?") ? "&" : "?"
        const res = await fetch(`${url}${separator}checkOnly=true`)
        const data = await res.json()
        if (!data.checkOnly) return
        const remoteSig = `${data.count}|${data.latestUpdatedAt ?? ""}`
        if (remoteSig !== lastSigRef.current) {
          setUpdateAvailable(true)
        }
      } catch { /* silent */ }
    }, delayMs)
    return () => clearTimeout(timer)
  }, [sig, enabled, url, delayMs])

  const dismissUpdate = () => setUpdateAvailable(false)
  const markFresh = (newSig: string) => {
    lastSigRef.current = newSig
    setUpdateAvailable(false)
  }

  return { updateAvailable, dismissUpdate, markFresh }
}

/**
 * UpdateBanner — drop-in pulsing banner shown when stale data is detected.
 *
 * Usage:
 *   <UpdateBanner show={updateAvailable} onUpdate={() => { dismissUpdate(); reload(true) }} />
 */
export function UpdateBanner({
  show,
  onUpdate,
  onDismiss,
  label = "New data available",
  accentColor = "emerald",
  autoDismissMs = 8000,
}: {
  show: boolean
  onUpdate: () => void
  onDismiss?: () => void
  label?: string
  accentColor?: "emerald" | "sky" | "indigo" | "orange" | "violet" | "red" | "amber"
  autoDismissMs?: number
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (show) {
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
        onDismiss?.()
      }, autoDismissMs)
      return () => clearTimeout(timer)
    } else {
      setVisible(false)
    }
  }, [show, autoDismissMs])

  if (!visible) return null

  const colors: Record<string, string> = {
    emerald: "bg-emerald-950/50 border-emerald-500/30 text-emerald-300",
    sky:     "bg-sky-950/50 border-sky-500/30 text-sky-300",
    indigo:  "bg-indigo-950/50 border-indigo-500/30 text-indigo-300",
    orange:  "bg-orange-950/50 border-orange-500/30 text-orange-300",
    violet:  "bg-violet-950/50 border-violet-500/30 text-violet-300",
    red:     "bg-red-950/50 border-red-500/30 text-red-300",
    amber:   "bg-amber-950/50 border-amber-500/30 text-amber-300",
  }

  const dotColor: Record<string, string> = {
    emerald: "#34d399", sky: "#38bdf8", indigo: "#818cf8",
    orange: "#fb923c", violet: "#a78bfa", red: "#f87171", amber: "#fbbf24",
  }
  const btnColor: Record<string, string> = {
    emerald: "#059669", sky: "#0284c7", indigo: "#4f46e5",
    orange: "#ea580c", violet: "#7c3aed", red: "#dc2626", amber: "#d97706",
  }

  const handleDismiss = () => {
    setVisible(false)
    onDismiss?.()
  }

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2 border rounded-xl mb-2 ${colors[accentColor] || colors.emerald}`}>
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full animate-pulse flex-shrink-0"
          style={{ backgroundColor: dotColor[accentColor] }}
        />
        <span className="text-xs font-bold">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onUpdate}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-white rounded-lg transition-colors"
          style={{ backgroundColor: btnColor[accentColor] }}
        >
          <FiRefreshCw size={11} /> Update Now
        </button>
        <button
          onClick={handleDismiss}
          className="p-1 text-current opacity-50 hover:opacity-100 transition-opacity rounded cursor-pointer"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}
