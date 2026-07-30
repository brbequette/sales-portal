"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { 
  FiArrowLeft, FiPlus, FiEdit2, FiTrash2, FiRefreshCw, 
  FiChevronUp, FiChevronDown, FiCheck, FiX, FiInfo, FiEye, FiEyeOff 
} from "react-icons/fi"

interface Stage {
  id: string
  name: string
  slug: string
  order: number
  color: string
  description?: string
  isActive: boolean
}

export default function SalesStagesPage() {
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  // Edit/Create Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStage, setEditingStage] = useState<Partial<Stage> | null>(null)
  const [formName, setFormName] = useState("")
  const [formSlug, setFormSlug] = useState("")
  const [formColor, setFormColor] = useState("#6b7280")
  const [formDesc, setFormDesc] = useState("")

  const fetchStages = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/sales-stages")
      const data = await res.json()
      if (data.success) {
        // Sort by order asc
        setStages(data.stages || [])
      } else {
        setError(data.error || "Failed to load stages")
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch stages")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStages()
  }, [])

  const handleOpenModal = (stage?: Stage) => {
    if (stage) {
      setEditingStage(stage)
      setFormName(stage.name)
      setFormSlug(stage.slug)
      setFormColor(stage.color)
      setFormDesc(stage.description || "")
    } else {
      setEditingStage(null)
      setFormName("")
      setFormSlug("")
      setFormColor("#3b82f6")
      setFormDesc("")
    }
    setIsModalOpen(true)
  }

  const handleSaveStage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim() || !formSlug.trim()) return

    setSaving(true)
    try {
      const payload = {
        id: editingStage?.id,
        name: formName.trim(),
        slug: formSlug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-"),
        color: formColor,
        description: formDesc.trim(),
        order: editingStage?.order ?? stages.length
      }

      const res = await fetch("/api/admin/sales-stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()

      if (data.success) {
        setIsModalOpen(false)
        fetchStages()
      } else {
        alert(data.error || "Failed to save stage")
      }
    } catch (err: any) {
      alert(err.message || "Error saving stage")
    } finally {
      setSaving(false)
    }
  }

  const handleSoftDelete = async (id: string) => {
    if (!confirm("Are you sure you want to deactivate this stage? Accounts in this stage will not be deleted, but the stage will be marked inactive.")) return

    try {
      const res = await fetch(`/api/admin/sales-stages?id=${id}`, {
        method: "DELETE"
      })
      const data = await res.json()
      if (data.success) {
        fetchStages()
      } else {
        alert(data.error || "Failed to delete stage")
      }
    } catch (err: any) {
      alert(err.message || "Error deleting stage")
    }
  }

  const handleReactivate = async (stage: Stage) => {
    try {
      const res = await fetch("/api/admin/sales-stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...stage, isActive: true })
      })
      const data = await res.json()
      if (data.success) {
        fetchStages()
      } else {
        alert(data.error || "Failed to reactivate stage")
      }
    } catch (err: any) {
      alert(err.message || "Error reactivating stage")
    }
  }

  const handleMove = async (index: number, direction: "up" | "down") => {
    const newStages = [...stages]
    const targetIndex = direction === "up" ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newStages.length) return

    // Swap orders
    const tempOrder = newStages[index].order
    newStages[index].order = newStages[targetIndex].order
    newStages[targetIndex].order = tempOrder

    setStages(newStages)

    // Save both to database
    try {
      await Promise.all([
        fetch("/api/admin/sales-stages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newStages[index])
        }),
        fetch("/api/admin/sales-stages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newStages[targetIndex])
        })
      ])
      fetchStages()
    } catch (err) {
      console.error("Failed to save new sort order:", err)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors">
            <FiArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Sales Flow Builder</h1>
            <p className="text-neutral-400 text-xs">Configure customer pipeline stages, order, and visual tags.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowInactive(!showInactive)} 
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
              showInactive 
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400" 
                : "border-white/10 bg-white/5 text-neutral-400 hover:text-white"
            }`}
          >
            {showInactive ? <FiEye size={14} /> : <FiEyeOff size={14} />}
            {showInactive ? "Showing Inactive" : "Show Inactive"}
          </button>
          <button 
            onClick={() => handleOpenModal()} 
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors"
          >
            <FiPlus size={14} />
            Add Stage
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-950/20 text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Visual Pipeline Bar */}
      {!loading && stages.length > 0 && (
        <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.01]">
          <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-4">Pipeline Preview</h2>
          <div className="flex flex-wrap md:flex-nowrap gap-1 bg-black/30 p-2 rounded-xl overflow-hidden">
            {stages.filter(s => s.isActive || showInactive).map((s, idx) => (
              <div 
                key={s.id} 
                className={`flex-1 min-w-[120px] text-center p-3 rounded-lg text-xs font-bold transition-all relative border ${
                  s.isActive ? "border-transparent" : "border-white/5 opacity-40 bg-neutral-900"
                }`}
                style={{ 
                  backgroundColor: s.isActive ? `${s.color}15` : undefined, 
                  color: s.isActive ? s.color : "#9ca3af"
                }}
              >
                <div className="truncate">{s.name}</div>
                <div className="text-[10px] opacity-60 mt-1 font-medium">Stage {idx + 1}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stages Table/Grid */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-neutral-500">
          <FiRefreshCw size={24} className="animate-spin mr-2" /> Loading stages...
        </div>
      ) : stages.length === 0 ? (
        <div className="text-center p-12 rounded-2xl border border-white/5 bg-white/[0.01] text-neutral-500">
          No stages configured yet. Click "Add Stage" to begin.
        </div>
      ) : (
        <div className="border border-white/10 rounded-2xl bg-white/[0.01] overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-bold text-neutral-400">
                <th className="p-4 w-12 text-center">Order</th>
                <th className="p-4">Name & Slug</th>
                <th className="p-4">Color Tag</th>
                <th className="p-4">Description</th>
                <th className="p-4 w-28 text-center">Status</th>
                <th className="p-4 w-32 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stages
                .filter(s => s.isActive || showInactive)
                .map((s, idx, arr) => (
                  <tr 
                    key={s.id} 
                    className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors text-xs text-neutral-300 ${
                      !s.isActive ? "opacity-50" : ""
                    }`}
                  >
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <button 
                          disabled={idx === 0 || !s.isActive}
                          onClick={() => handleMove(idx, "up")}
                          className="text-neutral-500 hover:text-white disabled:opacity-20 disabled:hover:text-neutral-500 transition-colors"
                        >
                          <FiChevronUp size={16} />
                        </button>
                        <span className="font-bold text-white text-xs">{idx + 1}</span>
                        <button 
                          disabled={idx === arr.length - 1 || !s.isActive}
                          onClick={() => handleMove(idx, "down")}
                          className="text-neutral-500 hover:text-white disabled:opacity-20 disabled:hover:text-neutral-500 transition-colors"
                        >
                          <FiChevronDown size={16} />
                        </button>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-white text-sm">{s.name}</div>
                      <div className="text-[10px] text-neutral-500 font-mono mt-0.5">{s.slug}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: s.color }}></div>
                        <span className="font-mono text-[10px] text-neutral-400">{s.color}</span>
                      </div>
                    </td>
                    <td className="p-4 max-w-xs truncate text-neutral-400">
                      {s.description || <span className="italic text-neutral-600">No description</span>}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        s.isActive 
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}>
                        {s.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button 
                          onClick={() => handleOpenModal(s)}
                          className="p-2 rounded bg-white/5 text-neutral-400 hover:text-white transition-colors"
                        >
                          <FiEdit2 size={13} />
                        </button>
                        {s.isActive ? (
                          <button 
                            onClick={() => handleSoftDelete(s.id)}
                            className="p-2 rounded bg-red-950/20 text-red-400 hover:bg-red-650 hover:text-white transition-all"
                            title="Deactivate Stage"
                          >
                            <FiTrash2 size={13} />
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleReactivate(s)}
                            className="p-2 rounded bg-emerald-950/20 text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all"
                            title="Reactivate Stage"
                          >
                            <FiCheck size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit/Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md p-6 rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-white text-lg">
                {editingStage ? "Edit Stage" : "Create Pipeline Stage"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-white">
                <FiX size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveStage} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Stage Name</label>
                <input 
                  type="text" 
                  value={formName} 
                  onChange={(e) => {
                    setFormName(e.target.value)
                    if (!editingStage) {
                      setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, "-"))
                    }
                  }}
                  placeholder="e.g. Under Review"
                  required
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-white/10 bg-white/[0.02] text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Unique Slug (Key)</label>
                <input 
                  type="text" 
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value)}
                  placeholder="e.g. under-review"
                  required
                  disabled={!!editingStage}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-white/10 bg-white/[0.02] text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Display Color Tag</label>
                <div className="flex gap-2">
                  <input 
                    type="color" 
                    value={formColor} 
                    onChange={(e) => setFormColor(e.target.value)}
                    className="w-10 h-9 rounded border border-white/10 bg-transparent cursor-pointer shrink-0"
                  />
                  <input 
                    type="text" 
                    value={formColor} 
                    onChange={(e) => setFormColor(e.target.value)}
                    placeholder="#3b82f6"
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-white/10 bg-white/[0.02] text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Description</label>
                <textarea 
                  value={formDesc} 
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Describe this pipeline phase..."
                  rows={3}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-white/10 bg-white/[0.02] text-white focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-white/10 bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-bold rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-40"
                >
                  {saving ? "Saving..." : "Save Stage"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
