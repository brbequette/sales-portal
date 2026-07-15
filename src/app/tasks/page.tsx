"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useZoho } from "@/components/ZohoProvider"
import Link from "next/link"
import {
  FiPhone, FiMail, FiMessageSquare, FiCheckSquare, FiSettings,
  FiCalendar, FiList, FiPlus, FiRefreshCw, FiChevronLeft, FiChevronRight,
  FiClock, FiUser, FiLink, FiFileText, FiAlertCircle, FiCheck,
  FiEdit2, FiX, FiFilter, FiChevronDown, FiSave, FiFlag
} from "react-icons/fi"

// ─── Types ────────────────────────────────────────────────────────────────────
type TaskType = "Task" | "Call" | "Email" | "Text" | "Processing"
type TaskStatus = "Not Started" | "In Progress" | "Deferred" | "Completed" | "Waiting on someone else"
type TaskPriority = "High" | "Normal" | "Low"
type TaskCategory = "all" | "communication" | "sales" | "process"
type CalendarView = "day" | "week" | "month" | "year"

interface Task {
  id: string
  zohoId: string
  title: string
  subject?: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  type: TaskType
  dueDate: string | null
  ownerId: string
  ownerName?: string
  accountId?: string
  accountName?: string
  dealId?: string
  dealName?: string
  invoiceId?: string
  salesOrderId?: string
  quoteId?: string
  estimateId?: string
  reminderAt?: string | null
  reminderMethod?: string | null
  reminderFired?: boolean
  category?: TaskCategory
}

// ─── Category Classification ──────────────────────────────────────────────────
function classifyTask(task: Task): TaskCategory {
  const type = (task.type || "Task").toLowerCase()
  if (["call", "email", "text"].includes(type)) return "communication"
  if (type === "processing") return "process"
  // Linked to account/deal → Sales
  if (task.accountId || task.dealId || task.accountName) return "sales"
  return "process"
}

// ─── Category Config ──────────────────────────────────────────────────────────
const CATEGORY_CONFIG = {
  all:           { label: "All Tasks",       color: "text-white",       bg: "bg-white/10",         border: "border-white/20",        dot: "bg-white" },
  communication: { label: "Communication",   color: "text-sky-400",     bg: "bg-sky-500/10",       border: "border-sky-500/30",      dot: "bg-sky-400" },
  sales:         { label: "Sales",           color: "text-emerald-400", bg: "bg-emerald-500/10",   border: "border-emerald-500/30",  dot: "bg-emerald-400" },
  process:       { label: "Office & Process",color: "text-amber-400",   bg: "bg-amber-500/10",     border: "border-amber-500/30",   dot: "bg-amber-400" },
}

// ─── Type Icons ───────────────────────────────────────────────────────────────
const TYPE_ICONS: Record<string, React.ReactNode> = {
  Call:       <FiPhone size={13} />,
  Email:      <FiMail size={13} />,
  Text:       <FiMessageSquare size={13} />,
  Task:       <FiCheckSquare size={13} />,
  Processing: <FiSettings size={13} />,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d: string | null): string {
  if (!d) return ""
  const dt = new Date(d)
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
function formatTime(d: string | null): string {
  if (!d) return ""
  const dt = new Date(d)
  const h = dt.getHours(), m = dt.getMinutes()
  if (h === 0 && m === 0) return ""
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}
function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === "Completed") return false
  return new Date(task.dueDate) < new Date()
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    "Completed":              "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    "In Progress":            "bg-sky-500/20 text-sky-300 border-sky-500/30",
    "Waiting on someone else":"bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    "Deferred":               "bg-neutral-500/20 text-neutral-400 border-neutral-500/30",
    "Not Started":            "bg-white/5 text-neutral-400 border-white/10",
  }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg[status] || cfg["Not Started"]}`}>
      {status === "Waiting on someone else" ? "Waiting" : status}
    </span>
  )
}

// ─── PRIORITY BADGE ───────────────────────────────────────────────────────────
function PriorityBadge({ priority }: { priority: string }) {
  const cfg: Record<string, string> = {
    "High":   "text-red-400",
    "Normal": "text-neutral-500",
    "Low":    "text-blue-400",
  }
  return <FiFlag size={12} className={cfg[priority] || cfg["Normal"]} title={priority + " Priority"} />
}

// ─── TASK CARD ────────────────────────────────────────────────────────────────
function TaskCard({ task, onUpdate, onComplete, onSelect }: {
  task: Task
  onUpdate: (id: string, data: Partial<Task>) => Promise<void>
  onComplete: (id: string) => Promise<void>
  onSelect: (task: Task) => void
}) {
  const [editingOutcome, setEditingOutcome] = useState(false)
  const [outcomeText, setOutcomeText] = useState("")
  const [savingOutcome, setSavingOutcome] = useState(false)
  const [editingStatus, setEditingStatus] = useState(false)

  const cat = task.category || classifyTask(task)
  const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.process
  const overdue = isOverdue(task)
  const completed = task.status === "Completed"

  const handleSaveOutcome = async () => {
    if (!outcomeText.trim()) return
    setSavingOutcome(true)
    const now = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    const newDesc = task.description
      ? `${task.description}\n\n[Outcome ${now}]: ${outcomeText.trim()}`
      : `[Outcome ${now}]: ${outcomeText.trim()}`
    await onUpdate(task.zohoId, { description: newDesc })
    setOutcomeText("")
    setEditingOutcome(false)
    setSavingOutcome(false)
  }

  const handleStatusChange = async (status: string) => {
    setEditingStatus(false)
    await onUpdate(task.zohoId, { status: status as TaskStatus })
  }

  return (
    <div className={`relative rounded-xl border p-4 transition-all hover:border-white/20 group ${
      completed ? "opacity-60 border-white/5 bg-white/2" : overdue ? "border-red-500/30 bg-red-500/5" : `${cfg.border} bg-[#0d0e10]`
    }`}>
      {/* Category indicator strip */}
      <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${cfg.dot}`} />

      <div className="pl-3">
        {/* Header row */}
        <div className="flex items-start gap-2 mb-2">
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.border} ${cfg.bg} ${cfg.color}`}>
            {TYPE_ICONS[task.type] || TYPE_ICONS.Task}
            {task.type}
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
          </div>
        </div>

        {/* Title */}
        <button
          onClick={() => onSelect(task)}
          className="text-sm font-semibold text-white text-left hover:text-violet-300 transition-colors line-clamp-2 w-full mb-1"
        >
          {task.title}
        </button>

        {/* Description preview */}
        {task.description && (
          <p className="text-xs text-neutral-400 line-clamp-2 mb-2">{task.description}</p>
        )}

        {/* Connected Assets */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {task.accountName && (
            <Link href={`/account?id=${task.accountId || ""}`}
              className="flex items-center gap-1 text-[10px] text-sky-400 bg-sky-500/10 border border-sky-500/20 rounded-full px-2 py-0.5 hover:bg-sky-500/20 transition-colors"
            >
              <FiUser size={9} /> {task.accountName}
            </Link>
          )}
          {task.invoiceId && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
              <FiFileText size={9} /> INV: {task.invoiceId.slice(0, 8)}…
            </span>
          )}
          {task.salesOrderId && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
              <FiFileText size={9} /> SO: {task.salesOrderId.slice(0, 8)}…
            </span>
          )}
          {task.quoteId && (
            <span className="flex items-center gap-1 text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full px-2 py-0.5">
              <FiFileText size={9} /> QT: {task.quoteId.slice(0, 8)}…
            </span>
          )}
          {task.dealName && (
            <span className="flex items-center gap-1 text-[10px] text-fuchsia-400 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-full px-2 py-0.5">
              <FiLink size={9} /> {task.dealName}
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            {task.dueDate && (
              <span className={`flex items-center gap-1 text-[10px] font-medium ${overdue && !completed ? "text-red-400" : "text-neutral-500"}`}>
                <FiClock size={9} />
                {overdue && !completed && <FiAlertCircle size={9} />}
                {formatDate(task.dueDate)}
                {formatTime(task.dueDate) && ` ${formatTime(task.dueDate)}`}
              </span>
            )}
            {task.ownerName && (
              <span className="text-[10px] text-neutral-600 flex items-center gap-1">
                <FiUser size={9} /> {task.ownerName}
              </span>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Status quick select */}
            <div className="relative">
              <button
                onClick={() => setEditingStatus(!editingStatus)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-all"
                title="Change status"
              >
                <FiEdit2 size={12} />
              </button>
              {editingStatus && (
                <div className="absolute bottom-full right-0 mb-1 bg-[#1a1b1e] border border-white/10 rounded-xl shadow-2xl z-20 py-1 w-44">
                  {["Not Started", "In Progress", "Waiting on someone else", "Deferred", "Completed"].map(s => (
                    <button key={s} onClick={() => handleStatusChange(s)}
                      className={`w-full text-left text-xs px-3 py-2 hover:bg-white/5 transition-colors ${task.status === s ? "text-white font-bold" : "text-neutral-400"}`}
                    >
                      {s === "Waiting on someone else" ? "Waiting" : s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Add outcome */}
            <button
              onClick={() => setEditingOutcome(!editingOutcome)}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-violet-400 hover:bg-violet-500/10 transition-all"
              title="Add outcome / note"
            >
              <FiMessageSquare size={12} />
            </button>

            {/* Complete */}
            {!completed && (
              <button
                onClick={() => onComplete(task.zohoId)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                title="Mark complete"
              >
                <FiCheck size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Outcome input */}
        {editingOutcome && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <textarea
              autoFocus
              value={outcomeText}
              onChange={e => setOutcomeText(e.target.value)}
              placeholder="Add outcome or update note…"
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 resize-none focus:outline-none focus:border-violet-500/50"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={handleSaveOutcome} disabled={savingOutcome || !outcomeText.trim()}
                className="flex items-center gap-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-all"
              >
                <FiSave size={10} /> {savingOutcome ? "Saving…" : "Save"}
              </button>
              <button onClick={() => { setEditingOutcome(false); setOutcomeText("") }}
                className="text-xs text-neutral-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
              >Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TASK DETAIL PANEL ────────────────────────────────────────────────────────
function TaskDetailPanel({ task, onClose, onUpdate, onComplete }: {
  task: Task | null
  onClose: () => void
  onUpdate: (id: string, data: Partial<Task>) => Promise<void>
  onComplete: (id: string) => Promise<void>
}) {
  const [editSubject, setEditSubject] = useState("")
  const [editDesc, setEditDesc] = useState("")
  const [editStatus, setEditStatus] = useState<TaskStatus>("Not Started")
  const [editPriority, setEditPriority] = useState<TaskPriority>("Normal")
  const [saving, setSaving] = useState(false)
  const [outcomeText, setOutcomeText] = useState("")

  useEffect(() => {
    if (task) {
      setEditSubject(task.title)
      setEditDesc(task.description || "")
      setEditStatus(task.status)
      setEditPriority(task.priority)
    }
  }, [task])

  if (!task) return null

  const cat = task.category || classifyTask(task)
  const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.process
  const overdue = isOverdue(task)

  const handleSave = async () => {
    setSaving(true)
    await onUpdate(task.zohoId, {
      title: editSubject,
      description: editDesc,
      status: editStatus,
      priority: editPriority,
    })
    setSaving(false)
  }

  const handleAddOutcome = async () => {
    if (!outcomeText.trim()) return
    const now = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    const newDesc = editDesc
      ? `${editDesc}\n\n[Outcome ${now}]: ${outcomeText.trim()}`
      : `[Outcome ${now}]: ${outcomeText.trim()}`
    setEditDesc(newDesc)
    setOutcomeText("")
  }

  // Parse outcomes from description
  const outcomeLines = (task.description || "").split("\n").filter(l => l.startsWith("[Outcome "))
  const baseDesc = (task.description || "").split("\n").filter(l => !l.startsWith("[Outcome ")).join("\n").trim()

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0f1012] border-l border-white/10 flex flex-col shadow-2xl animate-slide-in-right overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-5 border-b border-white/10 ${cfg.bg}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.border} ${cfg.color}`}>
              {TYPE_ICONS[task.type] || TYPE_ICONS.Task}
              {task.type}
            </div>
            <StatusBadge status={task.status} />
            {overdue && <span className="text-[10px] font-bold text-red-400 flex items-center gap-1"><FiAlertCircle size={10} /> OVERDUE</span>}
            <button onClick={onClose} className="ml-auto text-neutral-500 hover:text-white transition-colors">
              <FiX size={18} />
            </button>
          </div>
          <input
            value={editSubject}
            onChange={e => setEditSubject(e.target.value)}
            className="w-full bg-transparent text-lg font-bold text-white placeholder-neutral-500 focus:outline-none"
          />
          {task.dueDate && (
            <p className={`text-xs mt-1 flex items-center gap-1 ${overdue ? "text-red-400" : "text-neutral-400"}`}>
              <FiClock size={10} />
              {overdue ? "Overdue · " : "Due: "}
              {formatDate(task.dueDate)} {formatTime(task.dueDate)}
            </p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold mb-1.5 block">Status</label>
              <select value={editStatus} onChange={e => setEditStatus(e.target.value as TaskStatus)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
              >
                {["Not Started", "In Progress", "Waiting on someone else", "Deferred", "Completed"].map(s => (
                  <option key={s} value={s}>{s === "Waiting on someone else" ? "Waiting" : s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold mb-1.5 block">Priority</label>
              <select value={editPriority} onChange={e => setEditPriority(e.target.value as TaskPriority)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
              >
                <option value="High">🔴 High</option>
                <option value="Normal">⚪ Normal</option>
                <option value="Low">🔵 Low</option>
              </select>
            </div>
          </div>

          {/* Connected Assets */}
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold mb-2 block">Connected Assets</label>
            <div className="space-y-1.5">
              {task.accountName && (
                <Link href={`/account?id=${task.accountId || ""}`}
                  className="flex items-center gap-2 text-xs text-sky-400 bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-2 hover:bg-sky-500/20 transition-colors"
                >
                  <FiUser size={12} /> <span className="font-medium">Account:</span> {task.accountName}
                </Link>
              )}
              {task.dealName && (
                <div className="flex items-center gap-2 text-xs text-fuchsia-400 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-lg px-3 py-2">
                  <FiLink size={12} /> <span className="font-medium">Deal:</span> {task.dealName}
                </div>
              )}
              {task.invoiceId && (
                <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  <FiFileText size={12} /> <span className="font-medium">Invoice ID:</span> {task.invoiceId}
                </div>
              )}
              {task.salesOrderId && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                  <FiFileText size={12} /> <span className="font-medium">Sales Order ID:</span> {task.salesOrderId}
                </div>
              )}
              {task.quoteId && (
                <div className="flex items-center gap-2 text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-2">
                  <FiFileText size={12} /> <span className="font-medium">Quote ID:</span> {task.quoteId}
                </div>
              )}
              {!task.accountName && !task.dealName && !task.invoiceId && !task.salesOrderId && !task.quoteId && (
                <p className="text-xs text-neutral-600 italic">No connected assets</p>
              )}
            </div>
          </div>

          {/* Description / Notes */}
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold mb-1.5 block">Notes</label>
            <textarea
              value={baseDesc}
              onChange={e => {
                const existing = editDesc.split("\n").filter(l => l.startsWith("[Outcome ")).join("\n")
                setEditDesc(existing ? `${e.target.value.trim()}\n\n${existing}` : e.target.value)
              }}
              rows={3}
              placeholder="Add notes…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 resize-none focus:outline-none focus:border-violet-500/50"
            />
          </div>

          {/* Outcomes */}
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold mb-2 block">
              Outcomes & Updates ({outcomeLines.length})
            </label>
            {outcomeLines.length > 0 && (
              <div className="space-y-2 mb-3">
                {outcomeLines.map((line, i) => (
                  <div key={i} className="bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-2">
                    <p className="text-xs text-violet-300">{line}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                value={outcomeText}
                onChange={e => setOutcomeText(e.target.value)}
                placeholder="Add outcome or update…"
                rows={2}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 resize-none focus:outline-none focus:border-violet-500/50"
              />
              <button onClick={handleAddOutcome} disabled={!outcomeText.trim()}
                className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-all self-end"
              >
                Add
              </button>
            </div>
          </div>

          {/* Assignee */}
          {task.ownerName && (
            <div>
              <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold mb-1 block">Assigned To</label>
              <p className="text-sm text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center text-[10px] font-bold">
                  {task.ownerName.charAt(0)}
                </span>
                {task.ownerName}
              </p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl transition-all"
          >
            <FiSave size={14} /> {saving ? "Saving…" : "Save Changes"}
          </button>
          {task.status !== "Completed" && (
            <button onClick={() => onComplete(task.zohoId)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
            >
              <FiCheck size={14} /> Complete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── CALENDAR ─────────────────────────────────────────────────────────────────
function TaskCalendar({ tasks, activeCategories, onSelectTask }: {
  tasks: Task[]
  activeCategories: Set<TaskCategory>
  onSelectTask: (task: Task) => void
}) {
  const [view, setView] = useState<CalendarView>("month")
  const [currentDate, setCurrentDate] = useState(new Date())

  const visibleTasks = useMemo(() =>
    tasks.filter(t => {
      if (activeCategories.has("all")) return true
      const cat = t.category || classifyTask(t)
      return activeCategories.has(cat)
    }),
    [tasks, activeCategories]
  )

  const navigate = (dir: -1 | 1) => {
    const d = new Date(currentDate)
    if (view === "day")   d.setDate(d.getDate() + dir)
    if (view === "week")  d.setDate(d.getDate() + (dir * 7))
    if (view === "month") d.setMonth(d.getMonth() + dir)
    if (view === "year")  d.setFullYear(d.getFullYear() + dir)
    setCurrentDate(d)
  }

  const getTitle = () => {
    if (view === "day")   return currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    if (view === "week") {
      const start = new Date(currentDate)
      start.setDate(start.getDate() - start.getDay())
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    }
    if (view === "month") return currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    return currentDate.getFullYear().toString()
  }

  const tasksOnDay = (day: Date) =>
    visibleTasks.filter(t => t.dueDate && isSameDay(new Date(t.dueDate), day))

  // MONTH VIEW
  const renderMonth = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const today = new Date()
    const cells: (Date | null)[] = Array(firstDay).fill(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
    while (cells.length % 7 !== 0) cells.push(null)

    return (
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="grid grid-cols-7 text-center">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 flex-1 auto-rows-fr">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="border border-white/5" />
            const dayTasks = tasksOnDay(day)
            const isToday = isSameDay(day, today)
            const isCurrent = isSameDay(day, currentDate)
            return (
              <div key={i}
                onClick={() => { setCurrentDate(day); setView("day") }}
                className={`border border-white/5 p-1 cursor-pointer hover:bg-white/5 transition-colors min-h-[60px] ${isToday ? "bg-violet-500/5 border-violet-500/30" : ""}`}
              >
                <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                  isToday ? "bg-violet-500 text-white" : "text-neutral-400"
                }`}>{day.getDate()}</span>
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 3).map(t => {
                    const cat = t.category || classifyTask(t)
                    const cfg = CATEGORY_CONFIG[cat]
                    return (
                      <button key={t.id} onClick={e => { e.stopPropagation(); onSelectTask(t) }}
                        className={`w-full text-left text-[9px] font-medium px-1.5 py-0.5 rounded truncate ${cfg.bg} ${cfg.color}`}
                      >
                        {t.title}
                      </button>
                    )
                  })}
                  {dayTasks.length > 3 && (
                    <p className="text-[9px] text-neutral-500 pl-1">+{dayTasks.length - 3} more</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // WEEK VIEW
  const renderWeek = () => {
    const start = new Date(currentDate)
    start.setDate(start.getDate() - start.getDay())
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      return d
    })
    const today = new Date()

    return (
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 min-h-full">
          {days.map((day, i) => {
            const dayTasks = tasksOnDay(day)
            const isToday = isSameDay(day, today)
            return (
              <div key={i} className={`border-r border-white/5 ${isToday ? "bg-violet-500/5" : ""}`}>
                <div className={`sticky top-0 text-center py-3 border-b border-white/10 ${isToday ? "bg-violet-500/10" : "bg-[#0f1012]"}`}>
                  <div className="text-[10px] font-bold text-neutral-500 uppercase">{day.toLocaleDateString("en-US", { weekday: "short" })}</div>
                  <div className={`text-lg font-black mt-0.5 ${isToday ? "text-violet-400" : "text-white"}`}>{day.getDate()}</div>
                </div>
                <div className="p-2 space-y-1.5">
                  {dayTasks.map(t => {
                    const cat = t.category || classifyTask(t)
                    const cfg = CATEGORY_CONFIG[cat]
                    return (
                      <button key={t.id} onClick={() => onSelectTask(t)}
                        className={`w-full text-left p-2 rounded-lg text-[10px] font-medium ${cfg.bg} border ${cfg.border} ${cfg.color} hover:brightness-110 transition-all`}
                      >
                        <div className="flex items-center gap-1 mb-0.5">{TYPE_ICONS[t.type]}{t.type}</div>
                        <div className="text-white line-clamp-2">{t.title}</div>
                        {t.dueDate && formatTime(t.dueDate) && (
                          <div className="mt-0.5 opacity-70">{formatTime(t.dueDate)}</div>
                        )}
                      </button>
                    )
                  })}
                  {dayTasks.length === 0 && (
                    <div className="text-[10px] text-neutral-700 text-center py-4">—</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // DAY VIEW
  const renderDay = () => {
    const dayTasks = tasksOnDay(currentDate)
    const today = isSameDay(currentDate, new Date())

    return (
      <div className="flex-1 overflow-auto px-4 py-4">
        <div className={`rounded-2xl border ${today ? "border-violet-500/30 bg-violet-500/5" : "border-white/10 bg-white/2"} p-6`}>
          <div className="text-center mb-6">
            <div className="text-sm font-bold text-neutral-400 uppercase tracking-widest">
              {currentDate.toLocaleDateString("en-US", { weekday: "long" })}
            </div>
            <div className={`text-5xl font-black mt-1 ${today ? "text-violet-400" : "text-white"}`}>
              {currentDate.getDate()}
            </div>
            <div className="text-sm text-neutral-400 mt-1">
              {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </div>
          </div>

          {dayTasks.length === 0 ? (
            <div className="text-center py-8 text-neutral-600">
              <FiCalendar size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No tasks due this day</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayTasks.map(t => {
                const cat = t.category || classifyTask(t)
                const cfg = CATEGORY_CONFIG[cat]
                return (
                  <button key={t.id} onClick={() => onSelectTask(t)}
                    className={`w-full text-left p-4 rounded-xl border ${cfg.border} ${cfg.bg} hover:brightness-110 transition-all`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`flex items-center gap-1 text-[10px] font-bold ${cfg.color}`}>{TYPE_ICONS[t.type]} {t.type}</span>
                      <StatusBadge status={t.status} />
                      <PriorityBadge priority={t.priority} />
                      {t.dueDate && formatTime(t.dueDate) && (
                        <span className="ml-auto text-[10px] text-neutral-500 flex items-center gap-1"><FiClock size={9} />{formatTime(t.dueDate)}</span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-white">{t.title}</div>
                    {t.accountName && <div className="text-xs text-sky-400 mt-1 flex items-center gap-1"><FiUser size={9}/>{t.accountName}</div>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // YEAR VIEW — heatmap grid
  const renderYear = () => {
    const year = currentDate.getFullYear()
    const today = new Date()
    const months = Array.from({ length: 12 }, (_, m) => {
      const daysInMonth = new Date(year, m + 1, 0).getDate()
      const firstDay = new Date(year, m, 1).getDay()
      return { month: m, daysInMonth, firstDay }
    })

    return (
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-3 gap-4">
          {months.map(({ month, daysInMonth, firstDay }) => {
            const monthDate = new Date(year, month, 1)
            const cells: (Date | null)[] = Array(firstDay).fill(null)
            for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))

            return (
              <div key={month} className="rounded-xl border border-white/10 p-3 bg-white/2">
                <div className="text-xs font-bold text-neutral-300 mb-2">
                  {monthDate.toLocaleDateString("en-US", { month: "long" })}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {["S","M","T","W","T","F","S"].map((d, i) => (
                    <div key={i} className="text-[8px] text-neutral-600 text-center">{d}</div>
                  ))}
                  {cells.map((day, i) => {
                    if (!day) return <div key={i} />
                    const dayTasks = tasksOnDay(day)
                    const isToday = isSameDay(day, today)
                    const hasTasks = dayTasks.length > 0
                    const highPriority = dayTasks.some(t => t.priority === "High")
                    return (
                      <button
                        key={i}
                        onClick={() => { setCurrentDate(day); setView("day") }}
                        title={hasTasks ? `${dayTasks.length} task(s)` : ""}
                        className={`w-full aspect-square rounded-sm text-[8px] font-bold flex items-center justify-center transition-all ${
                          isToday ? "ring-1 ring-violet-500 text-violet-400" :
                          hasTasks ? (highPriority ? "bg-red-500/40 text-white" : "bg-violet-500/30 text-white") :
                          "text-neutral-700 hover:bg-white/5"
                        }`}
                      >
                        {day.getDate()}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Calendar Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-all">
          <FiChevronLeft size={16} />
        </button>
        <h3 className="text-sm font-bold text-white flex-1 text-center">{getTitle()}</h3>
        <button onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-all">
          <FiChevronRight size={16} />
        </button>
        <button onClick={() => setCurrentDate(new Date())}
          className="text-xs font-bold text-violet-400 hover:text-violet-300 px-3 py-1.5 rounded-lg hover:bg-violet-500/10 transition-all border border-violet-500/30"
        >
          Today
        </button>
        {/* View switcher */}
        <div className="flex items-center bg-white/5 rounded-xl border border-white/10 p-0.5">
          {(["day", "week", "month", "year"] as CalendarView[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                view === v ? "bg-violet-600 text-white shadow-lg" : "text-neutral-400 hover:text-white"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "month" && renderMonth()}
      {view === "week"  && renderWeek()}
      {view === "day"   && renderDay()}
      {view === "year"  && renderYear()}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const { zohoContext: user } = useZoho()
  const router = useRouter()

  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [mainView, setMainView] = useState<"dashboard" | "calendar">("dashboard")
  const [activeCategory, setActiveCategory] = useState<TaskCategory>("all")
  const [activeCategories, setActiveCategories] = useState<Set<TaskCategory>>(new Set(["all"]))
  const [statusFilter, setStatusFilter] = useState<string>("open")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"dueDate" | "priority" | "status">("dueDate")
  const [showFilters, setShowFilters] = useState(false)

  // ── Load tasks ──────────────────────────────────────────────────────────────
  const loadTasks = useCallback(async (forceRefresh = false) => {
    if (!user) return
    if (forceRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const params = new URLSearchParams()
      if (user.zohoId) params.set("zohoId", user.zohoId)
      else if (user.email) params.set("email", user.email)
      if (forceRefresh) params.set("refresh", "true")
      const role = user.role?.toLowerCase() || ""
      if (role.includes("admin") || role.includes("manager") || role.includes("collections")) {
        params.set("role", "admin")
      }

      const res = await fetch(`/api/get-tasks?${params}`)
      const data = await res.json()
      if (data.tasks) {
        const classified = (data.tasks as Task[]).map(t => ({
          ...t,
          category: classifyTask(t),
          title: t.title || t.subject || "Untitled"
        }))
        setTasks(classified)
      }
    } catch (err) {
      console.error("Failed to load tasks", err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user])

  useEffect(() => { loadTasks() }, [loadTasks])

  // ── Update task ─────────────────────────────────────────────────────────────
  const handleUpdate = useCallback(async (zohoId: string, data: Partial<Task>) => {
    try {
      await fetch("/api/update-task", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zohoId, ...data, subject: data.title })
      })
      setTasks(prev => prev.map(t => t.zohoId === zohoId ? { ...t, ...data } : t))
      setSelectedTask(prev => prev?.zohoId === zohoId ? { ...prev, ...data } : prev)
    } catch (err) {
      console.error("Update task error", err)
    }
  }, [])

  // ── Complete task ───────────────────────────────────────────────────────────
  const handleComplete = useCallback(async (zohoId: string) => {
    await handleUpdate(zohoId, { status: "Completed" })
  }, [handleUpdate])

  // ── Filtered + sorted tasks ─────────────────────────────────────────────────
  const filteredTasks = useMemo(() => {
    return tasks
      .filter(t => {
        const cat = t.category || classifyTask(t)
        if (activeCategory !== "all" && cat !== activeCategory) return false
        if (statusFilter === "open" && t.status === "Completed") return false
        if (statusFilter === "completed" && t.status !== "Completed") return false
        if (statusFilter === "overdue" && !isOverdue(t)) return false
        if (typeFilter !== "all" && t.type !== typeFilter) return false
        if (searchQuery) {
          const q = searchQuery.toLowerCase()
          return (
            t.title.toLowerCase().includes(q) ||
            (t.description || "").toLowerCase().includes(q) ||
            (t.accountName || "").toLowerCase().includes(q)
          )
        }
        return true
      })
      .sort((a, b) => {
        if (sortBy === "dueDate") {
          if (!a.dueDate) return 1
          if (!b.dueDate) return -1
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        }
        if (sortBy === "priority") {
          const p = { High: 0, Normal: 1, Low: 2 }
          return (p[a.priority] ?? 1) - (p[b.priority] ?? 1)
        }
        return a.status.localeCompare(b.status)
      })
  }, [tasks, activeCategory, statusFilter, typeFilter, searchQuery, sortBy])

  // ── Group by category for dashboard ────────────────────────────────────────
  const taskGroups = useMemo(() => ({
    communication: filteredTasks.filter(t => (t.category || classifyTask(t)) === "communication"),
    sales:         filteredTasks.filter(t => (t.category || classifyTask(t)) === "sales"),
    process:       filteredTasks.filter(t => (t.category || classifyTask(t)) === "process"),
  }), [filteredTasks])

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:     tasks.length,
    open:      tasks.filter(t => t.status !== "Completed").length,
    overdue:   tasks.filter(t => isOverdue(t)).length,
    completed: tasks.filter(t => t.status === "Completed").length,
    dueToday:  tasks.filter(t => t.dueDate && isSameDay(new Date(t.dueDate), new Date()) && t.status !== "Completed").length,
  }), [tasks])

  // Toggle calendar category filter
  const toggleCalCat = (cat: TaskCategory) => {
    setActiveCategories(prev => {
      const next = new Set(prev)
      if (cat === "all") return new Set(["all"])
      next.delete("all")
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      if (next.size === 0) return new Set(["all"])
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-neutral-400">Loading tasks…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0b0d]">
      {/* ── Page Header ── */}
      <div className="px-6 py-5 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Task Hub</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Manage, track, and resolve all tasks</p>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center bg-white/5 rounded-xl border border-white/10 p-0.5">
              <button onClick={() => setMainView("dashboard")}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all ${mainView === "dashboard" ? "bg-violet-600 text-white" : "text-neutral-400 hover:text-white"}`}
              >
                <FiList size={14} /> Dashboard
              </button>
              <button onClick={() => setMainView("calendar")}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all ${mainView === "calendar" ? "bg-violet-600 text-white" : "text-neutral-400 hover:text-white"}`}
              >
                <FiCalendar size={14} /> Calendar
              </button>
            </div>

            {/* Refresh */}
            <button onClick={() => loadTasks(true)} disabled={refreshing}
              className="p-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-neutral-400 hover:text-white transition-all disabled:opacity-50"
            >
              <FiRefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            </button>

            {/* New task */}
            <Link href="/tasks/new"
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-violet-500/20"
            >
              <FiPlus size={16} /> New Task
            </Link>
          </div>
        </div>

        {/* ── Stats Row ── */}
        <div className="flex gap-3 mt-4 flex-wrap">
          {[
            { label: "Total",     value: stats.total,     color: "text-white" },
            { label: "Open",      value: stats.open,      color: "text-sky-400" },
            { label: "Due Today", value: stats.dueToday,  color: "text-amber-400" },
            { label: "Overdue",   value: stats.overdue,   color: "text-red-400" },
            { label: "Completed", value: stats.completed, color: "text-emerald-400" },
          ].map(s => (
            <div key={s.label} className="bg-white/3 border border-white/8 rounded-xl px-4 py-2">
              <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-neutral-500 uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="px-6 py-3 border-b border-white/5 shrink-0 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search tasks…"
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500/50 w-56"
        />

        {/* Status filter */}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open Only</option>
          <option value="overdue">Overdue</option>
          <option value="completed">Completed</option>
        </select>

        {/* Type filter */}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
        >
          <option value="all">All Types</option>
          <option value="Call">📞 Call</option>
          <option value="Email">📧 Email</option>
          <option value="Text">💬 Text</option>
          <option value="Task">✅ Task</option>
          <option value="Processing">⚙️ Processing</option>
        </select>

        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
        >
          <option value="dueDate">Sort: Due Date</option>
          <option value="priority">Sort: Priority</option>
          <option value="status">Sort: Status</option>
        </select>

        <span className="ml-auto text-xs text-neutral-500">{filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── Category Tabs ── */}
      <div className="px-6 py-2 border-b border-white/5 shrink-0 flex items-center gap-2 overflow-x-auto">
        {(["all", "communication", "sales", "process"] as TaskCategory[]).map(cat => {
          const cfg = CATEGORY_CONFIG[cat]
          const count = cat === "all" ? filteredTasks.length :
            filteredTasks.filter(t => (t.category || classifyTask(t)) === cat).length

          return (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(cat)
                if (mainView === "calendar") toggleCalCat(cat)
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                (mainView === "dashboard" ? activeCategory === cat : activeCategories.has(cat) || (activeCategories.has("all") && cat === "all"))
                  ? `${cfg.bg} ${cfg.color} ${cfg.border}`
                  : "text-neutral-500 border-transparent hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              {cfg.label}
              <span className="opacity-60">({count})</span>
            </button>
          )
        })}
      </div>

      {/* ── Content Area ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {mainView === "calendar" ? (
          <TaskCalendar
            tasks={tasks}
            activeCategories={activeCategories}
            onSelectTask={setSelectedTask}
          />
        ) : (
          /* DASHBOARD VIEW */
          <div className="h-full overflow-y-auto">
            {activeCategory === "all" ? (
              /* Three-column grouped layout */
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 h-full divide-x divide-white/5">
                {(["communication", "sales", "process"] as const).map(cat => {
                  const cfg = CATEGORY_CONFIG[cat]
                  const catTasks = cat === "communication" ? taskGroups.communication
                    : cat === "sales" ? taskGroups.sales : taskGroups.process

                  return (
                    <div key={cat} className="flex flex-col min-h-0">
                      {/* Column header */}
                      <div className={`px-4 py-3 border-b border-white/5 shrink-0 ${cfg.bg} sticky top-0 z-10`}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                          <span className={`text-xs font-black uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                          <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                            {catTasks.length}
                          </span>
                        </div>
                        <div className="text-[10px] text-neutral-600 mt-1">
                          {cat === "communication" && "Calls • Emails • Texts"}
                          {cat === "sales" && "Account & deal tasks"}
                          {cat === "process" && "Processing & office tasks"}
                        </div>
                      </div>

                      {/* Task list */}
                      <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {catTasks.length === 0 ? (
                          <div className="text-center py-12 text-neutral-700">
                            <FiCheckSquare size={28} className="mx-auto mb-2 opacity-30" />
                            <p className="text-xs">No {cfg.label.toLowerCase()} tasks</p>
                          </div>
                        ) : (
                          catTasks.map(task => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              onUpdate={handleUpdate}
                              onComplete={handleComplete}
                              onSelect={setSelectedTask}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Single category view */
              <div className="max-w-3xl mx-auto px-4 py-4 space-y-3">
                {filteredTasks.length === 0 ? (
                  <div className="text-center py-20 text-neutral-700">
                    <FiCheckSquare size={40} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No tasks match your filters</p>
                  </div>
                ) : (
                  filteredTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onUpdate={handleUpdate}
                      onComplete={handleComplete}
                      onSelect={setSelectedTask}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Task Detail Panel ── */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleUpdate}
          onComplete={handleComplete}
        />
      )}

      <style jsx>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.25s ease-out;
        }
      `}</style>
    </div>
  )
}
