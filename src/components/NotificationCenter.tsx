"use client"


import { createPortal } from "react-dom"
import { useState, useRef, useEffect } from "react"
import { FiBell, FiCheck, FiCheckCircle, FiTrash2 } from "react-icons/fi"
import { useRouter } from "next/navigation"
import { useNotifications } from "@/components/NotificationProvider"

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return "just now"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export function NotificationCenter() {
  const router = useRouter()
  const { notifications, unreadCount, markAsRead, markAllAsRead, requestPermission, permission } = useNotifications()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 64, right: 12, maxHeight: 480 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const update = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      const height = window.visualViewport?.height || window.innerHeight
      const offset = window.visualViewport?.offsetTop || 0
      const top = Math.max(offset + 8, Math.min(rect ? rect.bottom + 8 : offset + 64, offset + Math.max(8, height - 240)))
      const width = Math.min(320, window.innerWidth - 16)
      const right = Math.max(8, Math.min(window.innerWidth - width - 8, rect ? window.innerWidth - rect.right : 12))
      setPosition({ top, right, maxHeight: Math.max(100, offset + height - top - 12) })
    }
    update()
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); window.visualViewport?.removeEventListener('resize', update) }
  }, [open])

  // Click outside closes dropdown
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Button */}
      <button
        aria-label="Open notifications" aria-expanded={open}
        onClick={() => {
          if (permission === "default") requestPermission()
          setOpen(!open)
        }}
        className="relative bg-white/[0.045] hover:bg-white/[0.075] text-neutral-300 hover:text-white font-bold p-2 lg:px-3 lg:py-2 rounded-lg text-xs lg:text-sm transition-all flex items-center justify-center border border-white/10"
      >
        <FiBell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] flex items-center justify-center rounded-full font-bold shadow-sm">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && createPortal(
        <div ref={panelRef} role="dialog" aria-label="Notifications" style={{ ...position, zIndex: 'var(--z-notification)' }} className="fixed w-80 max-w-[calc(100vw-1rem)] glass-panel border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 glass-panel/80">
            <h3 className="text-sm font-bold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-bold transition-colors"
              >
                <FiCheckCircle size={12} />
                Mark all read
              </button>
            )}
          </div>

          <button onClick={() => setOpen(false)} className="self-end px-4 py-2 text-xs text-neutral-300" aria-label="Close notifications">Close</button>
          {/* Notification List */}
          <div className="overflow-y-auto flex-1 max-h-96">
            {notifications.length === 0 ? (
              <div className="py-12 px-6 text-center">
                <FiBell size={28} className="mx-auto mb-3 text-neutral-600" />
                <p className="text-sm text-neutral-500 font-medium">No notifications</p>
                <p className="text-xs text-neutral-600 mt-1">You&apos;re all caught up!</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-800/50">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`relative px-4 py-3 cursor-pointer transition-colors group ${
                      n.read
                        ? "bg-transparent hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/30"
                        : "bg-emerald-500/5 hover:bg-emerald-500/10 border-l-2 border-emerald-500"
                    }`}
                    onClick={() => {
                      if (!n.read) markAsRead(n.id)
                      if (n.url) router.push(n.url)
                      setOpen(false)
                    }}
                  >
                    <div className="flex justify-between items-start gap-2 mb-0.5">
                      <span className={`text-sm font-bold truncate ${n.read ? "text-neutral-400" : "text-white"}`}>
                        {n.title}
                      </span>
                      <span className="text-[10px] text-neutral-500 shrink-0 mt-0.5 whitespace-nowrap">
                        {relativeTime(n.createdAt)}
                      </span>
                    </div>
                    <p className={`text-xs line-clamp-2 ${n.read ? "text-neutral-500" : "text-neutral-300"}`}>
                      {n.body}
                    </p>
                    {/* Mark read indicator for unread items */}
                    {!n.read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          markAsRead(n.id)
                        }}
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-emerald-400 transition-all"
                        title="Mark as read"
                      >
                        <FiCheck size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>, document.body
      )}
    </div>
  )
}

