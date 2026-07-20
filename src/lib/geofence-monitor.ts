/**
 * Geofence Monitor — Singleton that watches GPS and auto-triggers clock-in/out.
 *
 * Flow:
 *  1. App mounts → GeofenceMonitor.start(userId, email, name)
 *  2. watchPosition fires every ~10s with device GPS
 *  3. Position checked against active geofences (Haversine)
 *  4. ENTER fence for 30s → auto clock-in
 *  5. EXIT all fences for 5min → auto clock-out
 *  6. Duplicate prevention via localStorage state
 */

import { haversineDistance, type GeoPosition, type GeofenceLocation } from './geolocation'

// ── Thresholds ──
const ENTER_DWELL_MS  = 30_000   // 30s inside fence before clock-in
const EXIT_DWELL_MS   = 300_000  // 5min outside all fences before clock-out
const GEOFENCE_POLL_MS = 600_000 // Re-fetch geofences every 10min
const STORAGE_KEY = 'geofence_monitor_state'

export type MonitorStatus = 'idle' | 'monitoring' | 'denied' | 'unavailable'
export type ClockSource = 'geofence' | 'manual'

interface MonitorState {
  /** Currently inside a fence? */
  insideFence: boolean
  /** Which fence we're inside (null if none) */
  currentFenceId: string | null
  currentFenceName: string | null
  /** When we first entered the fence (ISO string) */
  enterTime: string | null
  /** When we first exited all fences (ISO string) */
  exitTime: string | null
  /** Already clocked in today via geofence? */
  clockedInToday: string | null   // date string YYYY-MM-DD
  /** Already clocked out today via geofence? */
  clockedOutToday: string | null  // date string YYYY-MM-DD
}

type EventCallback = (event: {
  action: 'clockIn' | 'clockOut'
  source: 'geofence'
  fenceName: string | null
  fenceId: string | null
  position: GeoPosition
  entry?: any
}) => void

class GeofenceMonitorClass {
  private watchId: number | null = null
  private geofences: GeofenceLocation[] = []
  private geofencePollTimer: ReturnType<typeof setInterval> | null = null
  private state: MonitorState = this.loadState()
  private userId: string | null = null
  private email: string | null = null
  private userName: string | null = null
  private _status: MonitorStatus = 'idle'
  private listeners: Set<EventCallback> = new Set()
  private statusListeners: Set<(status: MonitorStatus) => void> = new Set()
  private lastPosition: GeoPosition | null = null

  // ── Public API ──

  get status(): MonitorStatus { return this._status }

  /**
   * Start monitoring. Call once when app mounts.
   * Safe to call multiple times — will not double-start.
   */
  async start(userId: string, email: string, name?: string) {
    if (this.watchId !== null) return // Already running
    if (!navigator.geolocation) {
      this.setStatus('unavailable')
      return
    }

    this.userId = userId
    this.email = email
    this.userName = name || 'Zoho User'

    // Fetch geofences
    await this.fetchGeofences()
    if (this.geofences.length === 0) {
      // No geofences configured — nothing to monitor
      this.setStatus('idle')
      return
    }

    // Start watching position
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPosition({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => {
        console.warn('[GeofenceMonitor] GPS error:', err.message)
        if (err.code === err.PERMISSION_DENIED) {
          this.setStatus('denied')
        } else {
          this.setStatus('unavailable')
        }
      },
      {
        enableHighAccuracy: false, // Save battery — 100m accuracy is fine for geofences
        timeout: 30000,
        maximumAge: 15000,
      }
    )

    // Poll for geofence config changes
    this.geofencePollTimer = setInterval(() => this.fetchGeofences(), GEOFENCE_POLL_MS)

    this.setStatus('monitoring')
  }

  /** Stop monitoring. */
  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }
    if (this.geofencePollTimer) {
      clearInterval(this.geofencePollTimer)
      this.geofencePollTimer = null
    }
    this.setStatus('idle')
  }

  /** Subscribe to clock events. Returns unsubscribe function. */
  onEvent(cb: EventCallback): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  /** Subscribe to status changes. Returns unsubscribe function. */
  onStatusChange(cb: (status: MonitorStatus) => void): () => void {
    this.statusListeners.add(cb)
    return () => this.statusListeners.delete(cb)
  }

  /** Force re-check (e.g., after manual clock action). */
  resetTodayState() {
    this.state.clockedInToday = null
    this.state.clockedOutToday = null
    this.state.enterTime = null
    this.state.exitTime = null
    this.state.insideFence = false
    this.state.currentFenceId = null
    this.state.currentFenceName = null
    this.saveState()
  }

  // ── Internal ──

  private async fetchGeofences() {
    try {
      const res = await fetch('/api/timeclock/geofences')
      const data = await res.json()
      if (data.success && data.geofences) {
        this.geofences = data.geofences
      }
    } catch (e) {
      console.warn('[GeofenceMonitor] Failed to fetch geofences:', e)
    }
  }

  private onPosition(pos: GeoPosition) {
    this.lastPosition = pos

    // Check accuracy — ignore wildly inaccurate readings
    if (pos.accuracy > 500) return // >500m accuracy is useless

    // Find the nearest geofence and check if we're inside any
    let insideAny = false
    let nearestInside: GeofenceLocation | null = null

    for (const fence of this.geofences) {
      const dist = haversineDistance(pos.latitude, pos.longitude, fence.latitude, fence.longitude)
      if (dist <= fence.radiusMeters) {
        insideAny = true
        nearestInside = fence
        break // Inside at least one fence, that's enough
      }
    }

    const now = Date.now()
    const todayStr = this.getTodayString()

    if (insideAny && nearestInside) {
      // ── INSIDE a fence ──
      this.state.exitTime = null // Reset exit timer

      if (!this.state.insideFence) {
        // Just entered
        this.state.insideFence = true
        this.state.currentFenceId = nearestInside.id
        this.state.currentFenceName = nearestInside.name
        this.state.enterTime = new Date().toISOString()
        this.saveState()
      } else if (this.state.enterTime) {
        // Still inside — check dwell time
        const dwellMs = now - new Date(this.state.enterTime).getTime()
        if (dwellMs >= ENTER_DWELL_MS && this.state.clockedInToday !== todayStr) {
          // Dwell threshold met → AUTO CLOCK IN
          this.triggerClockAction('clockIn', nearestInside, pos, todayStr)
        }
      }
    } else {
      // ── OUTSIDE all fences ──
      if (this.state.insideFence) {
        // Just exited
        this.state.insideFence = false
        this.state.exitTime = new Date().toISOString()
        this.saveState()
      } else if (this.state.exitTime && this.state.clockedInToday === todayStr) {
        // Still outside — check exit dwell
        const awayMs = now - new Date(this.state.exitTime).getTime()
        if (awayMs >= EXIT_DWELL_MS && this.state.clockedOutToday !== todayStr) {
          // Away long enough → AUTO CLOCK OUT
          this.triggerClockAction('clockOut', null, pos, todayStr)
        }
      }

      this.state.enterTime = null
      this.state.currentFenceId = null
      this.state.currentFenceName = null
      this.saveState()
    }
  }

  private async triggerClockAction(
    action: 'clockIn' | 'clockOut',
    fence: GeofenceLocation | null,
    pos: GeoPosition,
    todayStr: string
  ) {
    try {
      const res = await fetch('/api/timeclock/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          email: this.email,
          name: this.userName,
          action,
          source: 'geofence',
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracy: pos.accuracy,
        })
      })

      const data = await res.json()
      if (data.success) {
        // Mark as triggered for today
        if (action === 'clockIn') {
          this.state.clockedInToday = todayStr
        } else {
          this.state.clockedOutToday = todayStr
        }
        this.saveState()

        // Notify listeners
        for (const cb of this.listeners) {
          cb({
            action,
            source: 'geofence',
            fenceName: fence?.name || this.state.currentFenceName || null,
            fenceId: fence?.id || this.state.currentFenceId || null,
            position: pos,
            entry: data.entry,
          })
        }
      }
    } catch (e) {
      console.error('[GeofenceMonitor] Clock action failed:', e)
    }
  }

  private getTodayString(): string {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit'
    })
    const parts = formatter.formatToParts(now)
    const ye = parts.find(p => p.type === 'year')?.value
    const mo = parts.find(p => p.type === 'month')?.value
    const da = parts.find(p => p.type === 'day')?.value
    return `${ye}-${mo}-${da}`
  }

  private setStatus(s: MonitorStatus) {
    this._status = s
    for (const cb of this.statusListeners) cb(s)
  }

  private loadState(): MonitorState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        // Reset if it's from a previous day
        const today = this.getTodayString()
        if (parsed.clockedInToday && parsed.clockedInToday !== today) {
          return this.defaultState()
        }
        return parsed
      }
    } catch {}
    return this.defaultState()
  }

  private saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
    } catch {}
  }

  private defaultState(): MonitorState {
    return {
      insideFence: false,
      currentFenceId: null,
      currentFenceName: null,
      enterTime: null,
      exitTime: null,
      clockedInToday: null,
      clockedOutToday: null,
    }
  }
}

// ── Singleton export ──
export const GeofenceMonitor = new GeofenceMonitorClass()
