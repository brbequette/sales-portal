"use client"

import { createPortal } from "react-dom"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import toast from "react-hot-toast"
import { FiCheckCircle, FiExternalLink, FiMonitor, FiRadio, FiX } from "react-icons/fi"
import { DUAL_SCREEN_CHANNEL, type DualScreenMessage, type DualScreenState, isDualScreenMessage } from "@/lib/dual-screen"

function id() { return crypto.randomUUID() }

export function DualScreenController() {
  const pathname = usePathname() || "/dashboard"
  const sourceId = useRef("")
  const sequence = useRef(0)
  const channel = useRef<BroadcastChannel | null>(null)
  const displayWindow = useRef<Window | null>(null)
  const seen = useRef(new Set<string>())
  const knownDisplays = useRef(new Set<string>())
  const currentPath = useRef("/dashboard")
  const lastHeartbeat = useRef(0)
  const [panelOpen, setPanelOpen] = useState(false)
  const [connected, setConnected] = useState(false)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [directLink, setDirectLink] = useState("/display")
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("titan:dual-screen-status", { detail: { connected } }))
    sessionStorage.setItem("titan-dual-screen-connected", connected ? "1" : "0")
  }, [connected])

  const post = useCallback((type: DualScreenMessage["type"], extra: Partial<DualScreenMessage> = {}) => {
    if (!channel.current || !sourceId.current) return
    const message: DualScreenMessage = { id: id(), sourceId: sourceId.current, sequence: ++sequence.current, sentAt: new Date().toISOString(), type, ...extra }
    seen.current.add(message.id)
    channel.current.postMessage(message)
  }, [])

  useEffect(() => { currentPath.current = `${window.location.pathname}${window.location.search}` }, [pathname])

  const sendState = useCallback(() => {
    const state: DualScreenState = { view: "dashboard", title: document.title || "Titan Diamond", controllerPath: currentPath.current, updatedAt: new Date().toISOString() }
    post("CONTROLLER_STATE", { state })
  }, [post])

  useEffect(() => {
    const storedControllerId = sessionStorage.getItem("titan-dual-screen-controller-id")
    sourceId.current = storedControllerId || id()
    if (!storedControllerId) sessionStorage.setItem("titan-dual-screen-controller-id", sourceId.current)
    if (!("BroadcastChannel" in window)) return
    const bc = new BroadcastChannel(DUAL_SCREEN_CHANNEL)
    channel.current = bc
    bc.onmessage = event => {
      if (!isDualScreenMessage(event.data) || event.data.sourceId === sourceId.current || seen.current.has(event.data.id)) return
      if (event.data.controllerId && event.data.controllerId !== sourceId.current) return
      seen.current.add(event.data.id)
      if (seen.current.size > 500) seen.current.clear()
      if (event.data.type === "DISPLAY_READY" || event.data.type === "DISPLAY_HEARTBEAT") {
        setConnected(true); lastHeartbeat.current = Date.now()
        const displayId = event.data.displayId || event.data.sourceId
        if (!knownDisplays.current.has(displayId)) { knownDisplays.current.add(displayId); sendState() }
      }
      if (event.data.type === "DISPLAY_CLOSING") { setConnected(false); knownDisplays.current.delete(event.data.displayId || event.data.sourceId) }
    }
    return () => { bc.close(); channel.current = null }
  }, [sendState])

  useEffect(() => {
    if (!mounted) return
    const timer = window.setInterval(() => {
      const livePath = `${window.location.pathname}${window.location.search}`
      if (livePath !== currentPath.current) {
        currentPath.current = livePath
        sendState()
      }
      post("CONTROLLER_PING")
      if (displayWindow.current?.closed) { displayWindow.current = null; setConnected(false) }
      if (lastHeartbeat.current && Date.now() - lastHeartbeat.current > 6500) setConnected(false)
    }, 2000)
    return () => window.clearInterval(timer)
  }, [mounted, post, sendState])

  useEffect(() => { if (connected) sendState() }, [connected, pathname, sendState])

  const launch = () => {
    if (!("BroadcastChannel" in window)) { toast.error("This browser does not support same-computer display synchronization."); return }
    const displayUrl = `/display?controller=${encodeURIComponent(sourceId.current)}`
    setDirectLink(displayUrl)
    const opened = window.open(displayUrl, "titan-diamond-second-display", "popup=yes,width=1600,height=900,resizable=yes,scrollbars=no")
    if (!opened) { setPopupBlocked(true); setPanelOpen(true); toast.error("The second display was blocked. Allow pop-ups, then use the direct display link."); return }
    displayWindow.current = opened; setPopupBlocked(false); setPanelOpen(true); opened.focus()
    window.setTimeout(() => sendState(), 350)
  }

  const openPanel = () => {
    setDirectLink(`/display?controller=${encodeURIComponent(sourceId.current)}`)
    setPanelOpen(true)
  }

  return <>
    <button onClick={launch} className="hidden xl:flex items-center gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-500/20" title="Open a synchronized full-screen display"><FiMonitor/>Launch Second Display</button>
    <button onClick={openPanel} className="flex xl:hidden items-center justify-center rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-2 text-cyan-200" aria-label="Second display controls"><FiMonitor/></button>
    {mounted && panelOpen && createPortal(<div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/70 p-4" onClick={() => setPanelOpen(false)}><section className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0b0e13] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="flex items-start justify-between"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-cyan-400"><FiRadio/>Dual-screen controller</div><h2 className="mt-1 text-xl font-black text-white">Second display</h2><p className="mt-1 text-sm text-neutral-500">Changes here appear on the second window in real time.</p></div><button onClick={() => setPanelOpen(false)} className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white"><FiX/></button></div>
      <div className={`mt-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${connected ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-300"}`}>{connected ? <FiCheckCircle/> : <FiRadio/>}{connected ? "Second display connected" : "Waiting for second display"}</div>
      <div className="mt-4 rounded-xl border border-cyan-400/25 bg-cyan-500/10 p-4"><div className="font-bold text-white">Current workspace follows automatically</div><div className="mt-1 text-xs leading-5 text-neutral-400">The second display shows the same page and information without the normal navigation shell, using the full screen for a wider, expanded workspace.</div><div className="mt-3 truncate rounded-lg bg-black/30 px-3 py-2 font-mono text-[11px] text-cyan-200">{pathname}</div></div>
      {popupBlocked && <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100"><b>Pop-up blocked.</b> Allow pop-ups for this site, or open the display directly using the link below.</div>}
      <div className="mt-4 flex gap-2"><button onClick={launch} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black text-white hover:bg-cyan-500"><FiMonitor/>{connected ? "Reopen display" : "Launch Second Display"}</button><a href={directLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white"><FiExternalLink/>Direct link</a></div>
    </section></div>, document.body)}
  </>
}
