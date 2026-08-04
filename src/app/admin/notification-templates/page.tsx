"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { toast } from "react-hot-toast"
import { 
  FiArrowLeft, FiPlus, FiEdit2, FiTrash2, FiRefreshCw, 
  FiMessageSquare, FiMail, FiX, FiCheck, FiInfo, FiEye, FiEyeOff 
} from "react-icons/fi"

interface Template {
  id: string
  name: string
  channel: string // 'SMS' | 'EMAIL'
  subject?: string
  body: string
  isActive: boolean
  createdAt: string
}

export default function NotificationTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  // Edit/Create Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Partial<Template> | null>(null)
  const [formName, setFormName] = useState("")
  const [formChannel, setFormChannel] = useState("SMS")
  const [formSubject, setFormSubject] = useState("")
  const [formBody, setFormBody] = useState("")

  const fetchTemplates = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/notification-templates")
      const data = await res.json()
      // API returns { templates } (no success wrapper)
      if (data.templates) {
        setTemplates(data.templates || [])
      } else if (data.error) {
        setError(data.error)
      } else {
        setError("Failed to load templates")
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch templates")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  const handleOpenModal = (template?: Template) => {
    if (template) {
      setEditingTemplate(template)
      setFormName(template.name)
      setFormChannel(template.channel)
      setFormSubject(template.subject || "")
      setFormBody(template.body)
    } else {
      setEditingTemplate(null)
      setFormName("")
      setFormChannel("SMS")
      setFormSubject("")
      setFormBody("")
    }
    setIsModalOpen(true)
  }

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim() || !formBody.trim()) return

    setSaving(true)
    try {
      const isEditing = !!editingTemplate?.id

      const payload: any = {
        name: formName.trim(),
        channel: formChannel,
        subject: formChannel === "EMAIL" ? formSubject.trim() : undefined,
        body: formBody.trim(),
      }

      if (isEditing) payload.id = editingTemplate!.id

      const res = await fetch("/api/admin/notification-templates", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (data.template) {
        setIsModalOpen(false)
        toast.success(isEditing ? "Template updated" : "Template created")
        fetchTemplates()
      } else {
        toast.error(data.error || "Failed to save template")
      }
    } catch (err: any) {
      toast.error(err.message || "Error saving template")
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (template: Template) => {
    const action = template.isActive ? "deactivate" : "reactivate"
    const confirmed = window.confirm(
      template.isActive
        ? "Deactivate this template? It will be hidden but not deleted."
        : "Reactivate this template?"
    )
    if (!confirmed) return

    try {
      const res = await fetch("/api/admin/notification-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: template.id, isActive: !template.isActive }),
      })
      const data = await res.json()
      if (data.template) {
        toast.success(`Template ${template.isActive ? "deactivated" : "reactivated"}`)
        fetchTemplates()
      } else {
        toast.error(data.error || `Failed to ${action} template`)
      }
    } catch (err: any) {
      toast.error(err.message || `Error: ${action}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Permanently delete this template? This cannot be undone.")) return

    try {
      const res = await fetch(`/api/admin/notification-templates?id=${id}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (data.success) {
        toast.success("Template deleted")
        fetchTemplates()
      } else {
        toast.error(data.error || "Failed to delete template")
      }
    } catch (err: any) {
      toast.error(err.message || "Error deleting template")
    }
  }

  const variables = [
    { code: "{customer_name}", desc: "Customer full name" },
    { code: "{salesperson}", desc: "Salesperson name" },
    { code: "{amount}", desc: "Invoice subtotal amount" },
    { code: "{invoice_number}", desc: "Invoice reference number" },
    { code: "{due_date}", desc: "Invoice due date" },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors">
            <FiArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Notification Rules</h1>
            <p className="text-neutral-400 text-xs">Manage automated customer SMS and Email messaging templates.</p>
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
            Create Template
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-950/20 text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Templates Grid */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-neutral-500">
          <FiRefreshCw size={24} className="animate-spin mr-2" /> Loading templates...
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center p-12 rounded-2xl border border-white/5 bg-white/[0.01] text-neutral-500">
          No templates configured yet. Click &quot;Create Template&quot; to begin.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates
            .filter(t => t.isActive || showInactive)
            .map((t) => (
              <div 
                key={t.id} 
                className={`p-5 rounded-2xl border border-white/10 bg-white/[0.01] hover:bg-white/[0.02] transition-all flex flex-col justify-between space-y-4 ${
                  !t.isActive ? "opacity-50" : ""
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm truncate max-w-[200px]" title={t.name}>
                      {t.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        t.channel === "SMS" 
                          ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" 
                          : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                      }`}>
                        {t.channel === "SMS" ? <FiMessageSquare size={10} /> : <FiMail size={10} />}
                        {t.channel}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        t.isActive 
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}>
                        {t.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>

                  {t.channel === "EMAIL" && t.subject && (
                    <div className="text-[11px] text-neutral-400 truncate">
                      <span className="font-semibold text-neutral-500">Subject:</span> {t.subject}
                    </div>
                  )}

                  <div className="p-3 bg-black/30 rounded-xl border border-white/5 text-xs text-neutral-400 leading-relaxed font-mono whitespace-pre-wrap min-h-[80px]">
                    {t.body}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/5 pt-3">
                  <span className="text-[10px] text-neutral-500">
                    Created {new Date(t.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex gap-1.5">
                    <button 
                      onClick={() => handleOpenModal(t)}
                      className="p-2 rounded bg-white/5 text-neutral-400 hover:text-white transition-colors"
                      title="Edit Template"
                    >
                      <FiEdit2 size={13} />
                    </button>
                    <button 
                      onClick={() => handleToggleActive(t)}
                      className={`p-2 rounded transition-all ${
                        t.isActive
                          ? "bg-amber-950/20 text-amber-400 hover:bg-amber-600 hover:text-white"
                          : "bg-emerald-950/20 text-emerald-400 hover:bg-emerald-600 hover:text-white"
                      }`}
                      title={t.isActive ? "Deactivate Template" : "Reactivate Template"}
                    >
                      {t.isActive ? <FiEyeOff size={13} /> : <FiCheck size={13} />}
                    </button>
                    <button 
                      onClick={() => handleDelete(t.id)}
                      className="p-2 rounded bg-red-950/20 text-red-400 hover:bg-red-600 hover:text-white transition-all"
                      title="Delete Template"
                    >
                      <FiTrash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
          ))}
        </div>
      )}

      {/* Edit/Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg p-6 rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-white text-lg">
                {editingTemplate?.id ? "Edit Notification Template" : "Create Notification Template"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-white">
                <FiX size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Template Name</label>
                  <input 
                    type="text" 
                    value={formName} 
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Invoice Sent Alert"
                    required
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-white/10 bg-white/[0.02] text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Channel</label>
                  <select 
                    value={formChannel}
                    onChange={(e) => setFormChannel(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-white/10 bg-neutral-800 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="SMS">SMS</option>
                    <option value="EMAIL">EMAIL</option>
                  </select>
                </div>
              </div>

              {formChannel === "EMAIL" && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Email Subject</label>
                  <input 
                    type="text" 
                    value={formSubject} 
                    onChange={(e) => setFormSubject(e.target.value)}
                    placeholder="e.g. Invoice #{invoice_number} is ready for review"
                    required={formChannel === "EMAIL"}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-white/10 bg-white/[0.02] text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                {/* Body Textarea */}
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Message Body</label>
                  <textarea 
                    value={formBody} 
                    onChange={(e) => setFormBody(e.target.value)}
                    placeholder="e.g. Hi {customer_name}, your invoice for {amount} is ready."
                    rows={6}
                    required
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-white/10 bg-white/[0.02] text-white focus:outline-none focus:border-emerald-500 resize-none font-mono"
                  />
                </div>

                {/* Variable Selector helper */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                    <FiInfo size={11} /> Dynamic Vars
                  </span>
                  <div className="p-3 rounded-xl border border-white/5 bg-black/20 space-y-2 h-[126px] overflow-y-auto">
                    {variables.map(v => (
                      <div 
                        key={v.code}
                        onClick={() => setFormBody(prev => prev + v.code)}
                        className="p-1.5 bg-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/30 rounded border border-transparent cursor-pointer text-[10px] font-mono text-neutral-300 hover:text-emerald-400 transition-all leading-tight"
                        title={v.desc}
                      >
                        {v.code}
                      </div>
                    ))}
                  </div>
                </div>
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
                  {saving ? "Saving..." : "Save Template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
