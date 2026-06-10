"use client"

import { useState, useEffect, useRef } from "react"
import { FiSearch, FiPlus, FiUserPlus, FiCheckSquare, FiFileText, FiDollarSign, FiBox } from "react-icons/fi"
import { useRouter } from "next/navigation"
import { useProductModal } from "@/components/ProductModalProvider"
import { NewCustomerModal } from "@/components/NewCustomerModal"
import { TaskModal } from "@/components/TaskModal"
import { useZoho } from "@/components/ZohoProvider"

export function GlobalTopBar() {
  const router = useRouter()
  const { showProduct } = useProductModal()
  const { zohoContext: currentUser } = useZoho()
  
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)

  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Close dropdown on click outside
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults(null)
        setLoading(false)
        return
      }
      
      setLoading(true)
      try {
        const res = await fetch(`/api/global-search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        if (data.success) {
          setResults(data.results)
          setShowResults(true)
        }
      } catch (e) {
        console.error("Global search failed:", e)
      } finally {
        setLoading(false)
      }
    }, 400) // 400ms debounce

    return () => clearTimeout(delayDebounceFn)
  }, [query])

  const handleResultClick = (type: string, item: any) => {
    setShowResults(false)
    setQuery("")
    
    switch(type) {
      case "accounts":
        router.push(`/account?id=${item.zohoId}`)
        break
      case "invoices":
        // For now, route to account, later handle popup if needed
        router.push(`/account?id=${item.zohoId || item.accountId}&invoiceId=${item.zohoId || item.id}`)
        break
      case "deals":
        router.push(`/account?id=${item.accountId}`)
        break
      case "products":
        showProduct(item.name, item)
        break
      default:
        break
    }
  }

  return (
    <div className="bg-neutral-900 border-b border-neutral-800 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
      
      {/* Left side: Search */}
      <div className="flex-1 max-w-2xl relative" ref={searchRef}>
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
          <input 
            type="text" 
            placeholder="Search accounts, invoices, products, quotes..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (results) setShowResults(true) }}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-full pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          )}
        </div>

        {/* Dropdown Results */}
        {showResults && results && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden max-h-[80vh] overflow-y-auto z-50">
            {Object.keys(results).every(k => results[k].length === 0) ? (
              <div className="p-4 text-center text-sm text-neutral-500">No results found for "{query}"</div>
            ) : (
              <div className="py-2">
                {results.accounts?.length > 0 && (
                  <div className="mb-2">
                    <div className="px-4 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-neutral-950/50">Accounts</div>
                    {results.accounts.map((a: any) => (
                      <div 
                        key={a.id} 
                        onClick={() => handleResultClick("accounts", a)}
                        className="px-4 py-2 hover:bg-neutral-800 cursor-pointer flex items-center gap-3 transition-colors"
                      >
                        <div className="w-8 h-8 rounded bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                          <FiUserPlus />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">{a.name}</div>
                          <div className="text-xs text-neutral-500 truncate">{a.zohoId} &bull; {a.industry || "No Industry"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {results.invoices?.length > 0 && (
                  <div className="mb-2">
                    <div className="px-4 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-neutral-950/50">Invoices & Sales Orders</div>
                    {results.invoices.map((i: any) => (
                      <div 
                        key={i.id} 
                        onClick={() => handleResultClick("invoices", i)}
                        className="px-4 py-2 hover:bg-neutral-800 cursor-pointer flex items-center gap-3 transition-colors"
                      >
                        <div className="w-8 h-8 rounded bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                          <FiFileText />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-white truncate">{i.invoiceNumber || i.orderNumber || "Draft"}</div>
                          <div className="text-xs text-neutral-500 truncate">{i.status}</div>
                        </div>
                        <div className="text-sm font-bold text-emerald-400">${parseFloat(i.amount).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}

                {results.deals?.length > 0 && (
                  <div className="mb-2">
                    <div className="px-4 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-neutral-950/50">Deals & Quotes</div>
                    {results.deals.map((d: any) => (
                      <div 
                        key={d.id} 
                        onClick={() => handleResultClick("deals", d)}
                        className="px-4 py-2 hover:bg-neutral-800 cursor-pointer flex items-center gap-3 transition-colors"
                      >
                        <div className="w-8 h-8 rounded bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                          <FiDollarSign />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-white truncate">{d.name}</div>
                          <div className="text-xs text-neutral-500 truncate">{d.stage}</div>
                        </div>
                        <div className="text-sm font-bold text-emerald-400">${parseFloat(d.amount).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}

                {results.products?.length > 0 && (
                  <div className="mb-0">
                    <div className="px-4 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-neutral-950/50">Products</div>
                    {results.products.map((p: any) => (
                      <div 
                        key={p.id || p.sku} 
                        onClick={() => handleResultClick("products", p)}
                        className="px-4 py-2 hover:bg-neutral-800 cursor-pointer flex items-center gap-3 transition-colors"
                      >
                        <div className="w-8 h-8 rounded bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
                          <FiBox />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-white truncate">{p.name}</div>
                          <div className="text-xs text-neutral-500 truncate">{p.sku}</div>
                        </div>
                        <div className="text-sm font-bold text-white">${parseFloat(p.price || 0).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right side: Quick Add Actions */}
      <div className="flex items-center gap-2 lg:gap-3 ml-4 shrink-0">
        <button
          onClick={() => setShowAddTask(true)}
          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-bold px-3 lg:px-4 py-2 rounded-full text-xs lg:text-sm transition-all flex items-center gap-2 border border-neutral-700"
        >
          <FiCheckSquare size={14} /> <span className="hidden sm:inline">Add Task</span>
        </button>
        <button
          onClick={() => setShowAddAccount(true)}
          className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-3 lg:px-4 py-2 rounded-full text-xs lg:text-sm transition-all shadow-lg flex items-center gap-2 whitespace-nowrap"
        >
          <FiUserPlus size={14} /> <span className="hidden sm:inline">Add Account</span>
        </button>
      </div>

      {/* Modals */}
      {showAddAccount && (
        <NewCustomerModal isOpen={showAddAccount} onClose={() => setShowAddAccount(false)} currentUserId={currentUser?.id} />
      )}
      
      {showAddTask && (
        <TaskModal onClose={() => setShowAddTask(false)} />
      )}
    </div>
  )
}
