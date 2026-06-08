"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useZoho } from "@/components/ZohoProvider"
import { 
  FiSearch, FiFileText, FiImage, FiVideo, FiDownload, FiShare2, 
  FiGrid, FiList, FiPlus, FiEdit2, FiTrash2, FiGlobe, FiCheck 
} from "react-icons/fi"

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
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeCategory, setActiveCategory] = useState("All")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [copiedId, setCopiedId] = useState<string | null>(null)

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

  // 1. Check if Admin
  const isAdmin = currentUser?.role?.toLowerCase().includes("admin") || 
                  currentUser?.role === "Administrator" || 
                  currentUser?.role === "Admin"

  // 2. Fetch Assets
  const fetchAssets = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/get-media-assets")
      const data = await res.json()
      if (data.success) {
        setAssets(data.assets)
      }
    } catch (e) {
      console.error("Error fetching media assets:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAssets()
  }, [])

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
        fetchAssets()
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
        fetchAssets()
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
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans pb-12">
      {/* ── Header ── */}
      <header className="bg-neutral-900 border-b border-neutral-800 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-neutral-400 hover:text-emerald-400 font-medium transition-colors text-sm">
              &larr; Dashboard
            </Link>
            <div className="h-6 w-px bg-neutral-800"></div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              📂 Tools & Media Repository
            </h1>
          </div>
          {isAdmin && (
            <button
              onClick={openAddModal}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 text-xs rounded-full transition-all shadow-lg hover:shadow-emerald-500/10"
            >
              <FiPlus /> Add Asset
            </button>
          )}
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Search, Layout Selector, and Roles */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input 
              type="text" 
              placeholder="Search marketing materials..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors text-white"
            />
          </div>
          
          <div className="flex items-center justify-between md:justify-end gap-3">
            <div className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">
              User Level: <span className={isAdmin ? "text-emerald-400 font-extrabold" : "text-neutral-400"}>{currentUser?.role || "Sales Rep"}</span>
            </div>
            <div className="bg-neutral-900 rounded-lg p-0.5 flex border border-neutral-800">
              <button 
                onClick={() => setViewMode("grid")} 
                className={`p-2 rounded ${viewMode === 'grid' ? 'bg-neutral-800 text-emerald-400' : 'text-neutral-500 hover:text-white'}`}
                title="Grid view"
              >
                <FiGrid />
              </button>
              <button 
                onClick={() => setViewMode("list")} 
                className={`p-2 rounded ${viewMode === 'list' ? 'bg-neutral-800 text-emerald-400' : 'text-neutral-500 hover:text-white'}`}
                title="List view"
              >
                <FiList />
              </button>
            </div>
          </div>
        </div>

        {/* Categories Bar */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {categories.map(cat => (
            <button 
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                activeCategory === cat 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-white border border-neutral-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Loader */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            {/* Grid View */}
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {filteredAssets.map(asset => (
                  <div key={asset.id} className="bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 rounded-xl overflow-hidden transition-all group flex flex-col shadow-xl">
                    <div className="h-28 bg-neutral-900 flex items-center justify-center text-3xl group-hover:scale-105 transition-transform duration-300 relative border-b border-neutral-800">
                      {getIcon(asset.type)}
                      <div className="absolute top-2 right-2 bg-neutral-800 text-[9px] font-bold px-2 py-0.5 rounded text-neutral-400 border border-neutral-700">
                        {asset.type}
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-1">
                          {asset.category}
                        </div>
                        <h3 className="text-xs font-bold text-white mb-2 line-clamp-2" title={asset.title}>
                          {asset.title}
                        </h3>
                      </div>
                      <div className="pt-3 border-t border-neutral-800/50 flex items-center justify-between">
                        <span className="text-[10px] text-neutral-500">{asset.size}</span>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => handleDownload(asset)}
                            className="p-1.5 bg-neutral-800 hover:bg-emerald-600 rounded text-neutral-300 hover:text-white transition-colors" 
                            title="Download/Open"
                          >
                            <FiDownload size={13} />
                          </button>
                          <button 
                            onClick={() => handleCopyLink(asset)}
                            className="p-1.5 bg-neutral-800 hover:bg-blue-600 rounded text-neutral-300 hover:text-white transition-colors" 
                            title="Copy link to send"
                          >
                            {copiedId === asset.id ? <FiCheck size={13} className="text-emerald-400" /> : <FiShare2 size={13} />}
                          </button>
                          {isAdmin && (
                            <>
                              <button 
                                onClick={() => openEditModal(asset)}
                                className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-400 hover:text-white transition-colors" 
                                title="Edit"
                              >
                                <FiEdit2 size={13} />
                              </button>
                              <button 
                                onClick={() => handleDeleteAsset(asset)}
                                className="p-1.5 bg-neutral-800 hover:bg-red-900 rounded text-neutral-400 hover:text-red-300 transition-colors" 
                                title="Delete"
                              >
                                <FiTrash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* List View */
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-x-auto shadow-2xl">
                <table className="w-full text-left text-xs min-w-[600px]">
                  <thead className="bg-neutral-800/80 text-neutral-400 border-b border-neutral-800 uppercase tracking-wider text-[9px] font-bold">
                    <tr>
                      <th className="p-4">Name</th>
                      <th className="p-4">Category</th>
                      <th className="p-4">Type</th>
                      <th className="p-4">Size</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {filteredAssets.map(asset => (
                      <tr key={asset.id} className="hover:bg-neutral-800/30 transition-colors">
                        <td className="p-4 flex items-center gap-3">
                          <div className="text-base shrink-0">{getIcon(asset.type)}</div>
                          <span className="font-semibold text-white truncate max-w-xs sm:max-w-md">{asset.title}</span>
                        </td>
                        <td className="p-4 text-emerald-400 font-semibold">{asset.category}</td>
                        <td className="p-4 text-neutral-400">{asset.type}</td>
                        <td className="p-4 text-neutral-500">{asset.size}</td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button 
                              onClick={() => handleDownload(asset)}
                              className="p-1.5 bg-neutral-800 hover:bg-emerald-600 rounded text-neutral-300 hover:text-white transition-colors" 
                              title="Download/Open"
                            >
                              <FiDownload size={12} />
                            </button>
                            <button 
                              onClick={() => handleCopyLink(asset)}
                              className="p-1.5 bg-neutral-800 hover:bg-blue-600 rounded text-neutral-300 hover:text-white transition-colors" 
                              title="Copy link to send"
                            >
                              {copiedId === asset.id ? <FiCheck size={12} className="text-emerald-400" /> : <FiShare2 size={12} />}
                            </button>
                            {isAdmin && (
                              <>
                                <button 
                                  onClick={() => openEditModal(asset)}
                                  className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-400 hover:text-white transition-colors" 
                                  title="Edit"
                                >
                                  <FiEdit2 size={12} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteAsset(asset)}
                                  className="p-1.5 bg-neutral-800 hover:bg-red-900 rounded text-neutral-400 hover:text-red-300 transition-colors" 
                                  title="Delete"
                                >
                                  <FiTrash2 size={12} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {filteredAssets.length === 0 && (
              <div className="p-16 text-center border border-dashed border-neutral-800 rounded-xl bg-neutral-900/10">
                <FiSearch className="mx-auto text-4xl text-neutral-600 mb-3" />
                <p className="text-neutral-400 font-medium text-sm">No assets found matching your criteria.</p>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Add / Edit Asset Modal (Admin Only) ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="bg-neutral-800 px-6 py-4 border-b border-neutral-800 flex justify-between items-center">
              <h2 className="font-bold text-white text-base">
                {editingAsset ? "✏️ Edit Media Asset" : "✨ Add New Media Asset"}
              </h2>
              <button 
                onClick={() => setShowModal(false)}
                className="text-neutral-400 hover:text-white transition-colors text-xl font-bold"
              >
                &times;
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveAsset} className="p-6 space-y-4">
              {errorMsg && (
                <div className="bg-red-900/30 border border-red-800 text-red-400 text-xs p-3 rounded-lg">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">Asset Title *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Wet Core Drill Bit Guide"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">Asset Type</label>
                  <select 
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    {assetTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">Category</label>
                  <select 
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    {categories.filter(c => c !== "All").map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">Asset URL *</label>
                  <input 
                    type="url" 
                    required
                    placeholder="https://example.com/asset.pdf"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">Size Label</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 2.4 MB, 125 MB, Link"
                    value={formSize}
                    onChange={(e) => setFormSize(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-neutral-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold px-4 py-2 text-xs rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 text-xs rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Save Asset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
