"use client"

import { useEffect, useRef, useState } from "react"
import { FiMapPin, FiNavigation, FiInfo, FiCompass, FiMaximize2 } from "react-icons/fi"

interface GeofenceMapProps {
  lat: number
  lng: number
  radiusMeters: number
  name: string
  address: string
  isActive: boolean
  onLocationSelect?: (lat: number, lng: number) => void
}

export default function GeofenceMap({
  lat,
  lng,
  radiusMeters,
  name,
  address,
  isActive,
  onLocationSelect,
}: GeofenceMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const circleRef = useRef<any>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [leafletError, setLeafletError] = useState(false)

  // 1. Dynamically load Leaflet CSS & JS
  useEffect(() => {
    if (typeof window === "undefined") return

    // Check if Leaflet is already loaded
    if ((window as any).L) {
      setMapLoaded(true)
      return
    }

    const cssLink = document.createElement("link")
    cssLink.rel = "stylesheet"
    cssLink.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    document.head.appendChild(cssLink)

    const script = document.createElement("script")
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    script.async = true
    script.onload = () => setMapLoaded(true)
    script.onerror = () => setLeafletError(true)
    document.head.appendChild(script)
  }, [])

  // 2. Initialize Leaflet Map
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const L = (window as any).L
    if (!L) return

    if (!leafletMap.current) {
      const validLat = isNaN(lat) || lat === 0 ? 33.616222 : lat
      const validLng = isNaN(lng) || lng === 0 ? -111.901662 : lng

      const map = L.map(mapRef.current, {
        center: [validLat, validLng],
        zoom: 15,
        zoomControl: false,
      })

      L.control.zoom({ position: "bottomright" }).addTo(map)

      // Dark Mode Tile Layer (CartoDB Dark Matter)
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map)

      // Custom Glowing Office Pin Marker
      const customIcon = L.divIcon({
        className: "custom-geofence-pin",
        html: `
          <div class="relative flex items-center justify-center w-8 h-8">
            <div class="absolute w-8 h-8 rounded-full bg-emerald-500/30 animate-ping"></div>
            <div class="relative w-7 h-7 rounded-full bg-emerald-500 border-2 border-white shadow-lg flex items-center justify-center text-black font-bold">
              📍
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      })

      const marker = L.marker([validLat, validLng], { icon: customIcon, draggable: true }).addTo(map)

      // Proximity Boundary Circle
      const circle = L.circle([validLat, validLng], {
        color: isActive ? "#10b981" : "#6b7280",
        fillColor: isActive ? "#10b981" : "#6b7280",
        fillOpacity: 0.18,
        weight: 2,
        dashArray: isActive ? undefined : "6, 6",
      }).addTo(map)

      marker.on("dragend", (e: any) => {
        const position = e.target.getLatLng()
        if (onLocationSelect) {
          onLocationSelect(position.lat, position.lng)
        }
      })

      map.on("click", (e: any) => {
        if (onLocationSelect) {
          onLocationSelect(e.latlng.lat, e.latlng.lng)
        }
      })

      leafletMap.current = map
      markerRef.current = marker
      circleRef.current = circle
    }
  }, [mapLoaded, isActive, onLocationSelect])

  // 3. Update Marker, Circle, and Zoom when props change
  useEffect(() => {
    if (!leafletMap.current || typeof window === "undefined") return
    const L = (window as any).L
    if (!L) return

    const validLat = isNaN(lat) || lat === 0 ? 33.616222 : lat
    const validLng = isNaN(lng) || lng === 0 ? -111.901662 : lng
    const validRadius = isNaN(radiusMeters) || radiusMeters <= 0 ? 150 : radiusMeters

    if (markerRef.current) {
      markerRef.current.setLatLng([validLat, validLng])
    }

    if (circleRef.current) {
      circleRef.current.setLatLng([validLat, validLng])
      circleRef.current.setRadius(validRadius)
      circleRef.current.setStyle({
        color: isActive ? "#10b981" : "#6b7280",
        fillColor: isActive ? "#10b981" : "#6b7280",
      })
    }

    // Adjust Map view bounds to fit the geofence circle
    try {
      if (circleRef.current) {
        const bounds = circleRef.current.getBounds()
        leafletMap.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 })
      } else {
        leafletMap.current.setView([validLat, validLng])
      }
    } catch {
      leafletMap.current.setView([validLat, validLng], 15)
    }
  }, [lat, lng, radiusMeters, isActive])

  return (
    <div className="relative w-full h-full min-h-[480px] rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col bg-neutral-950">
      {/* Map Header Controls overlay */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="bg-black/80 backdrop-blur-md border border-white/15 rounded-xl px-4 py-2 flex items-center gap-3 shadow-xl pointer-events-auto">
          <div className={`w-3 h-3 rounded-full ${isActive ? "bg-emerald-400 animate-pulse" : "bg-neutral-500"}`} />
          <div>
            <div className="font-extrabold text-white text-xs flex items-center gap-1.5">
              <span>{name || "Geofence Center"}</span>
              <span className="text-[10px] text-neutral-400 font-mono">
                ({lat ? lat.toFixed(5) : "0"}, {lng ? lng.toFixed(5) : "0"})
              </span>
            </div>
            <div className="text-[10px] text-neutral-400 truncate max-w-xs">{address || "No address specified"}</div>
          </div>
        </div>

        <div className="bg-emerald-950/90 backdrop-blur-md border border-emerald-500/40 rounded-xl px-3.5 py-2 text-emerald-300 text-xs font-black font-mono shadow-xl flex items-center gap-2 pointer-events-auto">
          <FiCompass className="text-emerald-400" />
          <span>Boundary Radius: {radiusMeters}m</span>
        </div>
      </div>

      {/* Map Canvas / Fallback */}
      {!mapLoaded && !leafletError && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-neutral-400 gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold">Initializing Interactive Geofence Map...</p>
        </div>
      )}

      {leafletError && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-rose-400 gap-2 text-center">
          <FiInfo size={24} />
          <p className="text-xs font-bold">Failed to load map tiles. Please check internet connection.</p>
        </div>
      )}

      <div ref={mapRef} className="w-full h-full flex-1 z-10" />

      {/* Map Footer Legend & Instructions */}
      <div className="p-3 bg-neutral-900/90 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs z-20">
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white" /> Office Pin
          </span>
          <span className="flex items-center gap-1.5 text-emerald-300 font-bold">
            <span className="w-3 h-3 rounded-full border border-emerald-500 bg-emerald-500/20" /> Proximity Boundary ({radiusMeters}m)
          </span>
        </div>
        <span className="text-[10px] text-neutral-400 italic">
          💡 Click anywhere on the map or drag the pin to adjust geofence center
        </span>
      </div>
    </div>
  )
}
