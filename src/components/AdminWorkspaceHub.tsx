import Link from "next/link"
import type { IconType } from "react-icons"

export type AdminWorkspaceItem = {
  title: string
  description: string
  href: string
  icon: IconType
  accent?: string
}

export function AdminWorkspaceHub({
  eyebrow,
  title,
  description,
  items,
}: {
  eyebrow: string
  title: string
  description: string
  items: AdminWorkspaceItem[]
}) {
  return <div className="flex-1 overflow-y-auto p-4 md:p-8">
    <header className="mb-6">
      <div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">{eyebrow}</div>
      <h1 className="text-2xl font-black text-white md:text-3xl">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-neutral-400">{description}</p>
    </header>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map(item => <Link key={item.href} href={item.href} className="group min-h-36 rounded-2xl border border-white/10 bg-white/[0.025] p-5 hover:border-emerald-500/30 hover:bg-emerald-500/5">
        <item.icon className={`mb-4 text-xl ${item.accent || "text-emerald-400"}`} />
        <h2 className="font-black text-white group-hover:text-emerald-300">{item.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-neutral-500">{item.description}</p>
      </Link>)}
    </div>
  </div>
}
