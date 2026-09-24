"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { FiAlertTriangle, FiChevronRight, FiSearch } from "react-icons/fi"
import type { IconType } from "react-icons"

export type AdminWorkspaceItem = {
  title: string
  description: string
  href: string
  icon: IconType
  accent?: string
  badge?: string
  warning?: string
}

export function AdminWorkspaceHub({
  eyebrow,
  title,
  description,
  items,
  parent = "Administration",
}: {
  eyebrow: string
  title: string
  description: string
  items: AdminWorkspaceItem[]
  parent?: string
}) {
  const [query, setQuery] = useState("")
  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items
    return items.filter(item => `${item.title} ${item.description} ${item.badge || ""}`.toLowerCase().includes(normalized))
  }, [items, query])

  return <div className="flex-1 overflow-y-auto p-4 md:p-8">
    <header className="mb-6">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-xs text-neutral-500">
        <Link href="/admin" className="hover:text-emerald-400">{parent}</Link><FiChevronRight aria-hidden />
        <span className="text-neutral-300" aria-current="page">{title}</span>
      </nav>
      <div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">{eyebrow}</div>
      <h1 className="text-2xl font-black text-white md:text-3xl">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-neutral-400">{description}</p>
    </header>
    {items.length > 5 && <label className="relative mb-5 block max-w-xl">
      <span className="sr-only">Search {title}</span>
      <FiSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()}…`} className="min-h-12 w-full rounded-xl border border-white/10 bg-black/20 pl-11 pr-4 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-emerald-500/50" />
    </label>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {visibleItems.map(item => <Link key={item.href} href={item.href} className={`group min-h-36 rounded-2xl border p-5 ${item.warning ? "border-amber-500/25 bg-amber-500/[0.04] hover:border-amber-400/50" : "border-white/10 bg-white/[0.025] hover:border-emerald-500/30 hover:bg-emerald-500/5"}`}>
        <div className="mb-4 flex items-start justify-between gap-3"><item.icon className={`text-xl ${item.accent || "text-emerald-400"}`} />{item.badge && <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-neutral-400">{item.badge}</span>}</div>
        <h2 className="font-black text-white group-hover:text-emerald-300">{item.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-neutral-500">{item.description}</p>
        {item.warning && <p className="mt-3 flex gap-2 text-xs leading-relaxed text-amber-300"><FiAlertTriangle className="mt-0.5 shrink-0" />{item.warning}</p>}
      </Link>)}
    </div>
    {visibleItems.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-neutral-500">No settings match “{query}”.</div>}
  </div>
}
