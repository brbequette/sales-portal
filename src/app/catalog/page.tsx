"use client"


import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useZoho } from "@/components/ZohoProvider"
import { useProductModal } from "@/components/ProductModalProvider"
import { EntityPopout } from "@/components/EntityPopout"
import { 
  FiSearch, FiPackage, FiBox, FiInfo, FiDollarSign, FiTag, FiEdit2, FiX, FiCheck
} from "react-icons/fi"
import imageMapData from "@/lib/image-map.json"
import { isAdministratorRole } from "@/lib/roles"

type SortKey = "sku" | "name" | "vendor" | "classification" | "price" | "stock"

export default function ProductCatalogPage() {
  const { isInitialized } = useZoho()
  const { showProduct } = useProductModal()
  const { data: session } = useSession()
  const isAdministrator = isAdministratorRole(session?.user?.role)
  
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("All")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  
  // New Filters
  const [filterSize, setFilterSize] = useState("")
  const [filterApp, setFilterApp] = useState("")
  const [filterMfg, setFilterMfg] = useState("")
  const [filterVendor, setFilterVendor] = useState("")
  const [filterProductType, setFilterProductType] = useState("")
  const [filterToolType, setFilterToolType] = useState("")
  const [filterEquipment, setFilterEquipment] = useState("")
  const [filterMaterial, setFilterMaterial] = useState("")

  const [showInactive, setShowInactive] = useState(false)
  const [onlyWithImages, setOnlyWithImages] = useState(false)
  
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState("")
  
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [editSaving, setEditSaving] = useState(false)

  const productCategories = [
    "All",
    "Saw Blades",
    "Core Bits",
    "Cup Wheels & Grinding",
    "Tile & Porcelain Blades",
    "Turbo Blades",
    "Tuck Point Blades",
    "Stone & Polishing",
    "Zenesis & Premium Series"
  ]

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

  useEffect(() => {
    setCurrentPage(1)
  }, [search, category, filterSize, filterApp, filterMfg, filterVendor, filterProductType, filterToolType, filterEquipment, filterMaterial, showInactive, onlyWithImages])

  const parseProductDescription = (desc: string | null) => {
    if (!desc) return { text: "--", cost: null, vendor: null, retail: null, pertinentInfo: null, image: null, status: "active" }
    try {
      const parsed = JSON.parse(desc)
      if (parsed && typeof parsed === "object") {
        return {
          text: parsed.text || "--",
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

  const getProductImage = (_name: string, sku: string, imageUrl?: string | null) => {
    if (imageUrl) return imageUrl
    if (!sku) return null
    const skuUpper = sku.trim().toUpperCase()
    const map = imageMapData as Record<string, { image?: string }>
    
    // 1. Exact match
    if (map[skuUpper]?.image) {
      return map[skuUpper].image
    }
    
    // 2. Cleaned stem match (strip -WHS, (1), etc.)
    const cleanSku = skuUpper.replace(/-WHS$/i, "").replace(/\s*\([\w\s,\./]+\)\s*\d*$/i, "").trim()
    if (map[cleanSku]?.image) {
      return map[cleanSku].image
    }
    
    // 3. Prefix matching against keys in map
    for (const key of Object.keys(map)) {
      if (skuUpper.startsWith(key) || key.startsWith(skuUpper)) {
        if (map[key]?.image) return map[key].image
      }
    }
    
    // Do not probe Zoho once per rendered row. Unknown images remain empty
    // until the product sync stores a URL or image-map entry locally.
    return null
  }

  // Derive filter options dynamically
  const sizes = Array.from(new Set(products.map(p => p.size).filter(Boolean))).sort()
  const apps = Array.from(new Set(products.map(p => p.application).filter(Boolean))).sort()
  const mfgs = Array.from(new Set(products.map(p => p.manufacturer).filter(Boolean))).sort()
  const productTypes = Array.from(new Set(products.map(p => p.productType).filter(Boolean))).sort()
  const toolTypes = Array.from(new Set(products.map(p => p.toolType).filter(Boolean))).sort()
  const equipmentOptions = Array.from(new Set(products.map(p => p.equipment).filter(Boolean))).sort()
  const materialOptions = Array.from(new Set(products.flatMap(p => Array.isArray(p.materials) ? p.materials : []).filter(Boolean))).sort()
  const vendors = Array.from(new Set(products.map(p => {
    const parsed = parseProductDescription(p.description)
    return p.vendor || parsed.vendor
  }).filter(Boolean))).sort()

  const filteredProducts = products.filter(p => {
    if (p.giftItem) return false
    const parsed = parseProductDescription(p.description)
    const searchable = [
      p.sku, p.name, parsed.text, p.category, p.application, p.productType,
      p.toolType, p.equipment, ...(Array.isArray(p.materials) ? p.materials : []),
      ...(p.attributes && typeof p.attributes === "object" ? Object.entries(p.attributes).flatMap(([key, value]) => [key, String(value)]) : []),
    ].filter(Boolean).join(" ").toLowerCase()
    const matchesSearch = searchable.includes(search.toLowerCase())
    
    const matchesCategory = category === "All" || p.category === category
    const isActive = parsed.status !== "inactive"
    
    const matchesSize = !filterSize || p.size === filterSize
    const matchesApp = !filterApp || p.application === filterApp
    const matchesMfg = !filterMfg || p.manufacturer === filterMfg
    const matchesVendor = !filterVendor || p.vendor === filterVendor || parsed.vendor === filterVendor
    const matchesProductType = !filterProductType || p.productType === filterProductType
    const matchesToolType = !filterToolType || p.toolType === filterToolType
    const matchesEquipment = !filterEquipment || p.equipment === filterEquipment
    const matchesMaterial = !filterMaterial || (Array.isArray(p.materials) && p.materials.includes(filterMaterial))

    const hasImg = Boolean(
      getProductImage(p.name, p.sku, p.imageUrl) ||
      (parsed.image && !parsed.image.includes("placeholder") && parsed.image.startsWith("/product-images/"))
    )
    const matchesImage = !onlyWithImages || hasImg

    return matchesSearch && matchesCategory && (showInactive || isActive) && matchesSize && matchesApp && matchesMfg && matchesVendor && matchesProductType && matchesToolType && matchesEquipment && matchesMaterial && matchesImage
  }).sort((a, b) => {
    const parsedA = parseProductDescription(a.description)
    const parsedB = parseProductDescription(b.description)
    const values: Record<SortKey, [string | number, string | number]> = {
      sku: [a.sku || "", b.sku || ""],
      name: [a.name || "", b.name || ""],
      vendor: [a.vendor || parsedA.vendor || "", b.vendor || parsedB.vendor || ""],
      classification: [a.toolType || a.application || a.size || a.qualityTier || "", b.toolType || b.application || b.size || b.qualityTier || ""],
      price: [Number(a.price) || 0, Number(b.price) || 0],
      stock: [Number(a.stock) || 0, Number(b.stock) || 0]
    }
    const [left, right] = values[sortKey]
    const result = typeof left === "number"
      ? left - Number(right)
      : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" })
    return sortDirection === "asc" ? result : -result
  })

  const changeSort = (key: SortKey) => {
    setCurrentPage(1)
    if (sortKey === key) setSortDirection(current => current === "asc" ? "desc" : "asc")
    else {
      setSortKey(key)
      setSortDirection("asc")
    }
  }

  const sortHeader = (key: SortKey, label: string, className = "") => (
    <button type="button" onClick={() => changeSort(key)} className={`inline-flex items-center gap-1 hover:text-white ${className}`}>
      {label}<span aria-hidden="true">{sortKey === key ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
    </button>
  )

  // Group by Quality Tier if Application or Size is selected
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize))
  const visiblePage = Math.min(currentPage, totalPages)
  const pageStart = (visiblePage - 1) * pageSize
  const paginatedProducts = filteredProducts.slice(pageStart, pageStart + pageSize)
  const shouldGroup = filterApp !== "" || filterSize !== ""
  const groupedProducts: Record<string, any[]> = shouldGroup ? {
    "Best": paginatedProducts.filter(p => p.qualityTier === "Best"),
    "Better": paginatedProducts.filter(p => p.qualityTier === "Better"),
    "Good": paginatedProducts.filter(p => p.qualityTier === "Good"),
    "Uncategorized": paginatedProducts.filter(p => !p.qualityTier || !["Good", "Better", "Best"].includes(p.qualityTier))
  } : { "All Products": paginatedProducts }

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

  const renderTable = (items: any[], title?: string) => (
    <div key={title} className="mb-8 glass-panel border border-white/10 rounded-xl overflow-x-auto shadow-2xl">
      {title && title !== "All Products" && (
        <div className="glass-panel px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">{title}</h2>
          <span className="text-xs text-neutral-500 font-semibold">{items.length} items</span>
        </div>
      )}
      <table className="w-full text-left text-xs min-w-[800px]">
        <thead className="bg-neutral-800/80 text-neutral-400 border-b border-white/10 uppercase tracking-wider text-[9px] font-bold">
          <tr>
            <th className="p-4 w-28">{sortHeader("sku", "SKU")}</th>
            <th className="p-4">{sortHeader("name", "Product Name")}</th>
            <th className="p-4">{sortHeader("vendor", "Vendor / Mfg")}</th>
            <th className="p-4">{sortHeader("classification", "Classification")}</th>
            <th className="p-4 text-right">{sortHeader("price", "Price", "justify-end")}</th>
            {isAdministrator && <th className="p-4 text-right">{sortHeader("stock", "Stock", "justify-end")}</th>}
            {isAdministrator && <th className="p-4 text-right w-16"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {items.map(p => {
            const parsed = parseProductDescription(p.description)
            const isInactive = parsed.status === "inactive"
            return (
              <tr 
                key={p.id} 
                onClick={() => setSelectedProductId(p.id)}
                className="hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/30 transition-colors cursor-pointer"
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
                    <div className="w-8 h-8 rounded-lg glass-panel border border-neutral-700/50 flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {(() => {
                        const mapImage = getProductImage(p.name, p.sku, p.imageUrl)
                        const descImage = parsed.image && !parsed.image.includes('placeholder') && parsed.image.startsWith('/product-images/') ? parsed.image : null
                        const finalImage = mapImage || descImage
                        return finalImage ? (
                          <img 
                            src={finalImage} 
                            alt={p.name} 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <FiPackage className="text-neutral-500" size={14} />
                        )
                      })()}
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
                  <div>{p.vendor || parsed.vendor || "--"}</div>
                  <div className="text-[9px] text-neutral-500 uppercase mt-0.5">{p.manufacturer || ""}</div>
                </td>
                <td className="p-4 text-neutral-400">
                  {p.size && <span className="bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded text-[10px] mr-1">{p.size}</span>}
                  {p.application && <span className="bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded text-[10px] mr-1">{p.application}</span>}
                  {p.toolType && <span className="bg-blue-950/50 text-blue-300 px-1.5 py-0.5 rounded text-[10px] mr-1">{p.toolType}</span>}
                  {p.equipment && <span className="bg-emerald-950/50 text-emerald-300 px-1.5 py-0.5 rounded text-[10px] mr-1">{p.equipment}</span>}
                  {p.qualityTier && <span className="bg-neutral-800 text-amber-300 px-1.5 py-0.5 rounded text-[10px]">{p.qualityTier}</span>}
                </td>
                <td className="p-4 text-right text-white font-bold">${parseFloat(p.price || "0").toFixed(2)}</td>
                {isAdministrator && <td className="p-4 text-right">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    p.stock > 50 ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20' :
                    p.stock > 10 ? 'bg-amber-950/40 text-amber-400 border border-amber-500/20' :
                    'bg-red-950/40 text-red-400 border border-red-500/20'
                  }`}>
                    {p.stock} in stock
                  </span>
                </td>}
                {isAdministrator && <td className="p-4 text-right">
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
                      aria-label={`Edit ${p.name}`}
                      onClick={(e) => { e.stopPropagation(); setEditingProduct(p); }}
                      className="p-1.5 rounded bg-neutral-800 text-neutral-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                    >
                      <FiEdit2 size={12} />
                    </button>
                  </div>
                </td>}
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

  // Keep every render on the same component execution path before returning.
  // React 19's production transforms can allocate internal hooks for JSX below;
  // returning before this table renderer is initialized caused hook error #300
  // when the initial loading state changed to the populated catalog state.
  if (!isInitialized || (loading && products.length === 0)) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-black/20 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-neutral-400 text-sm">Loading Product Catalog...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-content">
      {/* ─── Header ─────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-lg">
            💎
          </div>
          <div>
            <h1 className="page-title">Product Catalog</h1>
            <p className="page-subtitle">Browse, filter, and manage all products</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAdministrator && syncProgress && (
            <span className="text-[10px] text-neutral-400 font-semibold animate-pulse">{syncProgress}</span>
          )}
          {isAdministrator && <button
            onClick={handleSyncWithZoho}
            disabled={syncing}
            className="td-btn td-btn-ghost td-btn-sm"
          >
            <svg className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3m-3-5v12" />
            </svg>
            {syncing ? "Syncing..." : "Sync from Zoho"}
          </button>}
        </div>
      </div>

      {/* ─── Body ───────────────────────────────────── */}
      <div className="page-body animate-fade-in space-y-4">
        
        {/* Search & Basic Filters View */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative max-w-md w-full">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
            <input 
              type="text" 
              placeholder="Search SKU, name, type, equipment, material, attributes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full glass-panel border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <input 
                type="checkbox" 
                id="onlyWithImages" 
                checked={onlyWithImages} 
                onChange={e => setOnlyWithImages(e.target.checked)} 
                className="rounded border-neutral-700 glass-panel text-emerald-500 focus:ring-emerald-500 cursor-pointer"
              />
              <label htmlFor="onlyWithImages" className="cursor-pointer select-none text-xs font-bold uppercase tracking-wide text-amber-400">Products with Images</label>
            </div>
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <input 
                type="checkbox" 
                id="showInactive" 
                checked={showInactive} 
                onChange={e => setShowInactive(e.target.checked)} 
                className="rounded border-neutral-700 glass-panel text-emerald-500 focus:ring-emerald-500 cursor-pointer"
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
                  : 'glass-panel text-neutral-400 hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 hover:text-white border border-white/10'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Advanced Filters */}
        <div className="glass-panel border border-white/10 rounded-xl p-4 flex flex-wrap gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Product Type</label>
            <select value={filterProductType} onChange={e => setFilterProductType(e.target.value)} className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-emerald-500 outline-none">
              <option value="">All Product Types</option>
              {productTypes.map(value => <option key={String(value)} value={String(value)}>{String(value)}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Tool Type</label>
            <select value={filterToolType} onChange={e => setFilterToolType(e.target.value)} className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-emerald-500 outline-none">
              <option value="">All Tool Types</option>
              {toolTypes.map(value => <option key={String(value)} value={String(value)}>{String(value)}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Equipment</label>
            <select value={filterEquipment} onChange={e => setFilterEquipment(e.target.value)} className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-emerald-500 outline-none">
              <option value="">All Equipment</option>
              {equipmentOptions.map(value => <option key={String(value)} value={String(value)}>{String(value)}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Material</label>
            <select value={filterMaterial} onChange={e => setFilterMaterial(e.target.value)} className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-emerald-500 outline-none">
              <option value="">All Materials</option>
              {materialOptions.map(value => <option key={String(value)} value={String(value)}>{String(value)}</option>)}
            </select>
          </div>
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
          {(filterSize || filterApp || filterVendor || filterMfg || filterProductType || filterToolType || filterEquipment || filterMaterial) && (
            <div className="flex items-end">
              <button onClick={() => { setFilterSize(""); setFilterApp(""); setFilterVendor(""); setFilterMfg(""); setFilterProductType(""); setFilterToolType(""); setFilterEquipment(""); setFilterMaterial(""); }} className="text-xs text-neutral-400 hover:text-white px-2 py-1.5">Clear Filters</button>
            </div>
          )}
        </div>

        {shouldGroup && (
          <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-lg">
            <strong>Grouping Active:</strong> Showing products grouped by Good/Better/Best tiers because an Application or Size filter is applied.
          </div>
        )}

        {/* Products Rendering */}
        {filteredProducts.length === 0 ? (
          <div className="modern-card flex min-h-56 flex-col items-center justify-center p-10 text-center">
            <FiPackage size={30} className="mb-3 text-sky-400" />
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-white">No products match</h2>
            <p className="mt-2 max-w-md text-xs text-neutral-500">Try a broader search or clear one of the active product filters.</p>
          </div>
        ) : shouldGroup ? (
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

        {filteredProducts.length > 0 && (
          <div className="glass-panel flex flex-col gap-4 rounded-xl border border-sky-500/15 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-mono text-[11px] uppercase tracking-wider text-neutral-500">
              Showing <span className="font-bold text-sky-300">{pageStart + 1}–{Math.min(pageStart + pageSize, filteredProducts.length)}</span> of <span className="font-bold text-white">{filteredProducts.length}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="mr-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                Rows
                <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setCurrentPage(1) }} className="rounded-lg border border-white/10 bg-neutral-900 px-2 py-1.5 text-xs text-white">
                  {[25, 50, 100, 200].map(size => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <button type="button" disabled={visiblePage === 1} onClick={() => setCurrentPage(Math.max(1, visiblePage - 1))} className="td-btn td-btn-ghost td-btn-sm disabled:opacity-30">← Prev</button>
              {Array.from({ length: totalPages }, (_, index) => index + 1)
                .filter(page => page === 1 || page === totalPages || Math.abs(page - visiblePage) <= 1)
                .map((page, index, pages) => <span key={page} className="contents">
                  {index > 0 && page - pages[index - 1] > 1 && <span className="px-1 text-neutral-600">…</span>}
                  <button type="button" onClick={() => setCurrentPage(page)} aria-current={page === visiblePage ? "page" : undefined} className={`h-8 min-w-8 rounded-lg border px-2 text-xs font-bold transition-all ${page === visiblePage ? "border-sky-400/60 bg-sky-500/20 text-sky-200 shadow-[0_0_16px_rgba(24,168,255,.16)]" : "border-white/10 bg-black/20 text-neutral-400 hover:border-sky-500/30 hover:text-white"}`}>{page}</button>
                </span>)}
              <button type="button" disabled={visiblePage === totalPages} onClick={() => setCurrentPage(Math.min(totalPages, visiblePage + 1))} className="td-btn td-btn-ghost td-btn-sm disabled:opacity-30">Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* Entity Popout */}
      {selectedProductId && (
        <EntityPopout
          entityType="product"
          entityId={selectedProductId}
          onClose={() => setSelectedProductId(null)}
        />
      )}

      {/* Edit Modal */}
      {isAdministrator && editingProduct && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between glass-panel">
              <h2 className="text-sm font-bold text-white">Edit Classifications: {editingProduct.sku}</h2>
              <button aria-label="Close product editor" onClick={() => setEditingProduct(null)} className="text-neutral-400 hover:text-white"><FiX /></button>
            </div>
            <form onSubmit={handleSaveProduct} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Application</label>
                <input type="text" value={editingProduct.application || ""} onChange={e => setEditingProduct({...editingProduct, application: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none" placeholder="e.g. Concrete, Asphalt, Polishing" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Size</label>
                <input type="text" value={editingProduct.size || ""} onChange={e => setEditingProduct({...editingProduct, size: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none" placeholder="e.g. 14, 4, 5-step" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Manufacturer</label>
                  <input type="text" value={editingProduct.manufacturer || ""} onChange={e => setEditingProduct({...editingProduct, manufacturer: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Vendor</label>
                  <input type="text" value={editingProduct.vendor || ""} onChange={e => setEditingProduct({...editingProduct, vendor: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Quality Tier</label>
                <select value={editingProduct.qualityTier || ""} onChange={e => setEditingProduct({...editingProduct, qualityTier: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none">
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
        </div>, document.body
      )}
    </div>
  )
}

