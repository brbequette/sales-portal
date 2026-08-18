"use client"


import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react"

export type Notification = {
  id: string
  title: string
  body: string
  url?: string | null
  read: boolean
  createdAt: string
}

type NotificationContextType = {
  notifications: Notification[]
  unreadCount: number
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  requestPermission: () => Promise<void>
  permission: NotificationPermission
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error("useNotifications must be used within NotificationProvider")
  return context
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [permission, setPermission] = useState<NotificationPermission>("default")
  const lastFetchAt = useRef(0)

  const fetchNotifications = useCallback(async (force = false) => {
    if (!force && (document.hidden || Date.now() - lastFetchAt.current < 120000)) return
    try {
      const res = await fetch("/api/notifications")
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount)
        lastFetchAt.current = Date.now()
      }
    } catch (e) {
      console.error("Failed to fetch notifications", e)
    }
  }, [])

  useEffect(() => {
    if ("Notification" in window) {
      queueMicrotask(() => setPermission(Notification.permission))
    }
    
    // Register service worker if supported
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
        .then(() => console.log("Service Worker registered successfully."))
        .catch((error) => console.error("Service Worker registration failed:", error))
    }
    
    queueMicrotask(() => void fetchNotifications(true))
    const interval = window.setInterval(() => void fetchNotifications(), 120000)
    const refreshWhenVisible = () => {
      if (!document.hidden) void fetchNotifications()
    }
    document.addEventListener("visibilitychange", refreshWhenVisible)
    window.addEventListener("focus", refreshWhenVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
      window.removeEventListener("focus", refreshWhenVisible)
    }
  }, [fetchNotifications])

  const markAsRead = async (id: string) => {
    try {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
      await fetch("/api/notifications/read", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id })
      })
    } catch (e) {
      console.error("Failed to mark as read", e)
    }
  }

  const markAllAsRead = async () => {
    try {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
      await fetch("/api/notifications/read", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true })
      })
    } catch (e) {
      console.error("Failed to mark all as read", e)
    }
  }

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  const requestPermission = async () => {
    if (!("Notification" in window)) return

    const perm = await Notification.requestPermission()
    setPermission(perm)

    if (perm === "granted" && "serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready
        const applicationServerKey = urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "")
        
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        })

        await fetch("/api/notifications/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription })
        })
        
        console.log("Push subscription successful.")
      } catch (e) {
        console.error("Failed to subscribe to push notifications", e)
      }
    }
  }

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, requestPermission, permission }}>
      {children}
    </NotificationContext.Provider>
  )
}
