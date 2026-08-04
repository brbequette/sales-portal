"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { toast } from "react-hot-toast"
import { 
  FiArrowLeft, FiPlus, FiEdit2, FiTrash2, FiRefreshCw, 
  FiChevronUp, FiChevronDown, FiX, FiEyeOff, FiEye,
  FiPlay, FiMessageSquare, FiPhoneCall, FiRepeat, FiBell, FiZap
} from "react-icons/fi"

interface FlowStep {
  id: string
  type: "SMS_CAMPAIGN" | "CALL_TASK" | "NOTIFICATION" | "WAIT_INTERVAL"
  title: string
  waitHours?: number
  message?: string
  priority?: string
}

interface LoopRule {
  enabled: boolean
  maxInactivityDays: number
  loopQuality?: string
}

interface Stage {
  id: string
  name: string
  slug: string
  order: number
  color: string
  description?: string
  isActive: boolean
  isDefault: boolean
  flowConfig?: {
    steps?: FlowStep[]
    loopRule?: LoopRule
  }
}

export default function SalesStagesPage() {
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  // Stage Create/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStage, setEditingStage] = useState<Partial<Stage> | null>(null)
  const [formName, setFormName] = useState("")
  const [formColor, setFormColor] = useState("#6b7280")
  const [formDesc, setFormDesc] = useState("")

  // Flow Builder Modal State
  const [isFlowModalOpen, setIsFlowModalOpen] = useState(false)
  const [activeStageForFlow, setActiveStageForFlow] = useState<Stage | null>(null)
  const [flowSteps, setFlowSteps] = useState<FlowStep[]>([])
  const [loopRule, setLoopRule] = useState<LoopRule>({ enabled: false, maxInactivityDays: 30, loopQuality: "WARM" })

  const fetchStages = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/sales-stages")
      const data = await res.json()
      if (data.success) {
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

  // ── Reorder helpers ──────────────────────────────────────────────────────
  const handleReorder = async (stage: Stage, direction: "up" | "down") => {
    const visible = stages.filter(s => s.isActive || showInactive)
    const idx = visible.findIndex(s => s.id === stage.id)
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= visible.length) return

    const other = visible[swapIdx]
    // Swap order values
    try {
      await Promise.all([
        fetch("/api/admin/sales-stages", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: stage.id, order: other.order }),
        }),
        fetch("/api/admin/sales-stages", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: other.id, order: stage.order }),
        }),
      ])
      fetchStages()
    } catch {
      toast.error("Failed to reorder stages")
    }
  }

  // ── Toggle active ────────────────────────────────────────────────────────
  const handleToggleActive = async (stage: Stage) => {
    if (stage.isDefault && stage.isActive) {
      toast.error("Cannot deactivate a default stage")
      return
    }
    try {
      const res = await fetch("/api/admin/sales-stages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: stage.id, isActive: !stage.isActive }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Stage ${stage.isActive ? "deactivated" : "activated"}`)
        fetchStages()
      } else {
        toast.error(data.error || "Failed to update stage")
      }
    } catch {
      toast.error("Error updating stage")
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async (stage: Stage) => {
    if (stage.isDefault) {
      toast.error("Cannot delete a default stage")
      return
    }
    if (!confirm(`Delete stage "${stage.name}"? This cannot be undone.`)) return

    try {
      const res = await fetch(`/api/admin/sales-stages?id=${stage.id}`, { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        toast.success("Stage deleted")
        fetchStages()
      } else {
        toast.error(data.error || "Failed to delete stage")
      }
    } catch {
      toast.error("Error deleting stage")
    }
  }

  // ── Stage modal ──────────────────────────────────────────────────────────
  const handleOpenModal = (stage?: Stage) => {
    if (stage) {
      setEditingStage(stage)
      setFormName(stage.name)
      setFormColor(stage.color)
      setFormDesc(stage.description || "")
    } else {
      setEditingStage(null)
      setFormName("")
      setFormColor("#3b82f6")
      setFormDesc("")
    }
    setIsModalOpen(true)
  }

  const handleSaveStage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) return

    setSaving(true)
    try {
      const payload: any = {
        name: formName.trim(),
        color: formColor,
        description: formDesc.trim(),
      }
      if (editingStage?.id) {
        payload.id = editingStage.id
      } else {
        payload.order = stages.length
      }

      const method = editingStage?.id ? "PUT" : "POST"
      const res = await fetch("/api/admin/sales-stages", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (data.success) {
        setIsModalOpen(false)
        toast.success(editingStage?.id ? "Stage updated" : "Stage created")
        fetchStages()
      } else {
        toast.error(data.error || "Failed to save stage")
      }
    } catch {
      toast.error("Error saving stage")
    } finally {
      setSaving(false)
    }
  }

  // ── Flow builder ─────────────────────────────────────────────────────────
  const handleOpenFlowModal = (stage: Stage) => {
    setActiveStageForFlow(stage)
    const existingConfig = stage.flowConfig || {}
    setFlowSteps(existingConfig.steps || [])
    setLoopRule(existingConfig.loopRule || { enabled: false, maxInactivityDays: 30, loopQuality: "WARM" })
    setIsFlowModalOpen(true)
  }

  const handleAddFlowStep = (type: FlowStep["type"]) => {
    const newStep: FlowStep = {
      id: `step_${Date.now()}`,
      type,
      title: type === "SMS_CAMPAIGN" ? "Outreach SMS" : type === "CALL_TASK" ? "Scheduled Call" : type === "NOTIFICATION" ? "Sales Alert" : "Wait Delay",
      waitHours: 24,
      message: type === "SMS_CAMPAIGN" ? "Hi [Contact], following up on your diamond blade order proposal!" : "",
      priority: "Normal",
    }
    setFlowSteps(prev => [...prev, newStep])
  }

  const handleRemoveFlowStep = (id: string) => {
    setFlowSteps(prev => prev.filter(s => s.id !== id))
  }

  const handleSaveFlowConfig = async () => {
    if (!activeStageForFlow) return
    setSaving(true)
    try {
      const res = await fetch("/api/admin/sales-stages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeStageForFlow.id,
          flowConfig: { steps: flowSteps, loopRule },
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success("Sales Flow Automation saved!")
        setIsFlowModalOpen(false)
        fetchStages()
      } else {
        toast.error("Failed to save automation flow")
      }
    } catch {
      toast.error("Error saving flow configuration")
    } finally {
      setSaving(false)
    }
  }

  const handleRunSalesFlowExecution = async () => {
    setExecuting(true)
    try {
      const res = await fetch("/api/admin/sales-flow/execute", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        toast.success(`Executed Flow: ${data.scheduledCalls} Calls Scheduled, ${data.processedActions} Actions Processed!`)
      } else {
        toast.error("Execution failed: " + data.error)
      }
    } catch {
      toast.error("Failed to run Sales Flow automation")
    } finally {
      setExecuting(false)
    }
  }

  const visibleStages = stages.filter(s => s.isActive || showInactive)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors">
            <FiArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
              <FiZap className="text-orange-500" /> Continuous Sales Flow Builder
            </h1>
            <p className="text-neutral-400 text-xs">Configure customer pipeline stages, SMS outreach, scheduled phone calls, and continuous re-engagement loops.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowInactive(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${
              showInactive
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : "border-white/10 bg-white/5 text-neutral-400 hover:text-white"
            }`}
          >
            {showInactive ? <FiEye size={14} /> : <FiEyeOff size={14} />}
            {showInactive ? "Showing Inactive" : "Show Inactive"}
          </button>
          <button 
            onClick={handleRunSalesFlowExecution}
            disabled={executing}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <FiPlay size={14} className={executing ? "animate-spin" : ""} />
            {executing ? "Executing..." : "Run Flow Automation"}
          </button>
          <button 
            onClick={() => handleOpenModal()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all"
          >
            <FiPlus size={14} /> Add Stage
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-950/20 text-red-400 text-xs">{error}</div>
      )}

      {/* Stages List */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-neutral-500">
          <FiRefreshCw size={24} className="animate-spin mr-2" /> Loading stages...
        </div>
      ) : visibleStages.length === 0 ? (
        <div className="text-center p-12 rounded-2xl border border-dashed border-white/10 text-neutral-500 text-sm">
          No stages found. Click &quot;Add Stage&quot; to create the first one.
        </div>
      ) : (
        <div className="space-y-2">
          {visibleStages.map((stage, idx) => (
            <div
              key={stage.id}
              className={`p-4 bg-neutral-900 border rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all ${
                stage.isActive ? "border-white/10" : "border-white/5 opacity-60"
              }`}
            >
              {/* Left: order + color dot + name */}
              <div className="flex items-center gap-3">
                {/* Reorder arrows */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => handleReorder(stage, "up")}
                    disabled={idx === 0}
                    className="p-1 text-neutral-600 hover:text-neutral-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    title="Move up"
                  >
                    <FiChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => handleReorder(stage, "down")}
                    disabled={idx === visibleStages.length - 1}
                    className="p-1 text-neutral-600 hover:text-neutral-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    title="Move down"
                  >
                    <FiChevronDown size={14} />
                  </button>
                </div>

                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />

                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black text-neutral-600 w-5 text-right">{stage.order + 1}.</span>
                    {stage.name}
                    {stage.isDefault && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-neutral-800 text-neutral-400 border border-white/5">DEFAULT</span>
                    )}
                    {!stage.isActive && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-red-950/40 text-red-400 border border-red-500/20">INACTIVE</span>
                    )}
                    {stage.flowConfig?.steps && stage.flowConfig.steps.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-500/20 text-orange-400 border border-orange-500/30">
                        ⚡ {stage.flowConfig.steps.length} Auto Step{stage.flowConfig.steps.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </h3>
                  {stage.description && (
                    <p className="text-xs text-neutral-400 mt-0.5">{stage.description}</p>
                  )}
                </div>
              </div>

              {/* Right: action buttons */}
              <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                <button
                  onClick={() => handleOpenFlowModal(stage)}
                  className="px-3 py-1.5 bg-orange-950/40 hover:bg-orange-900/60 border border-orange-500/40 text-orange-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                >
                  <FiZap size={13} /> Flow
                </button>
                <button
                  onClick={() => handleOpenModal(stage)}
                  className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors"
                  title="Edit stage"
                >
                  <FiEdit2 size={13} />
                </button>
                <button
                  onClick={() => handleToggleActive(stage)}
                  className={`p-2 rounded-lg transition-colors ${
                    stage.isActive
                      ? "bg-neutral-800 hover:bg-amber-900/40 text-neutral-400 hover:text-amber-400"
                      : "bg-neutral-800 hover:bg-emerald-900/40 text-neutral-400 hover:text-emerald-400"
                  }`}
                  title={stage.isActive ? "Deactivate stage" : "Activate stage"}
                >
                  {stage.isActive ? <FiEyeOff size={13} /> : <FiEye size={13} />}
                </button>
                {!stage.isDefault && (
                  <button
                    onClick={() => handleDelete(stage)}
                    className="p-2 bg-neutral-800 hover:bg-red-900/40 text-neutral-400 hover:text-red-400 rounded-lg transition-colors"
                    title="Delete stage"
                  >
                    <FiTrash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stage Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 p-6 rounded-2xl w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{editingStage?.id ? "Edit Stage" : "Create Stage"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-white"><FiX size={16} /></button>
            </div>
            <form onSubmit={handleSaveStage} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-neutral-400 block mb-1">Stage Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-400 block mb-1">Badge Color</label>
                <input
                  type="color"
                  value={formColor}
                  onChange={e => setFormColor(e.target.value)}
                  className="w-16 h-10 rounded-lg cursor-pointer bg-transparent border border-white/10"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-400 block mb-1">Description</label>
                <textarea
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-neutral-800 text-neutral-300 text-xs font-bold rounded-xl">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-orange-600 text-white text-xs font-bold rounded-xl disabled:opacity-50">{saving ? "Saving..." : "Save Stage"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Flow Builder Modal */}
      {isFlowModalOpen && activeStageForFlow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 p-6 rounded-2xl w-full max-w-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FiZap className="text-orange-500" /> Sales Flow: {activeStageForFlow.name}
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">Define automated SMS outreach, phone call tasks, and continuous loop re-engagement rules.</p>
              </div>
              <button onClick={() => setIsFlowModalOpen(false)} className="p-1 text-neutral-400 hover:text-white">
                <FiX size={18} />
              </button>
            </div>

            {/* Add Step Buttons */}
            <div className="flex flex-wrap gap-2 bg-black/40 p-2.5 rounded-xl border border-white/5">
              <span className="text-xs font-bold text-neutral-400 self-center mr-1">Add Step:</span>
              <button onClick={() => handleAddFlowStep("SMS_CAMPAIGN")} className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/20 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all">
                <FiMessageSquare size={13} /> SMS Campaign
              </button>
              <button onClick={() => handleAddFlowStep("CALL_TASK")} className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all">
                <FiPhoneCall size={13} /> Schedule Phone Call
              </button>
              <button onClick={() => handleAddFlowStep("NOTIFICATION")} className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all">
                <FiBell size={13} /> Sales Alert
              </button>
            </div>

            {/* Step Sequence */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Workflow Step Sequence</h4>
              {flowSteps.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-500 border border-dashed border-white/10 rounded-xl">
                  No automated steps configured for this stage yet. Click above to add SMS, Phone Calls, or Notifications.
                </div>
              ) : (
                flowSteps.map((step, index) => (
                  <div key={step.id} className="p-3.5 bg-neutral-950 border border-white/10 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-black flex items-center justify-center border border-orange-500/30">
                          {index + 1}
                        </span>
                        {step.type === "SMS_CAMPAIGN" ? "💬 SMS Outreach Campaign" : step.type === "CALL_TASK" ? "📞 Scheduled Phone Call Task" : "🔔 Sales Alert Notification"}
                      </span>
                      <button onClick={() => handleRemoveFlowStep(step.id)} className="text-red-400 hover:text-red-300 p-1 text-xs">
                        <FiTrash2 size={14} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="text-[10px] font-bold text-neutral-400 block mb-1">Step Title / Description</label>
                        <input
                          type="text"
                          value={step.title}
                          onChange={e => {
                            const val = e.target.value
                            setFlowSteps(prev => prev.map(s => s.id === step.id ? { ...s, title: val } : s))
                          }}
                          className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-neutral-400 block mb-1">Wait Timeframe (Hours before execution)</label>
                        <input
                          type="number"
                          value={step.waitHours || 24}
                          onChange={e => {
                            const val = parseInt(e.target.value, 10) || 0
                            setFlowSteps(prev => prev.map(s => s.id === step.id ? { ...s, waitHours: val } : s))
                          }}
                          className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                    </div>

                    {step.type === "SMS_CAMPAIGN" && (
                      <div>
                        <label className="text-[10px] font-bold text-neutral-400 block mb-1">SMS Template Message</label>
                        <textarea
                          value={step.message || ""}
                          onChange={e => {
                            const val = e.target.value
                            setFlowSteps(prev => prev.map(s => s.id === step.id ? { ...s, message: val } : s))
                          }}
                          rows={2}
                          className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                          placeholder="SMS body text..."
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Loop Rule */}
            <div className="p-4 bg-orange-950/20 border border-orange-500/30 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-orange-300 flex items-center gap-2">
                  <FiRepeat size={14} /> Continuous Loop Re-engagement Rule
                </h4>
                <input
                  type="checkbox"
                  checked={loopRule.enabled}
                  onChange={e => setLoopRule(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="w-4 h-4 rounded border-white/10 text-orange-600 focus:ring-orange-500 bg-neutral-800 cursor-pointer"
                />
              </div>

              {loopRule.enabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[10px] font-bold text-neutral-400 block mb-1">Max Inactivity Threshold (Days)</label>
                    <input
                      type="number"
                      value={loopRule.maxInactivityDays}
                      onChange={e => setLoopRule(prev => ({ ...prev, maxInactivityDays: parseInt(e.target.value, 10) || 30 }))}
                      className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-neutral-400 block mb-1">Loop Target Quality</label>
                    <select
                      value={loopRule.loopQuality || "WARM"}
                      onChange={e => setLoopRule(prev => ({ ...prev, loopQuality: e.target.value }))}
                      className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="HOT">🔥 Hot</option>
                      <option value="WARM">☀️ Warm</option>
                      <option value="COLD">❄️ Cold</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button onClick={() => setIsFlowModalOpen(false)} className="px-4 py-2 bg-neutral-800 text-neutral-300 text-xs font-bold rounded-xl">Cancel</button>
              <button onClick={handleSaveFlowConfig} disabled={saving} className="px-4 py-2 bg-orange-600 text-white text-xs font-bold rounded-xl disabled:opacity-50">{saving ? "Saving..." : "Save Flow Configuration"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
