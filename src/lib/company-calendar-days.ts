export const COMPANY_TIME_ZONE = 'America/Phoenix'

const DAY_MS = 24 * 60 * 60 * 1000

function calendarOrdinal(value: Date | string, timeZone: string): number | null {
  if (typeof value === 'string') {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/.exec(value)
    if (dateOnly) {
      const [, year, month, day] = dateOnly
      return Date.UTC(Number(year), Number(month) - 1, Number(day)) / DAY_MS
    }
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)?.value)
  const year = part('year')
  const month = part('month')
  const day = part('day')
  if (!year || !month || !day) return null
  return Date.UTC(year, month - 1, day) / DAY_MS
}

export function companyCalendarDaysBetween(
  earlier: Date | string | null | undefined,
  later: Date | string = new Date(),
  timeZone = COMPANY_TIME_ZONE,
): number | null {
  if (earlier == null || earlier === '') return null
  const earlierOrdinal = calendarOrdinal(earlier, timeZone)
  const laterOrdinal = calendarOrdinal(later, timeZone)
  if (earlierOrdinal == null || laterOrdinal == null) return null
  return laterOrdinal - earlierOrdinal
}

export function normalizeWholeDaysRemaining(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.floor(value))
}
