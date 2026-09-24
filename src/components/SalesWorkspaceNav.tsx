"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { FiPhoneCall, FiTarget, FiTrendingUp } from "react-icons/fi"

const destinations = [
  { href: "/sales/todays-calls", label: "Today", detail: "Next customer", icon: FiTarget },
  { href: "/sales", label: "Accounts & Deals", detail: "Pipeline", icon: FiTrendingUp },
  { href: "/sales/leads-calling", label: "Leads", detail: "Call & convert", icon: FiPhoneCall },
]

export function SalesWorkspaceNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Sales workspace" className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
      {destinations.map(({ href, label, detail, icon: Icon }) => {
        const active = pathname === href
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-lg px-2 text-left transition ${active ? "bg-emerald-500 text-black" : "text-neutral-400 hover:bg-white/10 hover:text-white"}`}>
          <Icon className="shrink-0" size={14} />
          <span className="min-w-0"><span className="block truncate text-[11px] font-black">{label}</span><span className={`hidden truncate text-[9px] sm:block ${active ? "text-black/65" : "text-neutral-600"}`}>{detail}</span></span>
        </Link>
      })}
    </nav>
  )
}
