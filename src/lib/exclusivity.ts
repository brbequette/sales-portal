export function getExclusivityDetails(account: any, nowMs: number) {
  const originDateStr = account.lastPurchaseAt || account.lastOrderDate || account.createdAt
  const originTime = originDateStr ? new Date(originDateStr).getTime() : nowMs
  const endMs = originTime + (365 * 24 * 60 * 60 * 1000)
  const msLeft = endMs - nowMs

  if (msLeft <= 0) {
    return {
      msLeft: 0,
      daysLeft: 0,
      category: "expired",
      formatted: "UNLOCKED",
      badgeClass: "bg-neutral-800 text-neutral-400 border-neutral-700",
      textClass: "text-neutral-400 font-semibold",
    }
  }

  const secondsTotal = Math.floor(msLeft / 1000)
  const days = Math.floor(secondsTotal / 86400)
  const hours = Math.floor((secondsTotal % 86400) / 3600)
  const minutes = Math.floor((secondsTotal % 3600) / 60)
  const seconds = secondsTotal % 60

  const formatted = `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`

  let category: "green" | "yellow" | "red" = "green"
  let badgeClass = ""
  let textClass = ""

  if (days > 180) {
    // Green: > 6 months left (> 180 days)
    category = "green"
    badgeClass = "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
    textClass = "text-emerald-400 font-bold"
  } else if (days >= 90) {
    // Yellow: 3 to 6 months left (90 to 180 days)
    category = "yellow"
    badgeClass = "bg-amber-500/15 text-amber-300 border-amber-500/30"
    textClass = "text-amber-400 font-bold"
  } else {
    // Red: 1 to 3 months left (< 90 days)
    category = "red"
    badgeClass = "bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse"
    textClass = "text-rose-400 font-bold"
  }

  return {
    msLeft,
    daysLeft: days,
    category,
    formatted,
    badgeClass,
    textClass,
  }
}
