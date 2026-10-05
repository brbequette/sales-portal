"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import toast, { Toaster, ToastBar } from "react-hot-toast"

export function ClientToaster() {
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null)
  useEffect(() => {
    const update = () => setViewport({ top: window.visualViewport?.offsetTop || 0, height: window.visualViewport?.height || window.innerHeight })
    update()
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => { window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [])
  if (!viewport) return null
  return createPortal(<Toaster position="top-center" containerStyle={{ zIndex: 'var(--z-toast)', top: `calc(${viewport.top + 12}px + env(safe-area-inset-top))`, left: 'max(12px, env(safe-area-inset-left))', right: 'max(12px, env(safe-area-inset-right))', bottom: 'auto', height: Math.max(100, viewport.height - 24), overflowY: 'auto' }} toastOptions={{ duration: 5000, error: { duration: 10000 }, style: { maxWidth: 'min(560px, 100%)', overflowWrap: 'anywhere', background: '#151e2b', color: '#fff', border: '1px solid #ffffff35' } }}>
    {item => <ToastBar toast={item}>{({ icon, message }) => <>{icon}<div className="min-w-0 flex-1 max-h-[40dvh] overflow-y-auto">{message}</div>{item.type !== 'loading' && <button type="button" aria-label="Dismiss notification" onClick={() => toast.dismiss(item.id)} className="shrink-0 rounded-lg p-2 hover:bg-white/10">×</button>}</>}</ToastBar>}
  </Toaster>, document.body)
}
