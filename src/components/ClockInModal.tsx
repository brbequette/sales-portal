"use client"

import { useState, useEffect } from "react"
import { useZoho } from "./ZohoProvider"
import { FiClock, FiCheck } from "react-icons/fi"
import { toast } from 'react-hot-toast'

export function ClockInModal() {
  const { zohoContext: currentUser } = useZoho()
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [clockingIn, setClockingIn] = useState(false)

  useEffect(() => {
    if (!currentUser?.id) return

    const checkStatus = async () => {
      try {
        // We use the sync endpoint to see if they're active.
        // Wait, sync auto-creates a background session but we want to see if they MANUALLY clocked in?
        // Let's use get-entries for today to see if manualClockIn is set.
        const res = await fetch(`/api/timeclock/get-entries?userId=${currentUser.id}&email=${encodeURIComponent(currentUser.email || '')}`)
        const data = await res.json()
        if (data.success && data.entries.length > 0) {
          const todayEntry = data.entries[0] // entries are sorted desc, first is today
          
          const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Phoenix',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          })
          const parts = formatter.formatToParts(new Date())
          const ye = parts.find(p => p.type === 'year')?.value
          const mo = parts.find(p => p.type === 'month')?.value
          const da = parts.find(p => p.type === 'day')?.value
          const phoenixDate = `${ye}-${mo}-${da}`

          if (todayEntry.date === phoenixDate && !todayEntry.manualClockIn) {
            setShowModal(true)
          } else if (todayEntry.date !== phoenixDate) {
            setShowModal(true)
          }
        } else {
          setShowModal(true)
        }
      } catch (e) {
        console.error("Failed to check clock status", e)
      } finally {
        setLoading(false)
      }
    }

    checkStatus()
  }, [currentUser])

  const handleClockIn = async () => {
    setClockingIn(true)
    try {
      // Use the toggle endpoint to manually clock in
      // Try to get geolocation
      let lat = null
      let lng = null
      let acc = null
      
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
        })
        lat = pos.coords.latitude
        lng = pos.coords.longitude
        acc = pos.coords.accuracy
      } catch (e) {
        // Proceed without GPS if denied or timeout
      }

      const res = await fetch("/api/timeclock/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser?.id,
          email: currentUser?.email,
          name: currentUser?.name || currentUser?.fullName || "Zoho User",
          action: "clockIn",
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          source: "manual"
        })
      })

      const data = await res.json()
      if (data.success) {
        toast.success("Clocked in successfully!")
        setShowModal(false)
      } else if (data.skipped) {
        toast.success(data.reason || "Already clocked in.")
        setShowModal(false)
      } else {
        toast.error(data.error || "Failed to clock in")
      }
    } catch (e) {
      toast.error("An error occurred")
    } finally {
      setClockingIn(false)
    }
  }

  if (loading || !showModal) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-sm rounded-2xl border border-white/10 p-6 flex flex-col items-center text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-sky-500"></div>
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
          <FiClock size={32} />
        </div>
        <h2 className="text-xl font-black text-white mb-2 uppercase tracking-widest">Time to Clock In</h2>
        <p className="text-sm text-neutral-400 mb-6">
          Welcome back, {currentUser?.name?.split(' ')[0] || "User"}. Please clock in to start your shift and track your time properly.
        </p>
        <button
          onClick={handleClockIn}
          disabled={clockingIn}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          {clockingIn ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <FiCheck size={18} />
          )}
          CLOCK IN NOW
        </button>
      </div>
    </div>
  )
}
