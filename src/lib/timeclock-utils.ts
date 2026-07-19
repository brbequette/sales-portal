/**
 * Shared timeclock calculation utilities.
 * Used by GlobalTopBar widget and timeclock page.
 */

interface InactivityPeriod {
  start: string
  end: string
}

/**
 * Calculate working hours for a time entry, subtracting inactivity periods.
 * Logic matches GlobalTopBar.tsx implementation exactly:
 * - Uses manualClockIn/Out if available, falls back to clockIn/lastActivity
 * - Caps end time at now if still in the future
 * - Subtracts only the overlapping portion of inactivity periods
 * - Returns numeric hours (not formatted string)
 */
export function calculateHours(entry: {
  clockIn: string | Date
  clockOut?: string | Date | null
  lastActivity?: string | Date | null
  manualClockIn?: string | Date | null
  manualClockOut?: string | Date | null
  inactivityPeriods?: InactivityPeriod[] | string | null
}): number {
  const start = new Date(entry.manualClockIn || entry.clockIn)
  let end: Date
  if (entry.manualClockOut) {
    end = new Date(entry.manualClockOut)
  } else if (entry.clockOut) {
    end = new Date(entry.clockOut)
  } else if (entry.lastActivity) {
    end = new Date(entry.lastActivity)
  } else {
    end = new Date()
  }

  // Cap at now if active
  const now = new Date()
  if (end > now) end = now

  // Parse inactivity periods
  let periods: InactivityPeriod[] = []
  if (entry.inactivityPeriods) {
    if (typeof entry.inactivityPeriods === 'string') {
      try { periods = JSON.parse(entry.inactivityPeriods) } catch { periods = [] }
    } else if (Array.isArray(entry.inactivityPeriods)) {
      periods = entry.inactivityPeriods
    }
  }

  // Subtract inactivity (only overlapping portions)
  let inactivityMs = 0
  for (const period of periods) {
    const pStart = new Date(period.start)
    const pEnd = new Date(period.end)
    const overlapStart = new Date(Math.max(start.getTime(), pStart.getTime()))
    const overlapEnd = new Date(Math.min(end.getTime(), pEnd.getTime()))
    if (overlapEnd > overlapStart) {
      inactivityMs += overlapEnd.getTime() - overlapStart.getTime()
    }
  }

  const diffHours = ((end.getTime() - start.getTime()) - inactivityMs) / (1000 * 60 * 60)
  return Math.max(0, diffHours)
}

/**
 * Format hours as "Xh Ym" string.
 */
export function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}
