"use client"

import { toastConfirm } from '@/lib/toastConfirm'

import { useState, useEffect } from "react"
import { FiMapPin, FiNavigation, FiSave, FiToggleLeft, FiToggleRight, FiTrash2 } from "react-icons/fi"

interface GeofenceData {
  id?: string
  name: string
  address: string
  latitude: string
  longitude: string
  radiusMeters: string
  isActive: boolean
}

const emptyGeofence: GeofenceData = {
  name: "",
  address: "",
  latitude: "",
  longitude: "",
  radiusMeters: "150",
  isActive: true,
}

export default function AdminGeofencesPage() {
  const [geofence, setGeofence] = useState<GeofenceData>(emptyGeofence)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  useEffect(() => {
    fetchGeofence()
  }, [])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const fetchGeofence = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/admin/geofences")
      const data = await res.json()
      if (data.success && data.geofences?.length > 0) {
        const g = data.geofences[0]
        setGeofence({
          id: g.id,
          name: g.name || "",
          address: g.address || "",
          latitude: String(g.latitude),
          longitude: String(g.longitude),
          radiusMeters: String(g.radiusMeters),
          isActive: g.isActive,
        })
      }
    } catch (e) {
      console.error("Failed to fetch geofence:", e)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!geofence.name.trim()) {
      setToast({ message: "Location name is required.", type: "error" })
      return
    }
    if (!geofence.latitude || !geofence.longitude) {
      setToast({ message: "Latitude and longitude are required.", type: "error" })
      return
    }

    try {
      setSaving(true)
      const isUpdate = !!geofence.id
      const res = await fetch("/api/admin/geofences", {
        method: isUpdate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isUpdate && { id: geofence.id }),
          name: geofence.name,
          address: geofence.address,
          latitude: geofence.latitude,
          longitude: geofence.longitude,
          radiusMeters: geofence.radiusMeters,
          isActive: geofence.isActive,
        }),
      })
      const data = await res.json()
      if (data.success) {
        if (data.geofence?.id) {
          setGeofence((prev) => ({ ...prev, id: data.geofence.id }))
        }
        setToast({ message: isUpdate ? "Geofence updated successfully!" : "Geofence created successfully!", type: "success" })
      } else {
        setToast({ message: data.error || "Failed to save geofence.", type: "error" })
      }
    } catch (e) {
      console.error(e)
      setToast({ message: "Error saving geofence.", type: "error" })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!geofence.id) return
    toastConfirm("Delete this geofence location? Auto clock-in/out will stop working.", async () => {

    try {
      setSaving(true)
      const res = await fetch(`/api/admin/geofences?id=${geofence.id}`, { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        setGeofence(emptyGeofence)
        setToast({ message: "Geofence deleted.", type: "success" })
      } else {
        setToast({ message: data.error || "Failed to delete.", type: "error" })
      }
    } catch (e) {
      setToast({ message: "Error deleting geofence.", type: "error" })
    } finally {
      setSaving(false)
    }
  });}

  const handleUseCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setToast({ message: "Geolocation is not supported by this browser.", type: "error" })
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeofence((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }))
        setLocating(false)
        setToast({ message: `✨" Location captured (±${Math.round(pos.coords.accuracy)}m accuracy)`, type: "success" })
      },
      (err) => {
        setLocating(false)
        setToast({
          message: err.code === err.PERMISSION_DENIED
            ? "GPS permission denied. Allow location access in your browser."
            : "Unable to get current location.",
          type: "error",
        })
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  const updateField = (field: keyof GeofenceData, value: string | boolean) => {
    setGeofence((prev) => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return (
      <div className="page-content">
        <div className="page-header">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center">
              <FiMapPin className="text-emerald-500" size={17} />
            </div>
            <div>
              <h1 className="page-title">Geofence Location</h1>
              <p className="page-subtitle">Loading settings...</p>
            </div>
          </div>
        </div>
        <div className="page-body">
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-3 text-neutral-400 font-bold">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              Loading geofence settings...
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center">
            <FiMapPin className="text-emerald-500" size={17} />
          </div>
          <div>
            <h1 className="page-title">Geofence Location</h1>
            <p className="page-subtitle">Configure office location for auto clock-in</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {geofence.id && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded-lg font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <FiTrash2 size={14} />
              Delete
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <FiSave />
            )}
            {geofence.id ? "Save Changes" : "Create Geofence"}
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Description */}
          <p className="text-sm text-neutral-400 mb-6 leading-relaxed">
            Configure the office geofence for automatic clock-in and clock-out. When employees enter the
            geofence radius, they will be automatically clocked in. When they leave for an extended period,
            they will be automatically clocked out.
          </p>

          {/* Main Card */}
          <div className="glass-panel border border-white/10 rounded-xl p-6 space-y-6 shadow-xl">
            {/* Status Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                  Status
                </label>
                <p className="text-xs text-neutral-500 font-semibold">
                  {geofence.isActive ? "Geofence is active -- auto clock-in/out is enabled" : "Geofence is disabled -- manual clock only"}
                </p>
              </div>
              <button
                onClick={() => updateField("isActive", !geofence.isActive)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all border ${
                  geofence.isActive
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-neutral-800 text-neutral-500 border-neutral-700"
                }`}
              >
                {geofence.isActive ? <FiToggleRight size={20} /> : <FiToggleLeft size={20} />}
                {geofence.isActive ? "Active" : "Inactive"}
              </button>
            </div>

            <hr className="border-white/10" />

            {/* Name */}
            <div>
              <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                Location Name
              </label>
              <p className="text-xs text-neutral-500 mb-3 font-semibold">
                A friendly name for this geofence (e.g., "Titan Diamond Office").
              </p>
              <input
                type="text"
                value={geofence.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="Titan Diamond Office"
                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <hr className="border-white/10" />

            {/* Address */}
            <div>
              <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                Address
              </label>
              <p className="text-xs text-neutral-500 mb-3 font-semibold">
                Display address for reference (not used for geofencing).
              </p>
              <input
                type="text"
                value={geofence.address}
                onChange={(e) => updateField("address", e.target.value)}
                placeholder="123 Diamond Blvd, Phoenix, AZ 85001"
                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <hr className="border-white/10" />

            {/* Coordinates */}
            <div>
              <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                Coordinates
              </label>
              <p className="text-xs text-neutral-500 mb-3 font-semibold">
                GPS coordinates for the center of the geofence.
              </p>
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-neutral-500 mb-1 uppercase tracking-wide">Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={geofence.latitude}
                    onChange={(e) => updateField("latitude", e.target.value)}
                    placeholder="33.448376"
                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-neutral-500 mb-1 uppercase tracking-wide">Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={geofence.longitude}
                    onChange={(e) => updateField("longitude", e.target.value)}
                    placeholder="-112.074036"
                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>
              <button
                onClick={handleUseCurrentLocation}
                disabled={locating}
                className="mt-3 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg font-bold text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {locating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                    Locating...
                  </>
                ) : (
                  <>
                    <FiNavigation size={14} />
                    Use My Current Location
                  </>
                )}
              </button>
            </div>

            <hr className="border-white/10" />

            {/* Radius */}
            <div>
              <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                Radius (meters)
              </label>
              <p className="text-xs text-neutral-500 mb-3 font-semibold">
                Employees within <span className="text-emerald-400 font-bold">{geofence.radiusMeters || 150}m</span> of the
                coordinates will be auto-clocked in. Default is 150m (~500 ft).
              </p>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  min="50"
                  max="5000"
                  step="10"
                  value={geofence.radiusMeters}
                  onChange={(e) => updateField("radiusMeters", e.target.value)}
                  className="w-32 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <div className="flex gap-2">
                  {[100, 150, 200, 300].map((r) => (
                    <button
                      key={r}
                      onClick={() => updateField("radiusMeters", String(r))}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors border ${
                        String(r) === geofence.radiusMeters
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white hover:bg-neutral-700"
                      }`}
                    >
                      {r}m
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-6 bg-blue-950/30 border border-blue-500/20 rounded-xl p-5">
            <h3 className="text-sm font-black uppercase tracking-wider text-blue-400 mb-2">How It Works</h3>
            <ul className="text-xs text-neutral-400 space-y-1.5 font-medium leading-relaxed">
              <li>- GPS is monitored in the background when the portal is open</li>
              <li>- Employee enters geofence â†' <span className="text-emerald-400 font-bold">auto clock-in</span> after 30 seconds</li>
              <li>- Employee leaves geofence â†' <span className="text-red-400 font-bold">auto clock-out</span> after 5 minutes</li>
              <li>- Manual clock-in/out always overrides the geofence</li>
              <li>- GPS accuracy must be within 500m for geofence checks</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl border font-bold text-sm flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300 ${
            toast.type === "success"
              ? "bg-emerald-900/90 text-emerald-300 border-emerald-500/30"
              : "bg-red-900/90 text-red-300 border-red-500/30"
          }`}
        >
          {toast.type === "success" ? "✅" : "❌"} {toast.message}
        </div>
      )}
    </div>
  )
}


