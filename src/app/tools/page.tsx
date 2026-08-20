"use client"


import { useState, useEffect } from "react"
import Link from "next/link"
import { useZoho } from "@/components/ZohoProvider"
import { useProductModal } from "@/components/ProductModalProvider"
import { 
  FiSearch, FiFileText, FiImage, FiVideo, FiDownload, FiShare2, 
  FiGrid, FiList, FiPlus, FiEdit2, FiTrash2, FiGlobe, FiCheck, FiPackage, FiBox, FiInfo, FiDollarSign, FiTag
} from "react-icons/fi"
import { localGet, localSet, localDel, TTL } from "@/lib/dataCache"

interface MediaAsset {
  id: string
  title: string
  type: string
  category: string
  url: string
  size: string
}

export default function ToolsRepository() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const { showProduct } = useProductModal()
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeCategory, setActiveCategory] = useState("All")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [assetSort, setAssetSort] = useState<"title" | "category" | "type" | "size">("title")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Products State
  const [activeTab, setActiveTab] = useState<"media" | "products">("media")
  const [products, setProducts] = useState<any[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productSearch, setProductSearch] = useState("")
  const [productCategory, setProductCategory] = useState("All")
  const [productSort, setProductSort] = useState<"name" | "sku" | "category" | "price-desc" | "price-asc">("name")

  const parseProductDescription = (desc: string | null) => {
    if (!desc) return { text: "--", cost: null, vendor: null, retail: null, pertinentInfo: null, image: null }
    try {
      const parsed = JSON.parse(desc)
      if (parsed && typeof parsed === "object") {
        return {
          text: parsed.text || "--",
          cost: parsed.cost !== undefined ? parsed.cost : null,
          vendor: parsed.vendor || null,
          retail: parsed.retail !== undefined ? parsed.retail : null,
          pertinentInfo: parsed.pertinentInfo || null,
          image: parsed.image || null
        }
      }
    } catch (e) {
      // Ignore and treat as plain text
    }
    return { text: desc, cost: null, vendor: null, retail: null, pertinentInfo: null, image: null }
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

  // Admin Forms State
  const [showModal, setShowModal] = useState(false)
  const [editingAsset, setEditingAsset] = useState<MediaAsset | null>(null)
  const [formTitle, setFormTitle] = useState("")
  const [formType, setFormType] = useState("PDF")
  const [formCategory, setFormCategory] = useState("Brochures")
  const [formUrl, setFormUrl] = useState("")
  const [formSize, setFormSize] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  const categories = ["All", "Brochures", "Spec Sheets", "Social Media", "Training", "Branding"]
  const assetTypes = ["PDF", "Image", "Video", "ZIP", "Link"]
  const productCategories = ["All", "Blades", "Polishing", "Core Bits", "Grinding"]

  const isAdmin = currentUser?.role?.toLowerCase().includes("admin") || 
                  currentUser?.role === "Administrator" || 
                  currentUser?.role === "Admin"

  // Fetch Assets (1hr local cache — media assets change rarely)
  const fetchAssets = async (force = false) => {
    const cached = !force && localGet<MediaAsset[]>('media-assets', TTL.ONE_HOUR)
    if (cached) { setAssets(cached); setLoading(false); return }
    setLoading(true)
    try {
      const res = await fetch("/api/get-media-assets")
      const data = await res.json()
      if (data.success) {
        setAssets(data.assets)
        localSet('media-assets', data.assets)
      }
    } catch (e) {
      console.error("Error fetching media assets:", e)
    } finally {
      setLoading(false)
    }
  }

  // Fetch Products (24hr local cache — product catalog changes rarely)
  const fetchProducts = async (force = false) => {
    const cached = !force && localGet<any[]>('products-catalog', TTL.ONE_DAY)
    if (cached) { setProducts(cached); return }
    setProductsLoading(true)
    try {
      const res = await fetch("/api/get-products")
      const data = await res.json()
      if (data.success) {
        setProducts(data.products)
        localSet('products-catalog', data.products)
      }
    } catch (e) {
      console.error("Error fetching products:", e)
    } finally {
      setProductsLoading(false)
    }
  }

  useEffect(() => {
    fetchAssets()
  }, [])

  useEffect(() => {
    if (activeTab === "products" && products.length === 0) {
      fetchProducts()
    }
  }, [activeTab, products.length])

  // 3. Asset Action Handlers
  const handleDownload = (asset: MediaAsset) => {
    window.open(asset.url, "_blank", "noopener,noreferrer")
  }

  const handleCopyLink = async (asset: MediaAsset) => {
    try {
      await navigator.clipboard.writeText(asset.url)
      setCopiedId(asset.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error("Failed to copy link:", err)
    }
  }

  // 4. Admin CRUD Handlers
  const openAddModal = () => {
    setEditingAsset(null)
    setFormTitle("")
    setFormType("PDF")
    setFormCategory("Brochures")
    setFormUrl("")
    setFormSize("1.0 MB")
    setErrorMsg("")
    setShowModal(true)
  }

  const openEditModal = (asset: MediaAsset) => {
    setEditingAsset(asset)
    setFormTitle(asset.title)
    setFormType(asset.type)
    setFormCategory(asset.category)
    setFormUrl(asset.url)
    setFormSize(asset.size)
    setErrorMsg("")
    setShowModal(true)
  }

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle || !formUrl) {
      setErrorMsg("Please fill out all required fields.")
      return
    }

    setSubmitting(true)
    setErrorMsg("")

    try {
      const payload = {
        id: editingAsset?.id,
        title: formTitle,
        type: formType,
        category: formCategory,
        url: formUrl,
        size: formSize || "1.0 MB",
        userRole: currentUser?.role || "Sales Representative"
      }

      const method = editingAsset ? "PUT" : "POST"
      const res = await fetch("/api/manage-media-asset", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (data.success) {
        setShowModal(false)
        localDel('media-assets') // bust cache so fresh list reloads
        fetchAssets(true)
      } else {
        setErrorMsg(data.message || "An error occurred while saving.")
      }
    } catch (err: any) {
      setErrorMsg("Failed to save asset: " + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteAsset = async (asset: MediaAsset) => {
    if (!confirm(`Are you sure you want to delete "${asset.title}"?`)) return

    try {
      const res = await fetch("/api/manage-media-asset", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: asset.id,
          userRole: currentUser?.role || "Sales Representative"
        })
      })

      const data = await res.json()
      if (data.success) {
        localDel('media-assets') // bust cache so fresh list reloads
        fetchAssets(true)
      } else {
        alert(data.message || "Failed to delete asset.")
      }
    } catch (err: any) {
      alert("Failed to delete asset: " + err.message)
    }
  }

  // 5. Filtering
  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.title.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = activeCategory === "All" || asset.category === activeCategory
    return matchesSearch && matchesCategory
  }).sort((a, b) => String(a[assetSort] || "").localeCompare(String(b[assetSort] || ""), undefined, { numeric: true }))

  const filteredProducts = products.filter(p => {
    const parsed = parseProductDescription(p.description)
    const matchesSearch = p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
                          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                          parsed.text.toLowerCase().includes(productSearch.toLowerCase()) ||
                          (parsed.vendor && parsed.vendor.toLowerCase().includes(productSearch.toLowerCase())) ||
                          (parsed.pertinentInfo && parsed.pertinentInfo.toLowerCase().includes(productSearch.toLowerCase()))
    const matchesCategory = productCategory === "All" || p.category === productCategory
    return matchesSearch && matchesCategory
  }).sort((a, b) => {
    if (productSort === "price-desc" || productSort === "price-asc") {
      const aPrice = Number(parseProductDescription(a.description).retail || 0)
      const bPrice = Number(parseProductDescription(b.description).retail || 0)
      return productSort === "price-asc" ? aPrice - bPrice : bPrice - aPrice
    }
    return String(a[productSort] || "").localeCompare(String(b[productSort] || ""), undefined, { numeric: true })
  })

  // Helper for rendering file icons
  const getIcon = (type: string) => {
    const t = type.toUpperCase()
    if (t === "PDF") return <FiFileText className="text-red-400" />
    if (t === "IMAGE" || t === "PNG" || t === "JPG") return <FiImage className="text-blue-400" />
    if (t === "VIDEO" || t === "MP4") return <FiVideo className="text-amber-400" />
    if (t === "LINK" || t === "URL") return <FiGlobe className="text-purple-400" />
    return <FiFileText className="text-emerald-400" />
  }

  return (
    <div className="page-content">

      {/* ─── Header ─────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center">
            <FiPackage className="text-purple-400" size={17} />
          </div>
          <div>
            <h1 className="page-title">Tools & Media Repository</h1>
            <p className="page-subtitle">Brochures, spec sheets, product catalog, and branded assets</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="glass-panel rounded-xl p-0.5 flex border border-white/10">
            {(["media", "products"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === tab
                    ? "bg-orange-500/20 text-orange-300 border border-orange-500/25"
                    : "text-neutral-500 hover:text-white"
                }`}
              >
                {tab === "media" ? "📁 Media" : "📦 Products"}
              </button>
            ))}
          </div>
          {isAdmin && activeTab === "media" && (
            <button onClick={openAddModal} className="td-btn td-btn-primary td-btn-sm">
              <FiPlus size={13} /> Add Asset
            </button>
          )}
        </div>
      </div>

      {/* ─── Body ───────────────────────────────────── */}
      <div className="page-body animate-fade-in space-y-4">

        {/* MEDIA TAB */}
        {activeTab === "media" && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="relative flex-1 max-w-xs">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
                <input type="text" placeholder="Search assets..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="td-input pl-9" />
              </div>
              <div className="flex items-center gap-2">
                <select aria-label="Sort media assets" value={assetSort} onChange={(event) => setAssetSort(event.target.value as typeof assetSort)} className="td-select text-xs">
                  <option value="title">Title A–Z</option><option value="category">Category</option><option value="type">File type</option><option value="size">File size</option>
                </select>
                <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-neutral-600">{filteredAssets.length} assets</span>
                <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider hidden sm:inline">{currentUser?.role || "Sales Rep"}</span>
                <div className="glass-panel rounded-lg p-0.5 flex border border-white/10">
                  <button onClick={() => setViewMode("grid")} className={`p-2 rounded ${viewMode === "grid" ? "bg-neutral-800 text-orange-400" : "text-neutral-500 hover:text-white"}`} title="Grid"><FiGrid size={14} /></button>
                  <button onClick={() => setViewMode("list")} className={`p-2 rounded ${viewMode === "list" ? "bg-neutral-800 text-orange-400" : "text-neutral-500 hover:text-white"}`} title="List"><FiList size={14} /></button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)} className={`filter-chip whitespace-nowrap ${activeCategory === cat ? "filter-chip-active" : ""}`}>{cat}</button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : filteredAssets.length === 0 ? (
              <div className="p-16 text-center border border-dashed border-white/10 rounded-2xl">
                <FiSearch className="mx-auto text-neutral-700 mb-3" size={36} />
                <p className="text-neutral-500 text-sm">No assets match your criteria.</p>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredAssets.map(asset => (
                  <div key={asset.id} className="modern-card group flex flex-col overflow-hidden hover:-translate-y-0.5 transition-all duration-200">
                    <div className="h-24 flex items-center justify-center text-3xl relative border-b border-white/8 bg-black/20">
                      {getIcon(asset.type)}
                      <div className="absolute top-2 right-2 bg-neutral-900 text-[9px] font-bold px-2 py-0.5 rounded-md text-neutral-400 border border-white/10">{asset.type}</div>
                    </div>
                    <div className="p-3.5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="text-[10px] text-orange-400 font-bold uppercase tracking-wider mb-1">{asset.category}</div>
                        <h3 className="text-xs font-bold text-white line-clamp-2">{asset.title}</h3>
                      </div>
                      <div className="pt-3 mt-2 border-t border-white/8 flex items-center justify-between">
                        <span className="text-[10px] text-neutral-600">{asset.size}</span>
                        <div className="flex gap-1">
                          <button onClick={() => handleDownload(asset)} className="p-1.5 rounded-lg bg-neutral-900 hover:bg-emerald-700/50 text-neutral-400 hover:text-white transition-colors"><FiDownload size={12} /></button>
                          <button onClick={() => handleCopyLink(asset)} className="p-1.5 rounded-lg bg-neutral-900 hover:bg-blue-700/50 text-neutral-400 hover:text-white transition-colors">
                            {copiedId === asset.id ? <FiCheck size={12} className="text-emerald-400" /> : <FiShare2 size={12} />}
                          </button>
                          {isAdmin && (<>
                            <button onClick={() => openEditModal(asset)} className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-700 text-neutral-500 hover:text-white transition-colors"><FiEdit2 size={12} /></button>
                            <button onClick={() => handleDeleteAsset(asset)} className="p-1.5 rounded-lg bg-neutral-900 hover:bg-red-900/50 text-neutral-500 hover:text-red-400 transition-colors"><FiTrash2 size={12} /></button>
                          </>)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="td-table-wrapper">
                <table className="td-table">
                  <thead><tr>
                    <th className="td-th">Name</th><th className="td-th">Category</th><th className="td-th">Type</th><th className="td-th">Size</th><th className="td-th text-right">Actions</th>
                  </tr></thead>
                  <tbody>
                    {filteredAssets.map(asset => (
                      <tr key={asset.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className="td-td"><div className="flex items-center gap-3"><div className="text-base shrink-0">{getIcon(asset.type)}</div><span className="font-semibold text-white truncate max-w-xs">{asset.title}</span></div></td>
                        <td className="td-td text-orange-400 font-semibold">{asset.category}</td>
                        <td className="td-td text-neutral-400">{asset.type}</td>
                        <td className="td-td text-neutral-500">{asset.size}</td>
                        <td className="td-td text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => handleDownload(asset)} className="p-1.5 rounded-lg bg-neutral-900 hover:bg-emerald-700/50 text-neutral-400 hover:text-white transition-colors"><FiDownload size={12} /></button>
                            <button onClick={() => handleCopyLink(asset)} className="p-1.5 rounded-lg bg-neutral-900 hover:bg-blue-700/50 text-neutral-400 hover:text-white transition-colors">{copiedId === asset.id ? <FiCheck size={12} className="text-emerald-400" /> : <FiShare2 size={12} />}</button>
                            {isAdmin && (<><button onClick={() => openEditModal(asset)} className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-700 text-neutral-500 hover:text-white transition-colors"><FiEdit2 size={12} /></button><button onClick={() => handleDeleteAsset(asset)} className="p-1.5 rounded-lg bg-neutral-900 hover:bg-red-900/50 text-neutral-500 hover:text-red-400 transition-colors"><FiTrash2 size={12} /></button></>)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* PRODUCTS TAB */}
        {activeTab === "products" && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="relative flex-1 max-w-xs">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
                <input type="text" placeholder="Search products, SKU, vendor..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="td-input pl-9" />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {productCategories.map(cat => (
                  <button key={cat} onClick={() => setProductCategory(cat)} className={`filter-chip whitespace-nowrap ${productCategory === cat ? "filter-chip-active" : ""}`}>{cat}</button>
                ))}
              </div>
              <select aria-label="Sort products" value={productSort} onChange={(event) => setProductSort(event.target.value as typeof productSort)} className="td-select text-xs">
                <option value="name">Name A–Z</option><option value="sku">SKU</option><option value="category">Category</option><option value="price-desc">Highest price</option><option value="price-asc">Lowest price</option>
              </select>
              <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-neutral-600">{filteredProducts.length} products</span>
            </div>
            {productsLoading ? (
              <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : filteredProducts.length === 0 ? (
              <div className="p-16 text-center border border-dashed border-white/10 rounded-2xl">
                <FiBox className="mx-auto text-neutral-700 mb-3" size={36} /><p className="text-neutral-500 text-sm">No products found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProducts.map((product: any) => {
                  const parsed = parseProductDescription(product.description)
                  const img = getProductImage(product.name, product.sku)
                  return (
                    <div key={product.id} className="modern-card group flex flex-col overflow-hidden cursor-pointer hover:-translate-y-0.5 transition-all duration-200" onClick={() => showProduct(product)}>
                      <div className="h-28 flex items-center justify-center bg-black/30 border-b border-white/8 relative overflow-hidden">
                        {img ? <img src={img} alt={product.name} className="h-full w-full object-contain p-2 group-hover:scale-105 transition-transform duration-300" /> : <FiBox size={36} className="text-neutral-700" />}
                        {parsed.vendor && <div className="absolute top-2 left-2 bg-neutral-900/80 text-[9px] font-bold px-2 py-0.5 rounded-md text-neutral-400 border border-white/10">{parsed.vendor}</div>}
                      </div>
                      <div className="p-3.5 flex-1 flex flex-col gap-2">
                        <div>
                          <div className="text-[10px] text-orange-400 font-bold uppercase tracking-wider mb-0.5">{product.category || "General"}</div>
                          <h3 className="text-xs font-bold text-white line-clamp-2">{product.name}</h3>
                          <div className="text-[10px] text-neutral-600 font-mono mt-0.5">{product.sku}</div>
                        </div>
                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/8">
                          {parsed.retail != null && <div className="flex items-center gap-1 text-emerald-400 text-xs font-bold"><FiDollarSign size={11} />{Number(parsed.retail).toFixed(2)}</div>}
                          {parsed.pertinentInfo && <div className="flex items-center gap-1 text-neutral-500 text-[10px]"><FiInfo size={10} /><span className="truncate max-w-[100px]">{parsed.pertinentInfo}</span></div>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Admin Modal ────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="td-modal w-full max-w-md">
            <div className="td-modal-header">
              <h2 className="td-modal-title">{editingAsset ? "Edit Media Asset" : "Add New Media Asset"}</h2>
              <button onClick={() => setShowModal(false)} className="td-modal-close">✕</button>
            </div>
            <form onSubmit={handleSaveAsset} className="p-5 space-y-4">
              {errorMsg && <div className="bg-red-950/40 border border-red-500/25 text-red-400 text-xs p-3 rounded-xl">{errorMsg}</div>}
              <div>
                <label className="td-label">Asset Title *</label>
                <input type="text" required placeholder="e.g. Wet Core Drill Bit Guide" value={formTitle} onChange={e => setFormTitle(e.target.value)} className="td-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="td-label">Asset Type</label><select value={formType} onChange={e => setFormType(e.target.value)} className="td-select">{assetTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label className="td-label">Category</label><select value={formCategory} onChange={e => setFormCategory(e.target.value)} className="td-select">{categories.filter(c => c !== "All").map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="td-label">Asset URL *</label><input type="url" required placeholder="https://..." value={formUrl} onChange={e => setFormUrl(e.target.value)} className="td-input" /></div>
                <div><label className="td-label">Size Label</label><input type="text" placeholder="e.g. 2.4 MB" value={formSize} onChange={e => setFormSize(e.target.value)} className="td-input" /></div>
              </div>
              <div className="pt-3 border-t border-white/10 flex justify-end gap-2">
                <button type="button" onClick={() => setShowModal(false)} disabled={submitting} className="td-btn td-btn-ghost td-btn-sm">Cancel</button>
                <button type="submit" disabled={submitting} className="td-btn td-btn-primary td-btn-sm disabled:opacity-50">{submitting ? "Saving..." : "Save Asset"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
