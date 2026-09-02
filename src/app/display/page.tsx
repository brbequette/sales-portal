"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FiMaximize, FiMonitor, FiWifi, FiWifiOff } from "react-icons/fi"
import { DUAL_SCREEN_CHANNEL, type DualScreenMessage, type DualScreenState, isDualScreenMessage } from "@/lib/dual-screen"

function expandedUrl(controllerPath: string) {
  // Only the path/query are returned, so a stable parsing base keeps this safe
  // during Next.js server pre-render as well as in the browser.
  const url = new URL(controllerPath || "/dashboard", "http://titan.local")
  // Never allow a second-display page to embed another second-display page.
  // This can happen when a stale controller announces its own display URL.
  if (url.pathname === "/display" || url.pathname.startsWith("/display/")) {
    return "/dashboard?display=1"
  }
  url.searchParams.delete("controller")
  url.searchParams.set("display", "1")
  url.searchParams.sort()
  return `${url.pathname}${url.search}`
}

export default function SecondDisplayPage() {
  const sourceId = useRef("")
  const targetControllerId = useRef("")
  const sequence = useRef(0)
  const channel = useRef<BroadcastChannel | null>(null)
  const seen = useRef(new Set<string>())
  const controllerSourceId = useRef("")
  const lastControllerSequence = useRef(0)
  const lastControllerAt = useRef(0)
  const [state, setState] = useState<DualScreenState>(() => ({ view: "dashboard", title: "Titan Diamond Display", controllerPath: "/dashboard", updatedAt: new Date().toISOString() }))
  const [frameUrl, setFrameUrl] = useState("/dashboard?display=1")
  const [connected, setConnected] = useState(false)

  const post = useCallback((type: DualScreenMessage["type"], extra: Partial<DualScreenMessage> = {}) => {
    if (!channel.current) return
    const message: DualScreenMessage = { id: crypto.randomUUID(), sourceId: sourceId.current, sequence: ++sequence.current, sentAt: new Date().toISOString(), type, displayId: sourceId.current, controllerId: targetControllerId.current || undefined, ...extra }
    seen.current.add(message.id)
    channel.current.postMessage(message)
  }, [])

  useEffect(() => {
    sourceId.current = crypto.randomUUID()
    targetControllerId.current = new URLSearchParams(window.location.search).get("controller") || ""
    if (!("BroadcastChannel" in window)) return
    const bc = new BroadcastChannel(DUAL_SCREEN_CHANNEL)
    channel.current = bc
    bc.onmessage = event => {
      const message = event.data
      if (!isDualScreenMessage(message) || message.sourceId === sourceId.current || seen.current.has(message.id)) return
      if (targetControllerId.current && message.sourceId !== targetControllerId.current) return
      if (!targetControllerId.current && (message.type === "CONTROLLER_STATE" || message.type === "CONTROLLER_PING")) targetControllerId.current = message.sourceId
      seen.current.add(message.id)
      if (seen.current.size > 500) seen.current.clear()
      const newController = controllerSourceId.current !== message.sourceId
      if (message.type === "CONTROLLER_STATE" && message.state && (newController || message.sequence > lastControllerSequence.current)) {
        controllerSourceId.current = message.sourceId
        lastControllerSequence.current = message.sequence
        setState(message.state)
        setConnected(true)
        lastControllerAt.current = Date.now()
        post("DISPLAY_ACK", { acknowledgedId: message.id })
      }
      if (message.type === "CONTROLLER_PING") {
        setConnected(true)
        lastControllerAt.current = Date.now()
      }
    }
    post("DISPLAY_READY")
    const heartbeat = window.setInterval(() => {
      post("DISPLAY_HEARTBEAT")
      if (lastControllerAt.current && Date.now() - lastControllerAt.current > 6500) setConnected(false)
    }, 2000)
    const closing = () => post("DISPLAY_CLOSING")
    window.addEventListener("beforeunload", closing)
    return () => {
      window.clearInterval(heartbeat)
      window.removeEventListener("beforeunload", closing)
      post("DISPLAY_CLOSING")
      bc.close()
      channel.current = null
    }
  }, [post])

  const requestedFrameUrl = useMemo(() => expandedUrl(state.controllerPath), [state.controllerPath])

  useEffect(() => {
    // Broadcast heartbeats and repeated controller snapshots must not reload the
    // embedded application. Only a genuinely different canonical URL navigates.
    setFrameUrl(current => current === requestedFrameUrl ? current : requestedFrameUrl)
  }, [requestedFrameUrl])
  const fullscreen = async () => { try { await document.documentElement.requestFullscreen() } catch { /* Requires a user gesture in some browsers. */ } }

  return <main className="relative h-dvh overflow-hidden bg-[#05070a] text-white">
    <div className="absolute right-4 top-4 z-[100] flex items-center gap-2"><div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider backdrop-blur-xl ${connected ? "border-emerald-500/30 bg-emerald-950/80 text-emerald-300" : "border-amber-500/30 bg-amber-950/80 text-amber-300"}`}>{connected ? <FiWifi/> : <FiWifiOff/>}{connected ? "Controller connected" : "Reconnecting"}</div><button onClick={fullscreen} className="rounded-full border border-white/15 bg-black/70 p-2.5 text-white backdrop-blur-xl" title="Enter full screen"><FiMaximize/></button></div>
    <iframe src={frameUrl} title={`Expanded ${state.title}`} className="h-full w-full border-0 bg-[#05070a]" />
    {!connected && <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-white/10 bg-black/80 px-4 py-2 text-xs text-neutral-400 backdrop-blur-xl"><FiMonitor/>Expanded workspace remains available while it reconnects.</div>}
  </main>
}
