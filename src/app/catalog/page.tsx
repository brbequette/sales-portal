"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useZoho } from "@/components/ZohoProvider"
import { useProductModal } from "@/components/ProductModalProvider"
import { 
  FiSearch, FiPackage, FiBox, FiInfo, FiDollarSign, FiTag, FiEdit2, FiX, FiCheck
} from "react-icons/fi"

export default function ProductCatalogPage() {
  const { isInitialized } = useZoho()
  const { showProduct } = useProductModal()
  
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("All")
  
  // New Filters
  const [filterSize, setFilterSize] = useState("")
  const [filterApp, setFilterApp] = useState("")
  const [filterMfg, setFilterMfg] = useState("")
  const [filterVendor, setFilterVendor] = useState("")

  const [showInactive, setShowInactive] = useState(false)
  
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState("")
  
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [editSaving, setEditSaving] = useState(false)

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
    if (!desc) return { text: "—", cost: null, vendor: null, retail: null, pertinentInfo: null, image: null, status: "active" }
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
    } catch (e) {}
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

  // Derive filter options dynamically
  const sizes = Array.from(new Set(products.map(p => p.size).filter(Boolean))).sort()
  const apps = Array.from(new Set(products.map(p => p.application).filter(Boolean))).sort()
  const mfgs = Array.from(new Set(products.map(p => p.manufacturer).filter(Boolean))).sort()
  const vendors = Array.from(new Set(products.map(p => {
    const parsed = parseProductDescription(p.description)
    return p.vendor || parsed.vendor
  }).filter(Boolean))).sort()

  const filteredProducts = products.filter(p => {
    const parsed = parseProductDescription(p.description)
    const matchesSearch = p.sku.toLowerCase().includes(search.toLowerCase()) ||
                          p.name.toLowerCase().includes(search.toLowerCase()) ||
                          parsed.text.toLowerCase().includes(search.toLowerCase())
    
    const matchesCategory = category === "All" || p.category === category
    const isActive = parsed.status !== "inactive"
    
    const matchesSize = !filterSize || p.size === filterSize
    const matchesApp = !filterApp || p.application === filterApp
    const matchesMfg = !filterMfg || p.manufacturer === filterMfg
    const matchesVendor = !filterVendor || p.vendor === filterVendor || parsed.vendor === filterVendor

    return matchesSearch && matchesCategory && (showInactive || isActive) && matchesSize && matchesApp && matchesMfg && matchesVendor
  })

  // Group by Quality Tier if Application or Size is selected
  const shouldGroup = filterApp !== "" || filterSize !== ""
  const groupedProducts: Record<string, any[]> = shouldGroup ? {
    "Best": filteredProducts.filter(p => p.qualityTier === "Best"),
    "Better": filteredProducts.filter(p => p.qualityTier === "Better"),
    "Good": filteredProducts.filter(p => p.qualityTier === "Good"),
    "Uncategorized": filteredProducts.filter(p => !p.qualityTier || !["Good", "Better", "Best"].includes(p.qualityTier))
  } : { "All Products": filteredProducts }

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProduct) return
    setEditSaving(true)
    try {
      const res = await fetch("/api/update-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingProduct)
      })
      if (res.ok) {
        await fetchProducts()
        setEditingProduct(null)
      }
    } catch (e) {
      console.error("Failed to save product", e)
    } finally {
      setEditSaving(false)
    }
  }

  const handleReactivate = async (sku: string) => {
    if (!confirm(`Are you sure you want to reactivate ${sku} in Zoho?`)) return
    try {
      const res = await fetch("/api/reactivate-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku })
      })
      const data = await res.json()
      if (data.success) {
        alert("Product reactivated successfully in Zoho! Syncing changes...")
        await handleSyncWithZoho()
      } else {
        alert("Failed: " + data.error)
      }
    } catch (e) {
      alert("Error reactivating product.")
    }
  }

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

  const renderTable = (items: any[], title?: string) => (
    <div key={title} className="mb-8 bg-neutral-900 border border-neutral-800 rounded-xl overflow-x-auto shadow-2xl">
      {title && title !== "All Products" && (
        <div className="bg-neutral-850 px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">{title}</h2>
          <span className="text-xs text-neutral-500 font-semibold">{items.length} items</span>
        </div>
      )}
      <table className="w-full text-left text-xs min-w-[800px]">
        <thead className="bg-neutral-800/80 text-neutral-400 border-b border-neutral-800 uppercase tracking-wider text-[9px] font-bold">
          <tr>
            <th className="p-4 w-28">SKU</th>
            <th className="p-4">Product Name</th>
            <th className="p-4">Vendor / Mfg</th>
            <th className="p-4">Classification</th>
            <th className="p-4 text-right">Price</th>
            <th className="p-4 text-right">Stock</th>
            <th className="p-4 text-right w-16"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {items.map(p => {
            const parsed = parseProductDescription(p.description)
            const isInactive = parsed.status === "inactive"
            return (
              <tr 
                key={p.id} 
                onClick={() => showProduct(p.sku, { name: p.name, sku: p.sku })}
                className="hover:bg-neutral-800/30 transition-colors cursor-pointer"
              >
                <td className="p-4 font-mono font-bold text-neutral-300">
                  {p.sku}
                  {isInactive && (
                    <div className="mt-1">
                      <span className="inline-block bg-red-500/20 text-red-500 border border-red-500/30 text-[9px] px-1.5 py-0.5 rounded font-black tracking-widest uppercase">Inactive</span>
                    </div>
                  )}
                </td>
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
                    <div>
                      <span>{p.name}</span>
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none whitespace-nowrap ${
                          p.subjectToVig ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-700 text-neutral-400'
                        }`}>
                          {p.subjectToVig ? 'VIG' : 'No VIG'}
                        </span>
                        {p.giftItem && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none whitespace-nowrap bg-purple-500/20 text-purple-400">Gift</span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="p-4 text-neutral-400 font-semibold">
                  <div>{p.vendor || parsed.vendor || "—"}</div>
                  <div className="text-[9px] text-neutral-500 uppercase mt-0.5">{p.manufacturer || ""}</div>
                </td>
                <td className="p-4 text-neutral-400">
                  {p.size && <span className="bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded text-[10px] mr-1">{p.size}</span>}
                  {p.application && <span className="bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded text-[10px] mr-1">{p.application}</span>}
                  {p.qualityTier && <span className="bg-neutral-800 text-amber-300 px-1.5 py-0.5 rounded text-[10px]">{p.qualityTier}</span>}
                </td>
                <td className="p-4 text-right text-white font-bold">${parseFloat(p.price || "0").toFixed(2)}</td>
                <td className="p-4 text-right">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    p.stock > 50 ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20' :
                    p.stock > 10 ? 'bg-amber-950/40 text-amber-400 border border-amber-500/20' :
                    'bg-red-950/40 text-red-400 border border-red-500/20'
                  }`}>
                    {p.stock} in stock
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {isInactive && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleReactivate(p.sku); }}
                        className="text-[9px] px-2 py-1 rounded bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors"
                      >
                        Reactivate
                      </button>
                    )}
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingProduct(p); }}
                      className="p-1.5 rounded bg-neutral-800 text-neutral-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                    >
                      <FiEdit2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {items.length === 0 && (
        <div className="p-8 text-center text-neutral-500 text-xs font-medium">
          No items found in this tier.
        </div>
      )}
    </div>
  )

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
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Search & Basic Filters View */}
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

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <input 
                type="checkbox" 
                id="showInactive" 
                checked={showInactive} 
                onChange={e => setShowInactive(e.target.checked)} 
                className="rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-emerald-500"
              />
              <label htmlFor="showInactive" className="cursor-pointer select-none text-xs font-bold uppercase tracking-wide">Show Inactive</label>
            </div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">
              Results: <span className="text-emerald-400 font-extrabold">{filteredProducts.length}</span>
            </div>
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

        {/* Advanced Filters */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-wrap gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Application</label>
            <select value={filterApp} onChange={e => setFilterApp(e.target.value)} className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-emerald-500 outline-none">
              <option value="">All Applications</option>
              {apps.map(a => <option key={String(a)} value={String(a)}>{String(a)}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Size</label>
            <select value={filterSize} onChange={e => setFilterSize(e.target.value)} className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-emerald-500 outline-none">
              <option value="">All Sizes</option>
              {sizes.map(s => <option key={String(s)} value={String(s)}>{String(s)}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Vendor</label>
            <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)} className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-emerald-500 outline-none">
              <option value="">All Vendors</option>
              {vendors.map(v => <option key={String(v)} value={String(v)}>{String(v)}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Manufacturer</label>
            <select value={filterMfg} onChange={e => setFilterMfg(e.target.value)} className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-emerald-500 outline-none">
              <option value="">All Manufacturers</option>
              {mfgs.map(m => <option key={String(m)} value={String(m)}>{String(m)}</option>)}
            </select>
          </div>
          {(filterSize || filterApp || filterVendor || filterMfg) && (
            <div className="flex items-end">
              <button onClick={() => { setFilterSize(""); setFilterApp(""); setFilterVendor(""); setFilterMfg(""); }} className="text-xs text-neutral-400 hover:text-white px-2 py-1.5">Clear Filters</button>
            </div>
          )}
        </div>

        {shouldGroup && (
          <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-lg">
            <strong>Grouping Active:</strong> Showing products grouped by Good/Better/Best tiers because an Application or Size filter is applied.
          </div>
        )}

        {/* Products Rendering */}
        {shouldGroup ? (
          <div className="space-y-6">
            {["Best", "Better", "Good", "Uncategorized"].map(tier => {
              const items = groupedProducts[tier]
              if (items && items.length > 0) {
                return renderTable(items, tier)
              }
              return null
            })}
          </div>
        ) : (
          renderTable(groupedProducts["All Products"])
        )}
      </main>

      {/* Edit Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-850">
              <h2 className="text-sm font-bold text-white">Edit Classifications: {editingProduct.sku}</h2>
              <button onClick={() => setEditingProduct(null)} className="text-neutral-400 hover:text-white"><FiX /></button>
            </div>
            <form onSubmit={handleSaveProduct} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Application</label>
                <input type="text" value={editingProduct.application || ""} onChange={e => setEditingProduct({...editingProduct, application: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none" placeholder="e.g. Concrete, Asphalt, Polishing" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Size</label>
                <input type="text" value={editingProduct.size || ""} onChange={e => setEditingProduct({...editingProduct, size: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none" placeholder="e.g. 14, 4, 5-step" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Manufacturer</label>
                  <input type="text" value={editingProduct.manufacturer || ""} onChange={e => setEditingProduct({...editingProduct, manufacturer: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Vendor</label>
                  <input type="text" value={editingProduct.vendor || ""} onChange={e => setEditingProduct({...editingProduct, vendor: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Quality Tier</label>
                <select value={editingProduct.qualityTier || ""} onChange={e => setEditingProduct({...editingProduct, qualityTier: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none">
                  <option value="">None</option>
                  <option value="Good">Good</option>
                  <option value="Better">Better</option>
                  <option value="Best">Best</option>
                </select>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingProduct(null)} className="px-4 py-2 text-xs font-bold text-neutral-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={editSaving} className="flex items-center gap-2 px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold rounded-lg transition-colors disabled:opacity-50">
                  {editSaving ? "Saving..." : <><FiCheck /> Save Changes</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
