"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { toast } from "react-hot-toast"
import { 
  FiAward, FiTarget, FiPlus, FiEdit3, FiTrash2, FiCheckCircle, 
  FiClock, FiUser, FiUsers, FiDollarSign, FiZap, FiRefreshCw,
  FiTrendingUp, FiFilter, FiCheck, FiX, FiInfo, FiImage,
  FiDownload, FiLayers
} from "react-icons/fi"

interface GoalBonus {
  id: string
  title: string
  description?: string
  scope: "INDIVIDUAL" | "TEAM"
  repId?: string
  repName?: string
  metric: "SUBTOTAL" | "NET_PROFIT" | "DEAD_PROFIT" | "INVOICES_COUNT"
  targetValue: number
  bonusAmount: number
  cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "ANNUALLY"
  isActive: boolean
  currentValue?: number
  isCompleted?: boolean
  percentComplete?: number
  periodBounds?: { start: string; end: string }
}

export default function GoalsBonusesPage() {
  const [goals, setGoals] = useState<GoalBonus[]>([])
  const [reps, setReps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCadence, setFilterCadence] = useState<string>("ALL")
  const [filterScope, setFilterScope] = useState<string>("ALL")

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [editingGoal, setEditingGoal] = useState<GoalBonus | null>(null)
  const [saving, setSaving] = useState(false)

  // Flyer Modal State
  const [showFlyerModal, setShowFlyerModal] = useState(false)
  const [flyerGoal, setFlyerGoal] = useState<GoalBonus | null>(null)
  const [flyerLoading, setFlyerLoading] = useState(false)
  const [flyerImageUrl, setFlyerImageUrl] = useState<string | null>(null)
  const [flyerTagline, setFlyerTagline] = useState("")
  const [flyerBodyCopy, setFlyerBodyCopy] = useState("")
  const [flyerMode, setFlyerMode] = useState<"overlay" | "ai_only">("overlay")
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    scope: "INDIVIDUAL",
    repId: "",
    repName: "",
    metric: "SUBTOTAL",
    targetValue: "",
    bonusAmount: "",
    cadence: "MONTHLY",
    isActive: true
  })

  useEffect(() => {
    fetchGoals()
  }, [])

  const fetchGoals = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/admin/goals-bonuses")
      const data = await res.json()
      if (data.success) {
        setGoals(data.goals || [])
        setReps(data.reps || [])
      } else {
        toast.error("Failed to load performance goals: " + data.error)
      }
    } catch (err) {
      console.error(err)
      toast.error("Network error loading goals")
    } finally {
      setLoading(false)
    }
  }

  const openAddModal = () => {
    setEditingGoal(null)
    setFormData({
      title: "",
      description: "",
      scope: "INDIVIDUAL",
      repId: reps[0]?.id || "",
      repName: reps[0]?.name || reps[0]?.email || "",
      metric: "SUBTOTAL",
      targetValue: "50000",
      bonusAmount: "500",
      cadence: "MONTHLY",
      isActive: true
    })
    setShowModal(true)
  }

  const openEditModal = (goal: GoalBonus) => {
    setEditingGoal(goal)
    setFormData({
      title: goal.title,
      description: goal.description || "",
      scope: goal.scope,
      repId: goal.repId || "",
      repName: goal.repName || "",
      metric: goal.metric,
      targetValue: String(goal.targetValue),
      bonusAmount: String(goal.bonusAmount),
      cadence: goal.cadence,
      isActive: goal.isActive
    })
    setShowModal(true)
  }

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title || !formData.targetValue || !formData.bonusAmount) {
      toast.error("Please fill in all required fields.")
      return
    }

    setSaving(true)
    try {
      const selectedRep = reps.find(r => r.id === formData.repId)
      const repName = formData.scope === "TEAM" ? "All Team Members" : (selectedRep?.name || selectedRep?.email || formData.repName)

      const payload = {
        ...(editingGoal ? { id: editingGoal.id } : {}),
        ...formData,
        repName,
        targetValue: parseFloat(formData.targetValue),
        bonusAmount: parseFloat(formData.bonusAmount)
      }

      const method = editingGoal ? "PUT" : "POST"
      const res = await fetch("/api/admin/goals-bonuses", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (data.success) {
        toast.success(editingGoal ? "Goal updated successfully!" : "Performance goal created successfully!")
        setShowModal(false)
        fetchGoals()
      } else {
        toast.error("Failed to save: " + data.error)
      }
    } catch (err: any) {
      toast.error("Error saving goal: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteGoal = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return
    try {
      const res = await fetch(`/api/admin/goals-bonuses?id=${id}`, { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        toast.success("Goal deleted.")
        fetchGoals()
      } else {
        toast.error("Failed to delete goal.")
      }
    } catch (err) {
      toast.error("Error deleting goal.")
    }
  }

  const handleToggleActive = async (goal: GoalBonus) => {
    try {
      const res = await fetch("/api/admin/goals-bonuses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: goal.id, isActive: !goal.isActive })
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Goal ${!goal.isActive ? 'activated' : 'paused'}`)
        fetchGoals()
      }
    } catch {}
  }

  // ── Flyer Generation ──
  const openFlyerModal = (goal: GoalBonus) => {
    setFlyerGoal(goal)
    setFlyerImageUrl(null)
    setFlyerTagline("")
    setFlyerBodyCopy("")
    setShowFlyerModal(true)
    generateFlyer(goal, flyerMode)
  }

  const generateFlyer = async (goal: GoalBonus, mode: "overlay" | "ai_only") => {
    setFlyerLoading(true)
    setFlyerImageUrl(null)
    try {
      const res = await fetch("/api/ai/generate-flyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: goal.title,
          description: goal.description || "",
          targetValue: goal.targetValue,
          bonusAmount: goal.bonusAmount,
          cadence: goal.cadence,
          scope: goal.scope,
          repName: goal.repName || "The Team",
          metric: goal.metric,
          mode
        })
      })
      const data = await res.json()
      if (data.success) {
        setFlyerImageUrl(data.imageUrl)
        setFlyerTagline(data.tagline)
        setFlyerBodyCopy(data.bodyCopy)
      } else {
        toast.error("Flyer generation failed: " + (data.error || "Unknown error"))
      }
    } catch (err: any) {
      toast.error("Network error generating flyer: " + err.message)
    } finally {
      setFlyerLoading(false)
    }
  }

  const handleFlyerModeToggle = (newMode: "overlay" | "ai_only") => {
    setFlyerMode(newMode)
    if (flyerGoal) generateFlyer(flyerGoal, newMode)
  }

  const downloadFlyer = useCallback(async () => {
    if (!flyerImageUrl || !flyerGoal) return

    if (flyerMode === "ai_only") {
      // Direct download of AI image
      try {
        const response = await fetch(flyerImageUrl)
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${flyerGoal.title.replace(/[^a-zA-Z0-9]/g, "_")}_flyer.png`
        a.click()
        URL.revokeObjectURL(url)
      } catch {
        toast.error("Failed to download image")
      }
      return
    }

    // Overlay mode: render canvas with text over the AI background
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")!
    canvas.width = 1024
    canvas.height = 1792

    // Draw background image
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 1024, 1792)

      // Dark gradient overlay for text legibility
      const grad = ctx.createLinearGradient(0, 0, 0, 1792)
      grad.addColorStop(0, "rgba(0,0,0,0.3)")
      grad.addColorStop(0.35, "rgba(0,0,0,0.1)")
      grad.addColorStop(0.6, "rgba(0,0,0,0.2)")
      grad.addColorStop(1, "rgba(0,0,0,0.85)")
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, 1024, 1792)

      // Top badge
      ctx.textAlign = "center"
      ctx.fillStyle = "#f59e0b"
      ctx.font = "bold 28px 'Segoe UI', Arial, sans-serif"
      ctx.letterSpacing = "8px"
      ctx.fillText(`⚡ ${flyerGoal.cadence} ${flyerGoal.scope === "TEAM" ? "TEAM" : ""} CONTEST ⚡`, 512, 120)
      ctx.letterSpacing = "0px"

      // Tagline
      ctx.fillStyle = "#ffffff"
      ctx.font = "900 72px 'Segoe UI', Impact, Arial, sans-serif"
      const taglineWords = flyerTagline.split(" ")
      let taglineLines: string[] = []
      let currentLine = ""
      for (const word of taglineWords) {
        const test = currentLine ? currentLine + " " + word : word
        if (ctx.measureText(test).width > 900) {
          taglineLines.push(currentLine)
          currentLine = word
        } else {
          currentLine = test
        }
      }
      if (currentLine) taglineLines.push(currentLine)
      const taglineY = 280
      taglineLines.forEach((line, i) => {
        ctx.fillText(line.toUpperCase(), 512, taglineY + i * 85)
      })

      // Body copy
      ctx.fillStyle = "rgba(255,255,255,0.85)"
      ctx.font = "400 32px 'Segoe UI', Arial, sans-serif"
      const bodyWords = flyerBodyCopy.split(" ")
      let bodyLines: string[] = []
      currentLine = ""
      for (const word of bodyWords) {
        const test = currentLine ? currentLine + " " + word : word
        if (ctx.measureText(test).width > 850) {
          bodyLines.push(currentLine)
          currentLine = word
        } else {
          currentLine = test
        }
      }
      if (currentLine) bodyLines.push(currentLine)
      const bodyY = taglineY + taglineLines.length * 85 + 60
      bodyLines.forEach((line, i) => {
        ctx.fillText(line, 512, bodyY + i * 44)
      })

      // Bottom section — Target & Bonus
      const bottomY = 1400

      // Target box
      ctx.fillStyle = "rgba(245, 158, 11, 0.15)"
      ctx.beginPath()
      ctx.roundRect(80, bottomY, 400, 160, 20)
      ctx.fill()
      ctx.strokeStyle = "rgba(245, 158, 11, 0.5)"
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = "#f59e0b"
      ctx.font = "bold 22px 'Segoe UI', Arial, sans-serif"
      ctx.letterSpacing = "4px"
      ctx.fillText("NUMBER TO BEAT", 280, bottomY + 45)
      ctx.letterSpacing = "0px"
      ctx.fillStyle = "#ffffff"
      ctx.font = "900 56px 'Segoe UI', Arial, sans-serif"
      const targetText = flyerGoal.metric === "INVOICES_COUNT"
        ? `${flyerGoal.targetValue} INVOICES`
        : `$${flyerGoal.targetValue.toLocaleString()}`
      ctx.fillText(targetText, 280, bottomY + 115)

      // Bonus box
      ctx.fillStyle = "rgba(16, 185, 129, 0.15)"
      ctx.beginPath()
      ctx.roundRect(544, bottomY, 400, 160, 20)
      ctx.fill()
      ctx.strokeStyle = "rgba(16, 185, 129, 0.5)"
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = "#10b981"
      ctx.font = "bold 22px 'Segoe UI', Arial, sans-serif"
      ctx.letterSpacing = "4px"
      ctx.fillText("BONUS REWARD", 744, bottomY + 45)
      ctx.letterSpacing = "0px"
      ctx.fillStyle = "#10b981"
      ctx.font = "900 56px 'Segoe UI', Arial, sans-serif"
      ctx.fillText(`$${flyerGoal.bonusAmount.toLocaleString()}`, 744, bottomY + 115)

      // Rep / Team line
      ctx.fillStyle = "rgba(255,255,255,0.6)"
      ctx.font = "500 28px 'Segoe UI', Arial, sans-serif"
      const assignee = flyerGoal.scope === "TEAM" ? "ALL TEAM MEMBERS" : (flyerGoal.repName || "ASSIGNED REP").toUpperCase()
      ctx.fillText(`🏆 ${assignee}`, 512, bottomY + 240)

      // Titan Diamond branding
      ctx.fillStyle = "rgba(255,255,255,0.35)"
      ctx.font = "bold 22px 'Segoe UI', Arial, sans-serif"
      ctx.letterSpacing = "6px"
      ctx.fillText("TITAN DIAMOND", 512, 1740)
      ctx.letterSpacing = "0px"

      // Download
      canvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${flyerGoal.title.replace(/[^a-zA-Z0-9]/g, "_")}_flyer.png`
        a.click()
        URL.revokeObjectURL(url)
      }, "image/png")
    }
    img.src = flyerImageUrl
  }, [flyerImageUrl, flyerGoal, flyerMode, flyerTagline, flyerBodyCopy])

  const filteredGoals = goals.filter(g => {
    if (filterCadence !== "ALL" && g.cadence !== filterCadence) return false
    if (filterScope !== "ALL" && g.scope !== filterScope) return false
    return true
  })

  // Executive Metrics
  const activeGoalsCount = goals.filter(g => g.isActive).length
  const completedGoalsCount = goals.filter(g => g.isActive && g.isCompleted).length
  const totalPotentialBonuses = goals.filter(g => g.isActive).reduce((sum, g) => sum + g.bonusAmount, 0)
  const totalEarnedBonuses = goals.filter(g => g.isActive && g.isCompleted).reduce((sum, g) => sum + g.bonusAmount, 0)

  const fmtCurrency = (val: number) => `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center">
            <FiAward className="text-amber-500" size={17} />
          </div>
          <div>
            <h1 className="page-title">Performance Goals & Bonus Management</h1>
            <p className="page-subtitle">Configure goal-completion bonuses tied to daily, weekly, monthly, or annual targets for representatives and team sprints.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchGoals}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-bold rounded-xl bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition flex items-center gap-1.5"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} size={14} /> Refresh
          </button>
          <button
            onClick={openAddModal}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 transition flex items-center gap-2"
          >
            <FiPlus size={16} /> Create Goal Bonus
          </button>
        </div>
      </div>

      <div className="page-body">

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-white/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <FiTarget size={24} />
          </div>
          <div>
            <div className="text-xs text-neutral-400 font-medium">Active Goal Rules</div>
            <div className="text-2xl font-black text-white">{activeGoalsCount}</div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-white/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <FiCheckCircle size={24} />
          </div>
          <div>
            <div className="text-xs text-neutral-400 font-medium">Goals Beaten (Current)</div>
            <div className="text-2xl font-black text-emerald-400">{completedGoalsCount}</div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-white/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <FiDollarSign size={24} />
          </div>
          <div>
            <div className="text-xs text-neutral-400 font-medium">Earned Performance Bonuses</div>
            <div className="text-2xl font-black text-emerald-400">{fmtCurrency(totalEarnedBonuses)}</div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-white/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
            <FiZap size={24} />
          </div>
          <div>
            <div className="text-xs text-neutral-400 font-medium">Total Bonus Pool</div>
            <div className="text-2xl font-black text-purple-400">{fmtCurrency(totalPotentialBonuses)}</div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="glass-panel p-3.5 rounded-2xl border border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-neutral-400 flex items-center gap-1 mr-1">
            <FiFilter size={14} /> Cadence:
          </span>
          {["ALL", "DAILY", "WEEKLY", "MONTHLY", "ANNUALLY"].map(cad => (
            <button
              key={cad}
              onClick={() => setFilterCadence(cad)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                filterCadence === cad
                  ? "bg-amber-500 text-black shadow-md"
                  : "bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10"
              }`}
            >
              {cad}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-neutral-400">Scope:</span>
          {["ALL", "INDIVIDUAL", "TEAM"].map(sc => (
            <button
              key={sc}
              onClick={() => setFilterScope(sc)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                filterScope === sc
                  ? "bg-purple-500 text-white shadow-md"
                  : "bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10"
              }`}
            >
              {sc}
            </button>
          ))}
        </div>
      </div>

      {/* Goal Cards Grid */}
      {loading ? (
        <div className="p-12 text-center text-neutral-500">
          <FiRefreshCw className="animate-spin mx-auto text-amber-500 mb-2" size={28} />
          Loading performance goals and progress calculations...
        </div>
      ) : filteredGoals.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl border border-white/10 text-center text-neutral-400 space-y-3">
          <FiTarget size={36} className="mx-auto text-neutral-600" />
          <div className="text-base font-bold text-white">No performance goals configured</div>
          <p className="text-xs text-neutral-500 max-w-md mx-auto">
            Click "Create Goal Bonus" to set up performance-based bonuses tied to revenue, profit, or invoice targets.
          </p>
          <button
            onClick={openAddModal}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-black inline-flex items-center gap-2"
          >
            <FiPlus size={16} /> Create Goal Bonus
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredGoals.map(goal => {
            const isCompleted = goal.isCompleted
            const pct = goal.percentComplete || 0

            return (
              <div
                key={goal.id}
                className={`glass-panel p-5 rounded-2xl border transition-all relative flex flex-col justify-between ${
                  !goal.isActive 
                    ? "opacity-60 border-white/5 bg-neutral-900/40"
                    : isCompleted
                    ? "border-emerald-500/40 bg-emerald-950/20 shadow-xl shadow-emerald-950/40"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                {/* Header */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        goal.cadence === "DAILY" ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" :
                        goal.cadence === "WEEKLY" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" :
                        goal.cadence === "ANNUALLY" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" :
                        "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      }`}>
                        {goal.cadence}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        goal.scope === "TEAM" ? "bg-purple-500/20 text-purple-300" : "bg-neutral-800 text-neutral-300"
                      }`}>
                        {goal.scope === "TEAM" ? "👥 TEAM GOAL" : `👤 ${goal.repName}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openFlyerModal(goal)}
                        className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/20 transition"
                        title="Generate AI Flyer"
                      >
                        <FiImage size={14} />
                      </button>
                      <button
                        onClick={() => handleToggleActive(goal)}
                        className={`p-1.5 rounded-lg text-xs transition ${
                          goal.isActive ? "text-emerald-400 hover:bg-emerald-500/20" : "text-neutral-500 hover:bg-white/10"
                        }`}
                        title={goal.isActive ? "Active Rule" : "Paused Rule"}
                      >
                        <FiZap size={14} />
                      </button>
                      <button
                        onClick={() => openEditModal(goal)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition"
                        title="Edit Goal Rule"
                      >
                        <FiEdit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteGoal(goal.id, goal.title)}
                        className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition"
                        title="Delete Goal Rule"
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-base font-bold text-white tracking-tight leading-snug">
                    {goal.title}
                  </h3>
                  {goal.description && (
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-2">
                      {goal.description}
                    </p>
                  )}

                  {/* Goal Bonus Ribbon */}
                  <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Number To Beat</div>
                      <div className="text-sm font-black text-white">
                        {goal.metric === "INVOICES_COUNT" ? `${goal.targetValue} Invoices` : fmtCurrency(goal.targetValue)}
                        <span className="text-[10px] text-neutral-400 font-normal ml-1">({goal.metric.replace("_", " ")})</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Bonus Reward</div>
                      <div className="text-base font-black text-emerald-400">{fmtCurrency(goal.bonusAmount)}</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-neutral-400">Current Progress:</span>
                      <span className={isCompleted ? "text-emerald-400" : "text-amber-400"}>
                        {goal.metric === "INVOICES_COUNT" ? `${goal.currentValue || 0} / ${goal.targetValue}` : `${fmtCurrency(goal.currentValue || 0)} / ${fmtCurrency(goal.targetValue)}`} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-neutral-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 rounded-full ${
                          isCompleted ? "bg-emerald-400 shadow-md shadow-emerald-500/50" : "bg-gradient-to-r from-amber-500 to-emerald-400"
                        }`}
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between">
                  {isCompleted ? (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                      <FiCheckCircle size={16} /> 🎯 TARGET BEATEN! ${goal.bonusAmount} EARNED
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-400">
                      <FiClock size={14} className="text-amber-400" /> In Progress for current {goal.cadence.toLowerCase()} period
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      </div>

      {/* Modal: Create/Edit Goal Bonus */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-lg rounded-2xl border border-white/15 bg-neutral-900 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FiAward className="text-amber-400" /> {editingGoal ? "Edit Goal Bonus" : "Create Performance Goal & Bonus"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-white">
                <FiX size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveGoal} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-neutral-300 mb-1">Goal Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Monthly $50k Subtotal Crusher Bonus"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-300 mb-1">Description / Notes</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional details or criteria..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 h-16 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Goal Scope *</label>
                  <select
                    value={formData.scope}
                    onChange={e => setFormData({ ...formData, scope: e.target.value as any })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="INDIVIDUAL">Individual Sales Rep</option>
                    <option value="TEAM">Company Team Goal</option>
                  </select>
                </div>

                {formData.scope === "INDIVIDUAL" ? (
                  <div>
                    <label className="block font-bold text-neutral-300 mb-1">Assign Representative *</label>
                    <select
                      value={formData.repId}
                      onChange={e => {
                        const r = reps.find(rep => rep.id === e.target.value)
                        setFormData({ ...formData, repId: e.target.value, repName: r?.name || r?.email || "" })
                      }}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      {reps.map(rep => (
                        <option key={rep.id} value={rep.id}>
                          {rep.name} ({rep.role})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block font-bold text-neutral-300 mb-1">Target Audience</label>
                    <input
                      type="text"
                      disabled
                      value="All Team Members"
                      className="w-full bg-neutral-800 border border-white/5 rounded-xl px-3 py-2 text-neutral-400"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Cadence / Frequency *</label>
                  <select
                    value={formData.cadence}
                    onChange={e => setFormData({ ...formData, cadence: e.target.value as any })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="DAILY">DAILY</option>
                    <option value="WEEKLY">WEEKLY</option>
                    <option value="MONTHLY">MONTHLY</option>
                    <option value="ANNUALLY">ANNUALLY</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Target Metric *</label>
                  <select
                    value={formData.metric}
                    onChange={e => setFormData({ ...formData, metric: e.target.value as any })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="SUBTOTAL">Subtotal / Revenue ($)</option>
                    <option value="NET_PROFIT">Net Profit ($)</option>
                    <option value="DEAD_PROFIT">Dead Profit ($)</option>
                    <option value="INVOICES_COUNT">Invoice Count (#)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Number To Beat (Target) *</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.targetValue}
                    onChange={e => setFormData({ ...formData, targetValue: e.target.value })}
                    placeholder="e.g. 50000"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Bonus Reward ($) *</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.bonusAmount}
                    onChange={e => setFormData({ ...formData, bonusAmount: e.target.value })}
                    placeholder="e.g. 500"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={formData.isActive}
                  onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-white/10 bg-black/40 text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="isActiveToggle" className="text-xs font-bold text-white cursor-pointer select-none">
                  Enable Goal &amp; Bonus Rule
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 text-neutral-300 hover:text-white font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold flex items-center gap-2 shadow-lg shadow-amber-500/20"
                >
                  {saving ? <FiRefreshCw className="animate-spin" /> : <FiCheck />}
                  {editingGoal ? "Update Goal Bonus" : "Save Goal Bonus"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: AI Flyer Generator */}
      {showFlyerModal && flyerGoal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-2xl max-h-[90vh] rounded-2xl border border-white/15 bg-neutral-900 shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center">
                  <FiImage className="text-amber-400" size={17} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">AI Contest Flyer</h2>
                  <p className="text-[11px] text-neutral-400">{flyerGoal.title}</p>
                </div>
              </div>
              <button onClick={() => setShowFlyerModal(false)} className="text-neutral-400 hover:text-white transition">
                <FiX size={18} />
              </button>
            </div>

            {/* Mode Toggle */}
            <div className="flex items-center gap-2 px-5 pt-4 shrink-0">
              <span className="text-[11px] text-neutral-400 font-bold">Style:</span>
              <button
                onClick={() => handleFlyerModeToggle("overlay")}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 ${
                  flyerMode === "overlay"
                    ? "bg-amber-500 text-black shadow-md"
                    : "bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <FiLayers size={12} /> AI Image + Text Overlay
              </button>
              <button
                onClick={() => handleFlyerModeToggle("ai_only")}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 ${
                  flyerMode === "ai_only"
                    ? "bg-amber-500 text-black shadow-md"
                    : "bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <FiZap size={12} /> Full AI Design
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {flyerLoading ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <div className="relative w-20 h-20">
                    <div className="absolute inset-0 rounded-full border-4 border-amber-500/20"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-t-amber-500 animate-spin"></div>
                    <div className="absolute inset-3 rounded-full border-4 border-t-emerald-400 border-emerald-400/10 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-white">Generating your contest flyer...</p>
                    <p className="text-xs text-neutral-500 mt-1">AI is crafting a badass promotional design</p>
                  </div>
                  {/* Shimmer placeholders */}
                  <div className="w-full max-w-md space-y-3 mt-6">
                    <div className="h-64 rounded-xl bg-gradient-to-r from-neutral-800 via-neutral-700 to-neutral-800 animate-pulse"></div>
                    <div className="h-4 w-3/4 mx-auto rounded-full bg-neutral-800 animate-pulse"></div>
                    <div className="h-3 w-1/2 mx-auto rounded-full bg-neutral-800 animate-pulse"></div>
                  </div>
                </div>
              ) : flyerImageUrl ? (
                <div className="space-y-4">
                  {/* Flyer Image */}
                  <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl">
                    <img
                      src={flyerImageUrl}
                      alt="AI Generated Contest Flyer"
                      className="w-full h-auto"
                      crossOrigin="anonymous"
                    />
                    {/* Overlay preview indicator */}
                    {flyerMode === "overlay" && (
                      <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-[10px] font-bold text-amber-400 border border-amber-500/30">
                        ✦ Text overlaid on download
                      </div>
                    )}
                  </div>

                  {/* Generated Copy */}
                  <div className="glass-panel p-4 rounded-xl border border-white/10 space-y-2">
                    <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">AI Tagline</p>
                    <p className="text-lg font-black text-white tracking-tight">{flyerTagline}</p>
                    <p className="text-xs text-neutral-300 leading-relaxed">{flyerBodyCopy}</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FiImage size={48} className="text-neutral-600 mb-3" />
                  <p className="text-sm text-neutral-400">Click Generate to create a flyer</p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between gap-2 p-5 border-t border-white/10 shrink-0">
              <button
                onClick={() => setShowFlyerModal(false)}
                className="px-4 py-2 rounded-xl bg-neutral-800 text-neutral-300 hover:text-white text-xs font-bold transition"
              >
                Close
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => flyerGoal && generateFlyer(flyerGoal, flyerMode)}
                  disabled={flyerLoading}
                  className="px-4 py-2 rounded-xl bg-white/5 text-neutral-300 hover:text-white hover:bg-white/10 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <FiRefreshCw className={flyerLoading ? "animate-spin" : ""} size={14} /> Regenerate
                </button>
                <button
                  onClick={downloadFlyer}
                  disabled={!flyerImageUrl || flyerLoading}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FiDownload size={14} /> Download Flyer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
