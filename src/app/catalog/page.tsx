"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useZoho } from "@/components/ZohoProvider"
import { useProductModal } from "@/components/ProductModalProvider"
import { 
  FiSearch, FiPackage, FiBox, FiInfo, FiDollarSign, FiTag 
} from "react-icons/fi"

export default function ProductCatalogPage() {
  const { isInitialized } = useZoho()
  const { showProduct } = useProductModal()
  
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("All")
  const [showInactive, setShowInactive] = useState(false)
  
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState("")

  const productCategories = ["All", "Blades", "Polishing", "Core Bits", "Grinding"]

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/get-products")
      const data = await res.json()
      if (data.success) {
        setProducts(data.products || [])
      }
    } catch (e) {
      console.error("Error fetching products:", e)
    } finally {
      setLoading(false)
    }
  }

  const handleSyncWithZoho = async () => {
    setSyncing(true)
    setSyncProgress("Starting sync...")
    try {
      let page = 1
      let hasMore = true
      while (hasMore) {
        setSyncProgress(`Syncing page ${page}...`)
        const res = await fetch(`/api/get-products?reseed=true&page=${page}`)
        const data = await res.json()
        if (data.success) {
          hasMore = data.hasMore
          page = data.nextPage || (page + 1)
        } else {
          throw new Error(data.message || "Failed during reseed")
        }
      }
      setSyncProgress("Sync completed successfully!")
      await fetchProducts()
    } catch (e: any) {
      console.error(e)
      setSyncProgress(`Error syncing: ${e.message}`)
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncProgress(""), 4000)
    }
  }

  useEffect(() => {
    if (isInitialized) {
      fetchProducts()
    }
  }, [isInitialized])

  const parseProductDescription = (desc: string | null) => {
    if (!desc) return { text: "—", cost: null, vendor: null, retail: null, pertinentInfo: null, image: null }
    try {
      const parsed = JSON.parse(desc)
      if (parsed && typeof parsed === "object") {
        return {
          text: parsed.text || "—",
          cost: parsed.cost !== undefined ? parsed.cost : null,
          vendor: parsed.vendor || null,
          retail: parsed.retail !== undefined ? parsed.retail : null,
          pertinentInfo: parsed.pertinentInfo || null,
          image: parsed.image || null,
          status: parsed.status || "active"
        }
      }
    } catch (e) {
      // Ignore
    }
    return { text: desc, cost: null, vendor: null, retail: null, pertinentInfo: null, image: null, status: "active" }
  }

  const getProductImage = (name: string, sku: string) => {
    const s = (sku || "").toLowerCase()
    const n = (name || "").toLowerCase()
    if (s.includes("td-bl-100") || n.includes("turbo blade")) return "/images/turbo_blade.png"
    if (s.includes("td-bl-102") || n.includes("continuous rim")) return "/images/continuous_rim_blade.png"
    if (s.includes("td-pp-200") || n.includes("polishing pad")) return "/images/polishing_pads.png"
    if (s.includes("td-cb-300") || n.includes("core bit")) return "/images/core_bit.png"
    if (s.includes("td-cw-400") || n.includes("cup wheel") || n.includes("grinding")) return "/images/cup_wheel.png"
    return null
  }

  const filteredProducts = products.filter(p => {
    const parsed = parseProductDescription(p.description)
    const matchesSearch = p.sku.toLowerCase().includes(search.toLowerCase()) ||
                          p.name.toLowerCase().includes(search.toLowerCase()) ||
                          parsed.text.toLowerCase().includes(search.toLowerCase()) ||
                          (parsed.vendor && parsed.vendor.toLowerCase().includes(search.toLowerCase())) ||
                          (parsed.pertinentInfo && parsed.pertinentInfo.toLowerCase().includes(search.toLowerCase()))
    const matchesCategory = category === "All" || p.category === category
    const isActive = parsed.status !== "inactive"
    return matchesSearch && matchesCategory && (showInactive || isActive)
  })

  if (!isInitialized || (loading && products.length === 0)) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-neutral-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-neutral-400 text-sm">Loading Product Catalog...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans pb-12">
      {/* Header */}
      <header className="bg-neutral-900 border-b border-neutral-800 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-neutral-400 hover:text-emerald-400 font-medium transition-colors text-sm">
              &larr; Dashboard
            </Link>
            <div className="h-6 w-px bg-neutral-800"></div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              💎 Product Catalog Lookup
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {syncProgress && (
              <span className="text-[10px] text-neutral-400 font-semibold animate-pulse">{syncProgress}</span>
            )}
            <button
              onClick={handleSyncWithZoho}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3m-3-5v12" />
              </svg>
              <span>{syncing ? "Syncing..." : "Sync from Zoho"}</span>
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm text-neutral-400 mt-2 sm:mt-0">
            <input 
              type="checkbox" 
              id="showInactive" 
              checked={showInactive} 
              onChange={e => setShowInactive(e.target.checked)} 
              className="rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-emerald-500"
            />
            <label htmlFor="showInactive" className="cursor-pointer select-none text-xs font-bold uppercase tracking-wide">Show Inactive</label>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Search View */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative max-w-md w-full">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
            <input 
              type="text" 
              placeholder="Search products by SKU, name, description..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <div className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">
            Total Products: <span className="text-emerald-400 font-extrabold">{filteredProducts.length}</span>
          </div>
        </div>

        {/* Product Categories Bar */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {productCategories.map(cat => (
            <button 
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                category === cat 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-white border border-neutral-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Products Table */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-x-auto shadow-2xl">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead className="bg-neutral-800/80 text-neutral-400 border-b border-neutral-800 uppercase tracking-wider text-[9px] font-bold">
              <tr>
                <th className="p-4 w-28">SKU</th>
                <th className="p-4">Product Name</th>
                <th className="p-4">Vendor</th>
                <th className="p-4">Category</th>
                <th className="p-4">Description</th>
                <th className="p-4 text-right">Price</th>
                <th className="p-4 text-right">Cost</th>
                <th className="p-4 text-right">Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {filteredProducts.map(p => {
                const parsed = parseProductDescription(p.description)
                return (
                  <tr 
                    key={p.id} 
                    onClick={() => showProduct(p.sku, { name: p.name, sku: p.sku })}
                    className="hover:bg-neutral-800/30 transition-colors cursor-pointer"
                  >
                    <td className="p-4 font-mono font-bold text-neutral-300">{p.sku}</td>
                    <td className="p-4 font-semibold text-white">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-neutral-850 border border-neutral-700/50 flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {parsed.image || getProductImage(p.name, p.sku) ? (
                            <img 
                              src={parsed.image || getProductImage(p.name, p.sku) || undefined} 
                              alt={p.name} 
                              className="w-full h-full object-cover" 
                            />
                          ) : (
                            <FiPackage className="text-neutral-500" size={14} />
                          )}
                        </div>
                        <span>{p.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-neutral-400 font-semibold">{parsed.vendor || "N/A"}</td>
                    <td className="p-4 text-emerald-400 font-semibold">{p.category}</td>
                    <td className="p-4 text-neutral-400 max-w-xs truncate" title={parsed.text}>
                      {parsed.text}
                      {parsed.pertinentInfo && <div className="text-[10px] text-amber-400 mt-1 truncate">{parsed.pertinentInfo}</div>}
                    </td>
                    <td className="p-4 text-right text-white font-bold">${parseFloat(p.price || 0).toFixed(2)}</td>
                    <td className="p-4 text-right text-neutral-400">
                      {parsed.cost !== null ? `$${parseFloat(parsed.cost).toFixed(2)}` : "—"}
                    </td>
                    <td className="p-4 text-right">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.stock > 50 ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20' :
                        p.stock > 10 ? 'bg-amber-950/40 text-amber-400 border border-amber-500/20' :
                        'bg-red-950/40 text-red-400 border border-red-500/20'
                      }`}>
                        {p.stock} in stock
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          
          {filteredProducts.length === 0 && (
            <div className="p-16 text-center border-t border-neutral-800 bg-neutral-900/10">
              <FiSearch className="mx-auto text-4xl text-neutral-600 mb-3" />
              <p className="text-neutral-400 font-medium text-sm">No products found matching your search.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
