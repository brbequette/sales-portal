"use client"

import React, { useState, useEffect } from "react"
import { FiSearch, FiFileText, FiUser, FiActivity } from "react-icons/fi"
import { useRouter } from "next/navigation"

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  useEffect(() => {
    if (!open) {
      setQuery("")
      setResults([])
    }
  }, [open])

  useEffect(() => {
    if (query.length > 2) {
      setLoading(true)
      const timer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/global-search?q=${encodeURIComponent(query)}`)
          if (res.ok) {
             const data = await res.json()
             const flattened: any[] = []
             if (data.results) {
                 if (data.results.accounts) data.results.accounts.forEach((a:any) => flattened.push({ type: 'account', title: a.name, subtitle: a.industry || 'Account' }))
                 if (data.results.invoices) data.results.invoices.forEach((i:any) => flattened.push({ type: 'invoice', title: i.invoiceNumber || i.invoice_number, subtitle: i.status || 'Invoice' }))
                 if (data.results.deals) data.results.deals.forEach((d:any) => flattened.push({ type: 'deal', title: d.name, subtitle: d.stage || 'Deal' }))
                 if (data.results.products) data.results.products.forEach((p:any) => flattened.push({ type: 'product', title: p.name, subtitle: p.item_type || 'Product' }))
             }
             setResults(flattened)
          }
        } catch (e) {
          console.error(e)
        }
        setLoading(false)
      }, 300)
      return () => clearTimeout(timer)
    } else {
      setResults([])
    }
  }, [query])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      
      <div className="relative w-full max-w-2xl glass-panel border border-white/10 shadow-2xl rounded-2xl overflow-hidden glass-panel animate-slide-down">
        <div className="flex items-center px-4 py-4 border-b border-white/10">
          <FiSearch size={20} className="text-neutral-500 mr-3" />
          <input
            autoFocus
            className="flex-1 bg-transparent text-lg text-white placeholder-neutral-500 outline-none border-none focus:ring-0 p-0"
            placeholder="Search accounts, invoices, or type a command..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="text-[10px] font-bold text-neutral-500 bg-white/5 px-2 py-1 rounded-md ml-2 border border-white/10">ESC</div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {loading && (
             <div className="p-4 text-center text-sm text-neutral-500">Searching Titan Network...</div>
          )}
          {!loading && results.length === 0 && query.length > 2 && (
             <div className="p-4 text-center text-sm text-neutral-500">No results found for "{query}"</div>
          )}
          {!loading && query.length <= 2 && (
             <div className="p-4 text-center text-sm text-neutral-500">Type at least 3 characters to search</div>
          )}

          {!loading && results.length > 0 && (
             <div className="space-y-1">
                {results.map((r, i) => (
                   <button 
                      key={i} 
                      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors text-left group"
                      onClick={() => {
                         if (r.type === 'account') {
                             router.push(`/?search=${encodeURIComponent(r.title)}`)
                         } else if (r.type === 'invoice') {
                             router.push(`/collections?search=${encodeURIComponent(r.title)}`)
                         } else if (r.type === 'deal') {
                             // Navigate to the account that owns this deal
                             const accountId = r.accountId || r.id
                             if (accountId) router.push(`/account?id=${accountId}`)
                         } else if (r.type === 'product') {
                             router.push(`/catalog?search=${encodeURIComponent(r.title)}`)
                         }
                         setOpen(false)
                      }}
                   >
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-neutral-400 group-hover:bg-[var(--primary)] group-hover:text-white transition-colors shadow-lg">
                            {r.type === 'account' ? <FiUser size={14} /> : r.type === 'invoice' ? <FiFileText size={14} /> : <FiActivity size={14} />}
                         </div>
                         <div>
                            <div className="text-sm font-bold text-white group-hover:text-[var(--primary)] transition-colors">{r.title}</div>
                            <div className="text-xs text-neutral-400">{r.subtitle}</div>
                         </div>
                      </div>
                      <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-black border border-white/10 px-2 py-0.5 rounded bg-white/5">{r.type}</div>
                   </button>
                ))}
             </div>
          )}
        </div>
      </div>
    </div>
  )
}

