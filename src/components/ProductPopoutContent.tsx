"use client"

import React, { useState, useEffect } from "react"
import { FiBox, FiImage, FiDollarSign, FiTag, FiTruck, FiInfo, FiActivity, FiSave, FiCheck, FiX, FiList } from "react-icons/fi"
import imageMapData from "@/lib/image-map.json"

export interface ProductPopoutContentProps {
  productId: string
  onClose: () => void
}

export function ProductPopoutContent({ productId, onClose }: ProductPopoutContentProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "edit" | "history">("overview")
  const [product, setProduct] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Edit state
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{type: "success"|"error", text: string} | null>(null)
  const [reactivating, setReactivating] = useState(false)

  const fetchProduct = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/get-products")
      const data = await res.json()
      if (data.success) {
        const found = data.products.find((p: any) => p.id === productId || p.sku === productId)
        if (found) {
          setProduct(found)
          setEditForm({
            name: found.name || "",
            price: found.price || 0,
            descriptionText: parseDescription(found.description).text || "",
            size: found.size || "",
            application: found.application || "",
            manufacturer: found.manufacturer || "",
            vendor: found.vendor || parseDescription(found.description).vendor || "",
            qualityTier: found.qualityTier || "",
            subjectToVig: !!found.subjectToVig,
            giftItem: !!found.giftItem,
            showOnWeb: found.showOnWeb !== false && !found.giftItem
          })
          fetchHistory(found.sku)
        } else {
          setError("Product not found")
        }
      } else {
        setError(data.error || "Failed to fetch products")
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async (sku: string) => {
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/get-product-purchases?sku=${encodeURIComponent(sku)}`)
      const data = await res.json()
      if (data.success) {
        setHistory(data.purchaseHistory || [])
      }
    } catch (err) {
      console.error("Error fetching history:", err)
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (productId) {
      fetchProduct()
    }
  }, [productId])

  const parseDescription = (desc: string | null) => {
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

  const getProductImage = (name: string, sku: string) => {
    if (!sku) return null
    const skuUpper = sku.trim().toUpperCase()
    const map = imageMapData as Record<string, { image?: string }>
    
    if (map[skuUpper]?.image) return map[skuUpper].image
    
    const cleanSku = skuUpper.replace(/-WHS$/i, "").replace(/\s*\([\w\s,\./]+\)\s*\d*$/i, "").trim()
    if (map[cleanSku]?.image) return map[cleanSku].image
    
    for (const key of Object.keys(map)) {
      if (skuUpper.startsWith(key) || key.startsWith(skuUpper)) {
        if (map[key]?.image) return map[key].image
      }
    }
    
    return `/api/zoho-image?sku=${encodeURIComponent(skuUpper)}`
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveMessage(null)
    try {
      const res = await fetch("/api/update-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id, ...editForm })
      })
      const data = await res.json()
      if (data.success) {
        setSaveMessage({ type: "success", text: `Saved! ${data.zohoSynced ? "Synced to Zoho." : "Local only."}` })
        fetchProduct()
      } else {
        setSaveMessage({ type: "error", text: data.error || "Save failed" })
      }
    } catch (err: any) {
      setSaveMessage({ type: "error", text: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleReactivate = async () => {
    if (!confirm(`Are you sure you want to reactivate ${product.sku} in Zoho?`)) return
    setReactivating(true)
    try {
      const res = await fetch("/api/reactivate-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: product.sku })
      })
      const data = await res.json()
      if (data.success) {
        alert("Product reactivated successfully in Zoho!")
        fetchProduct()
      } else {
        alert("Failed: " + data.error)
      }
    } catch (e) {
      alert("Error reactivating product.")
    } finally {
      setReactivating(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center text-white">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-neutral-400 text-sm">Loading product details...</p>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center text-white">
        <div className="text-red-500 mb-2"><FiX size={32} /></div>
        <p className="text-red-400 text-sm font-semibold">{error || "Product not found"}</p>
      </div>
    )
  }

  const parsedDesc = parseDescription(product.description)
  const isInactive = parsedDesc.status === "inactive"
  const finalImage = getProductImage(product.name, product.sku) || (parsedDesc.image && !parsedDesc.image.includes('placeholder') ? parsedDesc.image : null)

  const margin = parsedDesc.cost && product.price ? ((product.price - parsedDesc.cost) / product.price * 100).toFixed(1) : null

  return (
    <div className="flex flex-col h-full bg-[#0a0b0d] text-white">
      {/* Header Profile */}
      <div className="px-6 py-6 border-b border-white/10 bg-[#111316] shrink-0 flex items-start gap-6">
        <div className="w-24 h-24 rounded-xl glass-panel border border-white/10 flex-shrink-0 overflow-hidden flex items-center justify-center bg-black/50">
          {finalImage ? (
            <img src={finalImage} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <FiBox className="text-neutral-600" size={32} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold text-white truncate">{product.name}</h1>
            {isInactive && (
              <span className="bg-red-500/20 text-red-500 border border-red-500/30 text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider">Inactive</span>
            )}
          </div>
          <div className="font-mono text-orange-400 font-bold tracking-wide mb-3">{product.sku}</div>
          
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-1 rounded text-xs font-bold border ${product.stock > 50 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : product.stock > 10 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
              {product.stock} in stock
            </span>
            {product.category && (
              <span className="px-2 py-1 bg-neutral-800 text-neutral-300 rounded text-xs border border-white/5">{product.category}</span>
            )}
            {product.subjectToVig && (
              <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded text-xs font-bold">VIG Item</span>
            )}
            {product.giftItem && (
              <span className="px-2 py-1 bg-purple-500/20 text-purple-400 border border-purple-500/20 rounded text-xs font-bold">Gift Item</span>
            )}
            <span className={`px-2 py-1 rounded text-xs font-bold border ${product.showOnWeb ? 'bg-sky-500/20 text-sky-400 border-sky-500/20' : 'bg-neutral-800 text-neutral-400 border-white/10'}`}>
              {product.showOnWeb ? 'Shown on Web' : 'Hidden from Web'}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button onClick={() => setActiveTab("edit")} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded text-xs font-semibold border border-white/10 transition-colors">
            Edit Product
          </button>
          {isInactive && (
            <button onClick={handleReactivate} disabled={reactivating} className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs font-semibold transition-colors disabled:opacity-50">
              {reactivating ? "Reactivating..." : "Reactivate"}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 border-b border-white/10 flex gap-6 shrink-0 bg-[#111316]">
        <button onClick={() => setActiveTab("overview")} className={`py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === "overview" ? "border-orange-500 text-orange-400" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}>
          Overview
        </button>
        <button onClick={() => setActiveTab("edit")} className={`py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === "edit" ? "border-orange-500 text-orange-400" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}>
          Edit
        </button>
        <button onClick={() => setActiveTab("history")} className={`py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === "history" ? "border-orange-500 text-orange-400" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}>
          Purchase History
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10">
        
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-4">
              <div className="glass-panel border border-white/10 rounded-xl p-4">
                <div className="text-neutral-500 text-xs font-bold uppercase tracking-wider mb-1">Retail Price</div>
                <div className="text-2xl font-bold text-white">${parseFloat(product.price || 0).toFixed(2)}</div>
              </div>
              <div className="glass-panel border border-white/10 rounded-xl p-4">
                <div className="text-neutral-500 text-xs font-bold uppercase tracking-wider mb-1">Vendor Cost</div>
                <div className="text-2xl font-bold text-neutral-300">{parsedDesc.cost ? `$${parseFloat(parsedDesc.cost).toFixed(2)}` : "--"}</div>
              </div>
              <div className="glass-panel border border-white/10 rounded-xl p-4">
                <div className="text-neutral-500 text-xs font-bold uppercase tracking-wider mb-1">Margin</div>
                <div className={`text-2xl font-bold ${margin && parseFloat(margin) > 30 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {margin ? `${margin}%` : "--"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Classification */}
              <div className="glass-panel border border-white/10 rounded-xl overflow-hidden">
                <div className="px-4 py-2 border-b border-white/10 bg-white/5 font-bold text-xs text-neutral-400 uppercase tracking-wider">Classification & Sourcing</div>
                <div className="p-4 space-y-3">
                  <div>
                    <div className="text-[10px] text-neutral-500 uppercase font-bold">Category</div>
                    <div className="text-sm text-white">{product.category || "--"}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase font-bold">Size</div>
                      <div className="text-sm text-white">{product.size || "--"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase font-bold">Application</div>
                      <div className="text-sm text-white">{product.application || "--"}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase font-bold">Vendor</div>
                      <div className="text-sm text-white">{product.vendor || parsedDesc.vendor || "--"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase font-bold">Manufacturer</div>
                      <div className="text-sm text-white">{product.manufacturer || "--"}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-neutral-500 uppercase font-bold">Quality Tier</div>
                    <div className="text-sm text-amber-400 font-semibold">{product.qualityTier || "--"}</div>
                  </div>
                </div>
              </div>

              {/* Description & Specs */}
              <div className="glass-panel border border-white/10 rounded-xl overflow-hidden flex flex-col">
                <div className="px-4 py-2 border-b border-white/10 bg-white/5 font-bold text-xs text-neutral-400 uppercase tracking-wider">Details & Specs</div>
                <div className="p-4 flex-1 space-y-4">
                  <div>
                    <div className="text-[10px] text-neutral-500 uppercase font-bold mb-1">Description</div>
                    <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">{parsedDesc.text}</p>
                  </div>
                  {parsedDesc.pertinentInfo && (
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase font-bold mb-1">Pertinent Info</div>
                      <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap bg-white/5 p-3 rounded-lg border border-white/5">{parsedDesc.pertinentInfo}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "edit" && (
          <form onSubmit={handleSave} className="max-w-2xl space-y-6">
            {saveMessage && (
              <div className={`p-3 rounded-lg text-sm font-bold border ${saveMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                {saveMessage.text}
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Product Name</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 outline-none transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Price ($)</label>
                <input type="number" step="0.01" value={editForm.price} onChange={e => setEditForm({...editForm, price: parseFloat(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 outline-none transition-colors" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Description Text</label>
              <textarea value={editForm.descriptionText} onChange={e => setEditForm({...editForm, descriptionText: e.target.value})} rows={4} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 outline-none transition-colors resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Size</label>
                <input type="text" value={editForm.size} onChange={e => setEditForm({...editForm, size: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 outline-none transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Application</label>
                <input type="text" value={editForm.application} onChange={e => setEditForm({...editForm, application: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 outline-none transition-colors" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Manufacturer</label>
                <input type="text" value={editForm.manufacturer} onChange={e => setEditForm({...editForm, manufacturer: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 outline-none transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Vendor</label>
                <input type="text" value={editForm.vendor} onChange={e => setEditForm({...editForm, vendor: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 outline-none transition-colors" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Quality Tier</label>
                <select value={editForm.qualityTier} onChange={e => setEditForm({...editForm, qualityTier: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 outline-none transition-colors">
                  <option value="">None</option>
                  <option value="Good">Good</option>
                  <option value="Better">Better</option>
                  <option value="Best">Best</option>
                </select>
              </div>
              <div className="flex flex-col gap-3 pt-5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editForm.subjectToVig} onChange={e => setEditForm({...editForm, subjectToVig: e.target.checked})} className="rounded bg-black/40 border-white/10 text-emerald-500 focus:ring-emerald-500" />
                  <span className="text-sm font-semibold text-neutral-300">Subject to VIG</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editForm.giftItem} onChange={e => setEditForm({...editForm, giftItem: e.target.checked})} className="rounded bg-black/40 border-white/10 text-purple-500 focus:ring-purple-500" />
                  <span className="text-sm font-semibold text-neutral-300">Gift Item</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editForm.showOnWeb} disabled={editForm.giftItem} onChange={e => setEditForm({...editForm, showOnWeb: e.target.checked})} className="rounded bg-black/40 border-white/10 text-sky-500 focus:ring-sky-500 disabled:opacity-40" />
                  <span className="text-sm font-semibold text-neutral-300">Show on web</span>
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 flex justify-end">
              <button type="submit" disabled={saving} className="flex items-center gap-2 px-6 py-2 bg-orange-500 hover:bg-orange-400 text-neutral-950 text-sm font-bold rounded-lg transition-colors disabled:opacity-50">
                {saving ? "Saving..." : <><FiSave /> Save Changes</>}
              </button>
            </div>
          </form>
        )}

        {activeTab === "history" && (
          <div className="glass-panel border border-white/10 rounded-xl overflow-hidden">
            {historyLoading ? (
              <div className="p-8 flex justify-center text-neutral-500">
                <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : history.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 border-b border-white/10 text-[10px] uppercase font-bold text-neutral-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Invoice #</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {history.map((h, i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-neutral-300">{h.date}</td>
                      <td className="px-4 py-3 font-semibold text-white truncate max-w-[150px]" title={h.accountName}>{h.accountName}</td>
                      <td className="px-4 py-3 text-orange-400 cursor-pointer hover:underline">{h.invoiceNumber}</td>
                      <td className="px-4 py-3 text-right text-neutral-300">{h.quantity}</td>
                      <td className="px-4 py-3 text-right text-neutral-300">${parseFloat(h.rate).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-white">${parseFloat(h.total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-neutral-500 text-sm">
                No purchase history found for this product.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
