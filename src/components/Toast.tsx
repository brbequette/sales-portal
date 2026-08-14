"use client"


import { useEffect, useState, useCallback, createContext, useContext } from "react"
import { FiCheckCircle, FiAlertCircle, FiInfo, FiAlertTriangle, FiX } from "react-icons/fi"

type ToastType = "success" | "error" | "info" | "warning"

interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

interface ToastContextValue {
  addToast: (message: string, type?: ToastType, duration?: number) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within a ToastProvider")
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = "info", duration = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    setToasts(prev => [...prev, { id, message, type, duration }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-toast flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const iconMap = {
  success: FiCheckCircle,
  error: FiAlertCircle,
  info: FiInfo,
  warning: FiAlertTriangle,
}

const styleMap = {
  success: "bg-emerald-900/80 border-emerald-500/40 text-emerald-300",
  error: "bg-red-900/80 border-red-500/40 text-red-300",
  info: "bg-blue-900/80 border-blue-500/40 text-blue-300",
  warning: "bg-amber-900/80 border-amber-500/40 text-amber-300",
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 300)
    }, toast.duration || 4000)
    return () => clearTimeout(timer)
  }, [toast.duration, onDismiss])

  const Icon = iconMap[toast.type]

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-semibold shadow-2xl backdrop-blur-sm transition-all duration-300 ${styleMap[toast.type]} ${
        visible ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"
      }`}
    >
      <Icon className="shrink-0" size={16} />
      <span className="flex-1">{toast.message}</span>
      <button onClick={onDismiss} className="shrink-0 p-0.5 hover:opacity-70 transition-opacity">
        <FiX size={14} />
      </button>
    </div>
  )
}

