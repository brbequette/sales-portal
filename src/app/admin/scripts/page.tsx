"use client"

import { toastConfirm } from '@/lib/toastConfirm'

import { useState, useEffect } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { useRouter } from "next/navigation"
import { FiMessageSquare, FiPlus, FiEdit2, FiTrash2, FiArrowLeft, FiX, FiCheck, FiSave } from "react-icons/fi"
import { toast } from 'react-hot-toast';

type CallScript = {
  id: string
  name: string
  callType: string
  content: string
  isActive: boolean
}

const MERGE_FIELDS = [
  "{{AccountName}}",
  "{{ContactName}}",
  "{{RepName}}",
  "{{Industry}}",
  "{{Status}}",
  "{{LastPurchase}}",
  "{{CurrentSupplier}}"
]

export default function ScriptManagerPage() {
  const router = useRouter()
  const { isInitialized, zohoContext: user } = useZoho()
  const [scripts, setScripts] = useState<CallScript[]>([])
  const [loading, setLoading] = useState(true)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingScript, setEditingScript] = useState<CallScript | null>(null)

  const [formData, setFormData] = useState({
    name: "",
    callType: "Intro",
    content: "",
    isActive: true
  })

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchScripts()
  }, [])

  const fetchScripts = async () => {
    try {
      const res = await fetch("/api/admin/scripts")
      const data = await res.json()
      if (data.success) {
        setScripts(data.scripts)
      }
    } catch (e) {
      console.error("Failed to fetch scripts", e)
    } finally {
      setLoading(false)
    }
  }

  const openModal = (script?: CallScript) => {
    if (script) {
      setEditingScript(script)
      setFormData({
        name: script.name,
        callType: script.callType,
        content: script.content,
        isActive: script.isActive
      })
    } else {
      setEditingScript(null)
      setFormData({
        name: "",
        callType: "Intro",
        content: "",
        isActive: true
      })
    }
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const url = editingScript ? `/api/admin/scripts/${editingScript.id}` : `/api/admin/scripts`
      const method = editingScript ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      })
      const data = await res.json()

      if (data.success) {
        setIsModalOpen(false)
        fetchScripts()
      } else {
        toast.error("Failed to save: " + data.error)
      }
    } catch (e) {
      toast.error("Error saving script.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    toastConfirm("Are you sure you want to delete this script?", async () => {
    try {
      const res = await fetch(`/api/admin/scripts/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        fetchScripts()
      } else {
        toast.error("Failed to delete: " + data.error)
      }
    } catch (e) {
      toast.error("Error deleting script.")
    }
  });}

  const insertMergeField = (field: string) => {
    setFormData(prev => ({ ...prev, content: prev.content + field }))
  }

  if (loading) return <div className="p-8 text-neutral-400">Loading Scripts...</div>

  return (
    <div className="flex flex-col text-neutral-100 font-sans h-full">
      <main className="flex-1 p-4 sm:p-6 space-y-6 overflow-y-auto safe-bottom">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Call Scripts Manager</h1>
            <p className="text-xs text-neutral-500 mt-1">Manage global call scripts used across the CRM.</p>
          </div>
          <button 
            onClick={() => openModal()}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-colors shadow-lg shadow-emerald-900/20"
          >
            <FiPlus /> New Script
          </button>
        </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scripts.map(script => (
          <div key={script.id} className="glass-panel border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col h-full">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-white">{script.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400 border border-blue-500/20 uppercase">
                    {script.callType}
                  </span>
                  {!script.isActive && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 uppercase">
                      Inactive
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openModal(script)} className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 rounded">
                  <FiEdit2 size={14} />
                </button>
                <button onClick={() => handleDelete(script.id)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded">
                  <FiTrash2 size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs text-neutral-400 line-clamp-4 whitespace-pre-wrap">{script.content}</p>
            </div>
          </div>
        ))}
        {scripts.length === 0 && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-white/10 rounded-2xl">
            <p className="text-neutral-500 mb-2">No scripts found</p>
            <button onClick={() => openModal()} className="text-sm font-bold text-purple-400 hover:underline">
              Create your first script
            </button>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
          <div className="glass-panel border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h2 className="text-lg font-bold text-white">{editingScript ? "Edit Script" : "New Script"}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-white">
                <FiX size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Script Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                    placeholder="e.g. Cold Call Intro"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Call Type</label>
                  <select
                    value={formData.callType}
                    onChange={e => setFormData({ ...formData, callType: e.target.value })}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="Intro">Intro / Prospecting</option>
                    <option value="Follow-up">Follow-up</option>
                    <option value="Collections">Collections</option>
                    <option value="General">General / Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Merge Fields</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {MERGE_FIELDS.map(field => (
                    <button
                      key={field}
                      type="button"
                      onClick={() => insertMergeField(field)}
                      className="px-2 py-1 bg-purple-900/20 hover:bg-purple-900/40 border border-purple-500/20 text-purple-300 text-xs rounded transition-colors"
                    >
                      {field}
                    </button>
                  ))}
                </div>
                <textarea
                  required
                  rows={8}
                  value={formData.content}
                  onChange={e => setFormData({ ...formData, content: e.target.value })}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 resize-none font-mono"
                  placeholder="Hi {{ContactName}}, this is {{RepName}} from Titan Diamond..."
                />
              </div>

              <div className="flex items-center gap-3 mt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-neutral-700 bg-black/20 text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
                <label htmlFor="isActive" className="text-sm font-semibold text-white cursor-pointer">Script is Active</label>
              </div>

              <div className="flex gap-3 pt-4 border-t border-white/10 mt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-sm rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-purple-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? "Saving..." : <><FiSave /> Save Script</>}
                </button>
              </div>
            </form>
          </div>
        </div>
        )}
      </main>
    </div>
  )
}


