"use client"

import { useEffect, useState, memo } from "react"
import { FiClock } from "react-icons/fi"
import { getExclusivityDetails } from "@/app/sales/page"

/**
 * Self-contained countdown timer for account exclusivity.
 * Each instance manages its own 1-second interval so we don't
 * re-render the entire 3,920-row account list every tick.
 */
function ExclusivityCountdownInner({ account }: { account: any }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const excl = getExclusivityDetails(account, now)

  return (
    <div
      title={`Account Exclusivity Countdown: ${excl.daysLeft} days left before account becomes unlocked / reassignable`}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border font-mono tracking-tight shrink-0 transition-all ${excl.badgeClass}`}
    >
      <FiClock size={13} className={excl.textClass} />
      <div className="flex flex-col text-left">
        <span className="text-[9px] font-sans font-bold uppercase tracking-wider opacity-75 leading-none">
          Exclusivity
        </span>
        <span className={`text-xs font-black ${excl.textClass}`}>
          {excl.formatted}
        </span>
      </div>
    </div>
  )
}

export const ExclusivityCountdown = memo(ExclusivityCountdownInner)
