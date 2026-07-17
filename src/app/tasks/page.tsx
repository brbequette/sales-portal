"use client"
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { useZoho } from "@/components/ZohoProvider"
import Link from "next/link"
import {
  FiPhone, FiMail, FiMessageSquare, FiCheckSquare, FiSettings,
  FiCalendar, FiList, FiPlus, FiRefreshCw, FiChevronLeft, FiChevronRight,
  FiClock, FiUser, FiLink, FiFileText, FiAlertCircle, FiCheck,
  FiEdit2, FiX, FiSave, FiFlag, FiFilter, FiShare2, FiChevronDown,
  FiChevronUp, FiSearch, FiArrowUp, FiArrowDown, FiMinus, FiRepeat,
  FiMoreVertical, FiSliders, FiEye
} from "react-icons/fi"

// ─── Types ─────────────────────────────────────────────────────────────────
type TaskType     = "Task" | "Call" | "Email" | "Text" | "Processing"
type TaskStatus   = "Not Started" | "In Progress" | "Deferred" | "Completed" | "Waiting on someone else"
type TaskPriority = "High" | "Normal" | "Low"
type Category     = "all" | "communication" | "sales" | "process"
type CalView      = "day" | "week" | "month" | "year"

interface Task {
  id: string
  zohoId: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  type: TaskType
  dueDate: string | null
  ownerId: string
  ownerName?: string | null
  accountId?: string | null
  accountName?: string | null
  dealId?: string | null
  dealName?: string | null
  invoiceId?: string | null
  salesOrderId?: string | null
  quoteId?: string | null
  estimateId?: string | null
  reminderAt?: string | null
  reminderMethod?: string | null
  reminderFired?: boolean
  actionUrl?: string
}

// ─── Category classification ────────────────────────────────────────────────
function classifyTask(t: Task): Category {
  const type = (t.type || "Task").toLowerCase()
  if (["call", "email", "text"].includes(type)) return "communication"
  if (type === "processing") return "process"
  if (t.accountId || t.dealId || t.accountName) return "sales"
  return "process"
}

const CAT = {
  all:           { label: "All",          dot: "bg-white",         text: "text-white",        bg: "bg-white/8",          border: "border-white/15" },
  communication: { label: "Comms",        dot: "bg-sky-400",       text: "text-sky-400",      bg: "bg-sky-500/10",       border: "border-sky-500/25" },
  sales:         { label: "Sales",        dot: "bg-emerald-400",   text: "text-emerald-400",  bg: "bg-emerald-500/10",   border: "border-emerald-500/25" },
  process:       { label: "Process",      dot: "bg-amber-400",     text: "text-amber-400",    bg: "bg-amber-500/10",     border: "border-amber-500/25" },
} as const

const TYPE_ICON: Record<string, React.ReactNode> = {
  Call:       <FiPhone size={14} />,
  Email:      <FiMail size={14} />,
  Text:       <FiMessageSquare size={14} />,
  Task:       <FiCheckSquare size={14} />,
  Processing: <FiSettings size={14} />,
}

const STATUS_COLORS: Record<string, string> = {
  "Completed":               "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "In Progress":             "bg-sky-500/20 text-sky-300 border-sky-500/30",
  "Waiting on someone else": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "Deferred":                "bg-neutral-500/15 text-neutral-400 border-neutral-500/20",
  "Not Started":             "bg-white/5 text-neutral-400 border-white/10",
}

const PRIORITY_COLORS: Record<string, string> = {
  High:   "text-red-400",
  Normal: "text-neutral-500",
  Low:    "text-blue-400",
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return ""
  const dt = new Date(d)
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
function fmtTime(d: string | null) {
  if (!d) return ""
  const dt = new Date(d)
  const h = dt.getHours(), m = dt.getMinutes()
  if (h === 0 && m === 0) return ""
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}
function fmtDateFull(d: string | null) {
  if (!d) return "No due date"
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })
}
function isOverdue(t: Task) {
  if (!t.dueDate || t.status === "Completed") return false
  return new Date(t.dueDate) < new Date()
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// ─── STATUS LABEL ───────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_COLORS[status] || STATUS_COLORS["Not Started"]}`}>
      {status === "Waiting on someone else" ? "Waiting" : status}
    </span>
  )
}

// ─── PRIORITY ICON ──────────────────────────────────────────────────────────
function PriorityIcon({ priority }: { priority: string }) {
  if (priority === "High")   return <FiArrowUp size={13} className="text-red-400 shrink-0" />
  if (priority === "Low")    return <FiArrowDown size={13} className="text-blue-400 shrink-0" />
  return <FiMinus size={13} className="text-neutral-600 shrink-0" />
}

// ─── TASK CARD (mobile-first) ────────────────────────────────────────────────
function TaskCard({ task, onTap, onComplete, onStatusChange }: {
  task: Task
  onTap: () => void
  onComplete: () => void
  onStatusChange: (s: string) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const cat = classifyTask(task)
  const cfg = CAT[cat]
  const overdue = isOverdue(task)
  const completed = task.status === "Completed"

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    if (showMenu) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showMenu])

  return (
    <div
      className={`relative rounded-2xl border transition-all active:scale-[0.98] ${
        completed ? "opacity-55 border-white/5 bg-white/2" :
        overdue   ? "border-red-500/40 bg-red-950/20" :
                    `${cfg.border} bg-[#111316]`
      }`}
    >
      {/* Category accent bar */}
      <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-r-full ${cfg.dot}`} />

      <button
        onClick={onTap}
        className="w-full text-left px-4 py-3.5 pl-5"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        {/* Top row: type badge + priority + overdue + due date/time */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.border} ${cfg.bg} ${cfg.text} shrink-0`}>
            {TYPE_ICON[task.type] || TYPE_ICON.Task}
            {task.type}
          </span>
          <PriorityIcon priority={task.priority} />
          {overdue && !completed && (
            <span className="flex items-center gap-1 text-[10px] font-black text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full shrink-0">
              <FiAlertCircle size={9} /> OVERDUE
            </span>
          )}
          {task.dueDate && (
            <span className={`ml-auto text-[11px] font-semibold shrink-0 ${overdue && !completed ? "text-red-400" : "text-neutral-500"}`}>
              <FiClock size={9} className="inline mr-0.5 -mt-0.5" />
              {fmtDate(task.dueDate)}{fmtTime(task.dueDate) ? ` · ${fmtTime(task.dueDate)}` : ""}
            </span>
          )}
        </div>

        {/* Title */}
        <p className={`text-[15px] font-bold leading-snug mb-1 ${completed ? "line-through text-neutral-500" : "text-white"}`}>
          {task.title}
        </p>

        {/* Description preview — plain notes only, no outcome timestamps */}
        {task.description && (() => {
          const plain = task.description.split("\n").filter((l: string) => !/^\[.+\]/.test(l.trim())).join(" ").trim()
          return plain ? (
            <p className="text-xs text-neutral-500 leading-relaxed line-clamp-2 mb-1.5 mt-0.5">
              {plain}
            </p>
          ) : null
        })()}

        {/* Account chip */}
        {task.accountName && (
          <p className="text-xs text-sky-400 flex items-center gap-1 mt-1.5">
            <FiUser size={10} className="shrink-0" />
            {task.accountName}
          </p>
        )}

        {/* Deal chip — separate from account */}
        {task.dealName && (
          <p className="text-xs text-violet-400 flex items-center gap-1 mt-1">
            <FiShare2 size={10} className="shrink-0" />
            {task.dealName}
          </p>
        )}

        {/* Linked document badges */}
        {(task.invoiceId || task.salesOrderId || task.quoteId || task.estimateId) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {task.invoiceId && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 flex items-center gap-1 shrink-0">
                <FiFileText size={9} /> Invoice
              </span>
            )}
            {task.salesOrderId && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center gap-1 shrink-0">
                <FiFileText size={9} /> Sales Order
              </span>
            )}
            {task.quoteId && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 flex items-center gap-1 shrink-0">
                <FiFileText size={9} /> Quote
              </span>
            )}
            {task.estimateId && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-400 flex items-center gap-1 shrink-0">
                <FiFileText size={9} /> Estimate
              </span>
            )}
          </div>
        )}

        {/* Bottom row: status + owner + reminder + chevron */}
        <div className="flex items-center gap-2 mt-2.5">
          <StatusChip status={task.status} />
          {task.ownerName && (
            <span className="text-[10px] text-neutral-600 truncate max-w-[100px]">{task.ownerName}</span>
          )}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {task.reminderAt && !task.reminderFired && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                <FiClock size={8} /> {fmtDate(task.reminderAt)}
              </span>
            )}
            <FiChevronRight size={13} className="text-neutral-700" />
          </div>
        </div>
      </button>


      {/* Quick action strip */}
      <div className="flex border-t border-white/5">
        {/* Complete */}
        <button
          onClick={e => { e.stopPropagation(); onComplete() }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-all ${
            completed ? "text-neutral-600" : "text-emerald-400 hover:bg-emerald-500/10 active:bg-emerald-500/15"
          }`}
        >
          <FiCheck size={14} />
          {completed ? "Completed" : "Complete"}
        </button>

        {/* Status */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={e => { e.stopPropagation(); setShowMenu(!showMenu) }}
            className="flex items-center justify-center gap-1.5 px-5 py-3 text-xs font-bold text-neutral-400 hover:text-white hover:bg-white/5 border-l border-white/5 transition-all"
          >
            <FiMoreVertical size={14} />
          </button>
          {showMenu && (
            <div className="absolute bottom-full right-0 mb-1 w-52 bg-[#1c1e22] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-30">
              <div className="px-3 pt-3 pb-1">
                <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Set Status</p>
              </div>
              {["Not Started","In Progress","Waiting on someone else","Deferred","Completed"].map(s => (
                <button key={s} onClick={() => { onStatusChange(s); setShowMenu(false) }}
                  className={`w-full text-left text-sm px-4 py-3 transition-colors flex items-center gap-3 ${task.status === s ? "text-white font-bold bg-white/5" : "text-neutral-400 hover:bg-white/5 hover:text-white"}`}
                >
                  <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[s]?.includes("emerald") ? "bg-emerald-400" : STATUS_COLORS[s]?.includes("sky") ? "bg-sky-400" : STATUS_COLORS[s]?.includes("yellow") ? "bg-yellow-400" : "bg-neutral-500"}`} />
                  {s === "Waiting on someone else" ? "Waiting…" : s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── TASK DETAIL SHEET (full-screen on mobile) ──────────────────────────────
function TaskDetail({ task, onClose, onUpdate, onComplete }: {
  task: Task
  onClose: () => void
  onUpdate: (id: string, data: Partial<Task>) => Promise<void>
  onComplete: (id: string) => Promise<void>
}) {
  const [editStatus, setEditStatus] = useState<TaskStatus>(task.status)
  const [editPriority, setEditPriority] = useState<TaskPriority>(task.priority)
  const [editTitle, setEditTitle] = useState(task.title)
  const [editDesc, setEditDesc] = useState(task.description || "")
  const [outcome, setOutcome] = useState("")
  const [saving, setSaving] = useState(false)
  const [addingOutcome, setAddingOutcome] = useState(false)
  const [tab, setTab] = useState<"details" | "notes" | "assets">("details")
  const cat = classifyTask(task)
  const cfg = CAT[cat]
  const overdue = isOverdue(task)

  const handleSave = async () => {
    setSaving(true)
    await onUpdate(task.zohoId, { title: editTitle, description: editDesc, status: editStatus, priority: editPriority })
    setSaving(false)
  }

  const handleAddOutcome = async () => {
    if (!outcome.trim()) return
    setAddingOutcome(true)
    const ts = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    const updated = editDesc
      ? `${editDesc}\n\n[${ts}] ${outcome.trim()}`
      : `[${ts}] ${outcome.trim()}`
    setEditDesc(updated)
    await onUpdate(task.zohoId, { description: updated })
    setOutcome("")
    setAddingOutcome(false)
  }

  // Parse outcomes (lines starting with [Month Day h:mm])
  const outcomeLines = editDesc.split("\n").filter(l => /^\[.+\]/.test(l.trim()))
  const notesOnly = editDesc.split("\n").filter(l => !/^\[.+\]/.test(l.trim())).join("\n").trim()

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0b0d]">
      {/* Header */}
      <div className={`shrink-0 px-4 pt-safe-top pb-0 ${cfg.bg} border-b border-white/10`} style={{ paddingTop: "max(16px, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-3 pb-3">
          <button onClick={onClose} className="p-2 -ml-1 rounded-xl text-neutral-400 hover:text-white transition-colors">
            <FiChevronLeft size={22} />
          </button>
          <span className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.border} ${cfg.text}`}>
            {TYPE_ICON[task.type] || TYPE_ICON.Task}
            {task.type}
          </span>
          {overdue && (
            <span className="text-[10px] font-black text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
              <FiAlertCircle size={9} /> OVERDUE
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all disabled:opacity-50"
            >
              <FiSave size={13} /> {saving ? "…" : "Save"}
            </button>
          </div>
        </div>

        {/* Title */}
        <input
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          className="w-full bg-transparent text-xl font-black text-white placeholder-neutral-500 focus:outline-none pb-3"
        />

        {/* Due date + status row */}
        <div className="flex items-center gap-3 pb-3">
          <span className={`text-xs flex items-center gap-1 font-medium ${overdue ? "text-red-400" : "text-neutral-400"}`}>
            <FiClock size={11} />
            {fmtDateFull(task.dueDate)}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 -mx-4">
          {(["details","notes","assets"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-bold capitalize transition-all border-b-2 ${tab === t ? "text-white border-violet-500" : "text-neutral-500 border-transparent"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {tab === "details" && (
          <div className="p-4 space-y-4">
            {/* Status */}
            <div>
              <label className="text-xs text-neutral-500 font-bold uppercase tracking-wider block mb-2">Status</label>
              <div className="grid grid-cols-2 gap-2">
                {["Not Started","In Progress","Waiting on someone else","Deferred","Completed"].map(s => (
                  <button key={s} onClick={() => setEditStatus(s as TaskStatus)}
                    className={`px-3 py-3 rounded-xl text-sm font-bold border transition-all ${
                      editStatus === s ? STATUS_COLORS[s] + " border-opacity-100" : "bg-white/3 text-neutral-500 border-white/8 hover:bg-white/5"
                    }`}
                  >
                    {s === "Waiting on someone else" ? "Waiting…" : s}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="text-xs text-neutral-500 font-bold uppercase tracking-wider block mb-2">Priority</label>
              <div className="flex gap-2">
                {(["High","Normal","Low"] as TaskPriority[]).map(p => (
                  <button key={p} onClick={() => setEditPriority(p)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border transition-all ${
                      editPriority === p
                        ? p === "High" ? "bg-red-500/20 text-red-400 border-red-500/40"
                          : p === "Low" ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                          : "bg-white/10 text-white border-white/20"
                        : "bg-white/3 text-neutral-500 border-white/8"
                    }`}
                  >
                    <PriorityIcon priority={p} />
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Assignee */}
            {task.ownerName && (
              <div>
                <label className="text-xs text-neutral-500 font-bold uppercase tracking-wider block mb-2">Assigned To</label>
                <div className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-sm font-bold text-violet-400">
                    {task.ownerName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-white">{task.ownerName}</span>
                </div>
              </div>
            )}

            {/* Complete button */}
            {task.status !== "Completed" && (
              <button onClick={() => onComplete(task.zohoId)}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-base font-black py-4 rounded-2xl transition-all shadow-lg shadow-emerald-500/20"
              >
                <FiCheck size={18} /> Mark Complete
              </button>
            )}
          </div>
        )}

        {tab === "notes" && (
          <div className="p-4 space-y-4">
            {/* Notes editor */}
            <div>
              <label className="text-xs text-neutral-500 font-bold uppercase tracking-wider block mb-2">Notes</label>
              <textarea
                value={notesOnly}
                onChange={e => {
                  const existing = editDesc.split("\n").filter(l => /^\[.+\]/.test(l.trim())).join("\n")
                  setEditDesc(existing ? `${e.target.value}\n\n${existing}` : e.target.value)
                }}
                rows={5}
                placeholder="Add notes…"
                className="w-full bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 resize-none focus:outline-none focus:border-violet-500/50"
              />
            </div>

            {/* Outcomes */}
            <div>
              <label className="text-xs text-neutral-500 font-bold uppercase tracking-wider block mb-2">
                Outcomes ({outcomeLines.length})
              </label>
              {outcomeLines.map((line, i) => (
                <div key={i} className="bg-violet-500/8 border border-violet-500/20 rounded-xl px-4 py-3 mb-2">
                  <p className="text-sm text-violet-200">{line}</p>
                </div>
              ))}
              <div className="flex gap-2">
                <textarea
                  value={outcome}
                  onChange={e => setOutcome(e.target.value)}
                  placeholder="Add outcome or update…"
                  rows={2}
                  className="flex-1 bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 resize-none focus:outline-none focus:border-violet-500/50"
                />
                <button onClick={handleAddOutcome} disabled={!outcome.trim() || addingOutcome}
                  className="px-4 self-end py-3 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl disabled:opacity-40 transition-all"
                >
                  {addingOutcome ? "…" : "Add"}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "assets" && (
          <div className="p-4 space-y-2">
            <p className="text-xs text-neutral-500 font-bold uppercase tracking-wider mb-3">Connected Assets</p>
            {task.accountName && (
              <Link href={task.actionUrl || "#"}
                className="flex items-center gap-3 bg-sky-500/8 border border-sky-500/20 rounded-xl px-4 py-4 hover:bg-sky-500/15 transition-colors"
              >
                <FiUser size={16} className="text-sky-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-sky-400 font-bold uppercase">Account</p>
                  <p className="text-sm font-bold text-white">{task.accountName}</p>
                </div>
                <FiChevronRight size={14} className="ml-auto text-sky-400" />
              </Link>
            )}
            {task.dealName && (
              <div className="flex items-center gap-3 bg-fuchsia-500/8 border border-fuchsia-500/20 rounded-xl px-4 py-4">
                <FiLink size={16} className="text-fuchsia-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-fuchsia-400 font-bold uppercase">Deal</p>
                  <p className="text-sm font-bold text-white">{task.dealName}</p>
                </div>
              </div>
            )}
            {task.invoiceId && (
              <div className="flex items-center gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-4">
                <FiFileText size={16} className="text-amber-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-amber-400 font-bold uppercase">Invoice</p>
                  <p className="text-sm font-bold text-white font-mono">{task.invoiceId}</p>
                </div>
              </div>
            )}
            {task.salesOrderId && (
              <div className="flex items-center gap-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-4 py-4">
                <FiFileText size={16} className="text-emerald-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-emerald-400 font-bold uppercase">Sales Order</p>
                  <p className="text-sm font-bold text-white font-mono">{task.salesOrderId}</p>
                </div>
              </div>
            )}
            {task.quoteId && (
              <div className="flex items-center gap-3 bg-violet-500/8 border border-violet-500/20 rounded-xl px-4 py-4">
                <FiFileText size={16} className="text-violet-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-violet-400 font-bold uppercase">Quote</p>
                  <p className="text-sm font-bold text-white font-mono">{task.quoteId}</p>
                </div>
              </div>
            )}
            {task.estimateId && (
              <div className="flex items-center gap-3 bg-orange-500/8 border border-orange-500/20 rounded-xl px-4 py-4">
                <FiFileText size={16} className="text-orange-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-orange-400 font-bold uppercase">Estimate</p>
                  <p className="text-sm font-bold text-white font-mono">{task.estimateId}</p>
                </div>
              </div>
            )}
            {!task.accountName && !task.dealName && !task.invoiceId && !task.salesOrderId && !task.quoteId && !task.estimateId && (
              <div className="text-center py-12">
                <FiLink size={32} className="mx-auto mb-3 text-neutral-700" />
                <p className="text-sm text-neutral-600">No assets linked to this task</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MINI CALENDAR ──────────────────────────────────────────────────────────
function MiniCalendar({ tasks, onSelectTask }: { tasks: Task[]; onSelectTask: (t: Task) => void }) {
  const [view, setView]         = useState<CalView>("month")
  const [cur,  setCur]          = useState(new Date())
  const [cat,  setCat]          = useState<Category>("all")

  const visible = useMemo(() =>
    tasks.filter(t => cat === "all" || classifyTask(t) === cat),
    [tasks, cat]
  )

  const go = (d: -1 | 1) => {
    const n = new Date(cur)
    if (view === "day")   n.setDate(n.getDate() + d)
    if (view === "week")  n.setDate(n.getDate() + 7 * d)
    if (view === "month") n.setMonth(n.getMonth() + d)
    if (view === "year")  n.setFullYear(n.getFullYear() + d)
    setCur(n)
  }

  const tasksOn = (day: Date) => visible.filter(t => t.dueDate && sameDay(new Date(t.dueDate), day))

  const title = () => {
    if (view === "day")   return cur.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    if (view === "month") return cur.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    if (view === "year")  return cur.getFullYear().toString()
    const start = new Date(cur); start.setDate(start.getDate() - start.getDay())
    const end   = new Date(start); end.setDate(end.getDate() + 6)
    return `${start.toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${end.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`
  }

  const renderMonth = () => {
    const y = cur.getFullYear(), m = cur.getMonth()
    const first = new Date(y, m, 1).getDay()
    const days  = new Date(y, m+1, 0).getDate()
    const today = new Date()
    const cells: (Date|null)[] = Array(first).fill(null)
    for (let d = 1; d <= days; d++) cells.push(new Date(y,m,d))
    while (cells.length % 7) cells.push(null)

    return (
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 py-2">
          {["S","M","T","W","T","F","S"].map((d,i) => (
            <div key={i} className="text-center text-[10px] font-bold text-neutral-600 pb-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day,i) => {
            if (!day) return <div key={i} className="aspect-square" />
            const dt = tasksOn(day); const isToday = sameDay(day,today); const isCur = sameDay(day,cur)
            return (
              <button key={i} onClick={() => {setCur(day); setView("day")}}
                className={`aspect-square flex flex-col items-center justify-start p-1 rounded-xl transition-all ${isToday ? "bg-violet-500/15 ring-1 ring-violet-500/50" : isCur ? "bg-white/5" : "hover:bg-white/5"}`}
              >
                <span className={`text-sm font-bold ${isToday ? "text-violet-400" : "text-neutral-300"}`}>{day.getDate()}</span>
                {dt.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                    {dt.slice(0,3).map((_,j) => {
                      const c = classifyTask(dt[j])
                      return <span key={j} className={`w-1.5 h-1.5 rounded-full ${CAT[c].dot}`} />
                    })}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderDay = () => {
    const dt = tasksOn(cur)
    return (
      <div className="flex-1 overflow-auto px-0 py-3 space-y-2">
        {dt.length === 0 ? (
          <div className="text-center py-10 text-neutral-600">
            <FiCalendar size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No tasks due</p>
          </div>
        ) : dt.map(t => {
          const c = classifyTask(t); const cfg = CAT[c]
          return (
            <button key={t.id} onClick={() => onSelectTask(t)}
              className={`w-full text-left p-4 rounded-xl border ${cfg.border} ${cfg.bg} hover:brightness-110 transition-all`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold flex items-center gap-1 ${cfg.text}`}>{TYPE_ICON[t.type]}{t.type}</span>
                <StatusChip status={t.status} />
                {fmtTime(t.dueDate) && <span className="ml-auto text-[10px] text-neutral-500">{fmtTime(t.dueDate)}</span>}
              </div>
              <p className="text-sm font-bold text-white">{t.title}</p>
              {t.accountName && <p className="text-xs text-sky-400 mt-0.5 flex items-center gap-1"><FiUser size={9}/>{t.accountName}</p>}
            </button>
          )
        })}
      </div>
    )
  }

  const renderWeek = () => {
    const start = new Date(cur); start.setDate(start.getDate() - start.getDay())
    const days = Array.from({length:7},(_,i) => { const d=new Date(start); d.setDate(d.getDate()+i); return d })
    const today = new Date()
    return (
      <div className="flex-1 overflow-x-auto">
        <div className="flex min-w-max">
          {days.map((day,i) => {
            const dt=tasksOn(day); const isToday=sameDay(day,today)
            return (
              <div key={i} className={`flex-1 min-w-[120px] border-r border-white/5 ${isToday?"bg-violet-500/3":""}`}>
                <button onClick={() => {setCur(day); setView("day")}} className={`w-full text-center py-3 border-b border-white/5 ${isToday?"text-violet-400":"text-neutral-400"}`}>
                  <div className="text-[10px] font-bold">{day.toLocaleDateString("en-US",{weekday:"short"})}</div>
                  <div className="text-lg font-black">{day.getDate()}</div>
                </button>
                <div className="p-2 space-y-1.5">
                  {dt.map(t => {
                    const c=classifyTask(t); const cfg=CAT[c]
                    return (
                      <button key={t.id} onClick={() => onSelectTask(t)}
                        className={`w-full text-left p-2 rounded-lg text-[10px] font-medium ${cfg.bg} border ${cfg.border} ${cfg.text} hover:brightness-110 transition-all`}
                      >
                        <div className="flex items-center gap-1 mb-0.5">{TYPE_ICON[t.type]}<span className="truncate">{t.type}</span></div>
                        <div className="text-white line-clamp-2 font-bold">{t.title}</div>
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
      {/* Cal header */}
      <div className="shrink-0 px-4 py-3 border-b border-white/8">
        {/* Category filter */}
        <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 hide-scroll">
          {(Object.keys(CAT) as Category[]).map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${
                cat === c ? `${CAT[c].bg} ${CAT[c].text} ${CAT[c].border}` : "bg-white/3 text-neutral-500 border-white/8"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${CAT[c].dot}`} />
              {CAT[c].label}
            </button>
          ))}
        </div>
        {/* Nav + view toggle */}
        <div className="flex items-center gap-2">
          <button onClick={() => go(-1)} className="p-2 rounded-xl hover:bg-white/8 text-neutral-400 transition-all"><FiChevronLeft size={16}/></button>
          <p className="flex-1 text-center text-sm font-bold text-white truncate">{title()}</p>
          <button onClick={() => go(1)}  className="p-2 rounded-xl hover:bg-white/8 text-neutral-400 transition-all"><FiChevronRight size={16}/></button>
          <button onClick={() => setCur(new Date())} className="text-xs font-bold text-violet-400 px-2 py-1 rounded-lg hover:bg-violet-500/10 transition-all border border-violet-500/30">Today</button>
        </div>
        {/* View switcher */}
        <div className="flex mt-2 bg-white/3 rounded-xl border border-white/8 p-0.5">
          {(["day","week","month","year"] as CalView[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all ${view===v?"bg-violet-600 text-white":"text-neutral-500"}`}
            >{v}</button>
          ))}
        </div>
      </div>

      {view === "month" && renderMonth()}
      {view === "day"   && renderDay()}
      {view === "week"  && renderWeek()}
      {view === "year"  && (
        <div className="flex-1 overflow-auto p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({length:12},(_,mi) => {
              const md = new Date(cur.getFullYear(),mi,1)
              const dim = new Date(cur.getFullYear(),mi+1,0).getDate()
              const fd  = new Date(cur.getFullYear(),mi,1).getDay()
              return (
                <button key={mi} onClick={() => {setCur(md); setView("month")}}
                  className="text-left bg-white/2 border border-white/8 rounded-xl p-3 hover:bg-white/5 transition-all"
                >
                  <p className="text-xs font-black text-neutral-300 mb-2">
                    {md.toLocaleDateString("en-US",{month:"short"})}
                  </p>
                  <div className="grid grid-cols-7 gap-0.5">
                    {Array(fd).fill(null).map((_,i)=><div key={"e"+i}/>)}
                    {Array.from({length:dim},(_,d) => {
                      const day = new Date(cur.getFullYear(),mi,d+1)
                      const dt  = visible.filter(t => t.dueDate && sameDay(new Date(t.dueDate),day))
                      return (
                        <div key={d} className={`aspect-square rounded-sm flex items-center justify-center text-[8px] font-bold ${
                          dt.length > 0 ? (dt.some(t=>t.priority==="High") ? "bg-red-500/50 text-white":"bg-violet-500/40 text-white") : "text-neutral-700"
                        }`}>{d+1}</div>
                      )
                    })}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── FILTER DRAWER ──────────────────────────────────────────────────────────
function FilterDrawer({ open, onClose, filters, setFilters }: {
  open: boolean
  onClose: () => void
  filters: { status: string; type: string; priority: string; sort: string }
  setFilters: (f: any) => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full bg-[#131517] border-t border-white/10 rounded-t-3xl p-5 pb-8 shadow-2xl animate-slide-up">
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />
        <h3 className="text-base font-black text-white mb-5">Filters & Sort</h3>

        <div className="space-y-5">
          <div>
            <label className="text-xs text-neutral-500 font-bold uppercase tracking-wider block mb-2">Status</label>
            <div className="flex flex-wrap gap-2">
              {["all","open","overdue","completed"].map(s => (
                <button key={s} onClick={() => setFilters((f: any) => ({...f, status: s}))}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all capitalize ${
                    filters.status === s ? "bg-violet-600 text-white border-violet-500" : "bg-white/3 text-neutral-400 border-white/8"
                  }`}
                >{s}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 font-bold uppercase tracking-wider block mb-2">Type</label>
            <div className="flex flex-wrap gap-2">
              {["all","Call","Email","Text","Task","Processing"].map(t => (
                <button key={t} onClick={() => setFilters((f: any) => ({...f, type: t}))}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                    filters.type === t ? "bg-violet-600 text-white border-violet-500" : "bg-white/3 text-neutral-400 border-white/8"
                  }`}
                >{t === "all" ? "All Types" : t}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 font-bold uppercase tracking-wider block mb-2">Priority</label>
            <div className="flex flex-wrap gap-2">
              {["all","High","Normal","Low"].map(p => (
                <button key={p} onClick={() => setFilters((f: any) => ({...f, priority: p}))}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                    filters.priority === p ? "bg-violet-600 text-white border-violet-500" : "bg-white/3 text-neutral-400 border-white/8"
                  }`}
                >{p === "all" ? "Any Priority" : p}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 font-bold uppercase tracking-wider block mb-2">Sort By</label>
            <div className="flex flex-wrap gap-2">
              {[["dueDate","Due Date"],["priority","Priority"],["status","Status"]].map(([v,l]) => (
                <button key={v} onClick={() => setFilters((f: any) => ({...f, sort: v}))}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                    filters.sort === v ? "bg-violet-600 text-white border-violet-500" : "bg-white/3 text-neutral-400 border-white/8"
                  }`}
                >{l}</button>
              ))}
            </div>
          </div>
        </div>
        <button onClick={onClose}
          className="w-full mt-5 py-3.5 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-2xl transition-all"
        >Apply Filters</button>
      </div>
    </div>
  )
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────
export default function TasksPage() {
  const { zohoContext: user } = useZoho()

  const [tasks,          setTasks]          = useState<Task[]>([])
  const [loading,        setLoading]        = useState(true)
  const [refreshing,     setRefreshing]     = useState(false)
  const [selectedTask,   setSelectedTask]   = useState<Task | null>(null)
  const [mainView,       setMainView]       = useState<"list" | "calendar">("list")
  const [category,       setCategory]       = useState<Category>("all")
  const [searchQuery,    setSearchQuery]    = useState("")
  const [showFilter,     setShowFilter]     = useState(false)
  const [showSearch,     setShowSearch]     = useState(false)
  const [filters, setFilters] = useState({ status: "open", type: "all", priority: "all", sort: "dueDate" })

  // ── Load tasks ─────────────────────────────────────────────────────────────
  const loadTasks = useCallback(async (forceRefresh = false) => {
    if (!user) return
    if (forceRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const p = new URLSearchParams()
      if (user.email)   p.set("email",   user.email)
      if (user.zohoId)  p.set("zohoId",  user.zohoId)
      if (forceRefresh) p.set("refresh", "true")
      const role = (user.role || "").toLowerCase()
      if (role.includes("admin") || role.includes("manager") || role.includes("collections")) {
        p.set("role", "admin")
      }
      const res  = await fetch(`/api/get-tasks?${p}`)
      const data = await res.json()
      if (data.tasks) {
        setTasks(data.tasks.map((t: Task) => ({ ...t, title: t.title || "Untitled Task" })))
      }
    } catch (err) {
      console.error("Task load error", err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user])

  useEffect(() => { loadTasks() }, [loadTasks])

  // ── Update task ────────────────────────────────────────────────────────────
  const handleUpdate = useCallback(async (zohoId: string, data: Partial<Task>) => {
    try {
      await fetch("/api/update-task", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zohoId, ...data, subject: data.title })
      })
      setTasks(prev => prev.map(t => t.zohoId === zohoId ? { ...t, ...data } : t))
      setSelectedTask(prev => prev?.zohoId === zohoId ? { ...prev, ...data } : prev)
    } catch {}
  }, [])

  const handleComplete = useCallback(async (zohoId: string) => {
    await handleUpdate(zohoId, { status: "Completed" })
  }, [handleUpdate])

  // ── Filtered tasks ─────────────────────────────────────────────────────────
  const filteredTasks = useMemo(() => {
    let list = tasks

    // Category tab
    if (category !== "all") list = list.filter(t => classifyTask(t) === category)

    // Status
    if (filters.status === "open")      list = list.filter(t => t.status !== "Completed")
    if (filters.status === "completed") list = list.filter(t => t.status === "Completed")
    if (filters.status === "overdue")   list = list.filter(t => isOverdue(t))

    // Type
    if (filters.type !== "all") list = list.filter(t => t.type === filters.type)

    // Priority
    if (filters.priority !== "all") list = list.filter(t => t.priority === filters.priority)

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q) ||
        (t.accountName || "").toLowerCase().includes(q) ||
        (t.dealName || "").toLowerCase().includes(q)
      )
    }

    // Sort
    return [...list].sort((a, b) => {
      if (filters.sort === "priority") {
        const p = { High:0, Normal:1, Low:2 }
        return (p[a.priority]??1) - (p[b.priority]??1)
      }
      if (filters.sort === "status") return a.status.localeCompare(b.status)
      // Due date
      if (!a.dueDate && !b.dueDate) return 0
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })
  }, [tasks, category, filters, searchQuery])

  // ── Group by category ──────────────────────────────────────────────────────
  const groups = useMemo(() => ({
    communication: filteredTasks.filter(t => classifyTask(t) === "communication"),
    sales:         filteredTasks.filter(t => classifyTask(t) === "sales"),
    process:       filteredTasks.filter(t => classifyTask(t) === "process"),
  }), [filteredTasks])

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    open:     tasks.filter(t => t.status !== "Completed").length,
    overdue:  tasks.filter(t => isOverdue(t)).length,
    dueToday: tasks.filter(t => t.dueDate && sameDay(new Date(t.dueDate), new Date()) && t.status !== "Completed").length,
  }), [tasks])

  const activeFilterCount = [
    filters.status !== "open", filters.type !== "all", filters.priority !== "all", filters.sort !== "dueDate"
  ].filter(Boolean).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0a0b0d]">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-neutral-500">Loading your tasks…</p>
        </div>
      </div>
    )
  }

  // Full-screen detail
  if (selectedTask) {
    return (
      <TaskDetail
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdate={handleUpdate}
        onComplete={handleComplete}
      />
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0b0d]" style={{ paddingTop: "env(safe-area-inset-top)" }}>

      {/* ── Header ── */}
      <div className="shrink-0 px-4 pt-4 pb-2 border-b border-white/8">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1">
            <h1 className="text-2xl font-black text-white leading-tight">Task Hub</h1>
            {/* Stats pills */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-sky-400 font-bold">{stats.open} open</span>
              {stats.overdue > 0  && <span className="text-xs text-red-400 font-bold">· {stats.overdue} overdue</span>}
              {stats.dueToday > 0 && <span className="text-xs text-amber-400 font-bold">· {stats.dueToday} due today</span>}
            </div>
          </div>

          {/* Actions */}
          <button onClick={() => setShowSearch(s => !s)}
            className={`p-2.5 rounded-xl border transition-all ${showSearch ? "bg-violet-600 border-violet-500 text-white" : "bg-white/5 border-white/10 text-neutral-400"}`}
          >
            <FiSearch size={16} />
          </button>
          <button onClick={() => setShowFilter(true)}
            className={`relative p-2.5 rounded-xl border transition-all ${activeFilterCount > 0 ? "bg-violet-600 border-violet-500 text-white" : "bg-white/5 border-white/10 text-neutral-400"}`}
          >
            <FiSliders size={16} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>
          <button onClick={() => loadTasks(true)} disabled={refreshing}
            className="p-2.5 rounded-xl border border-white/10 bg-white/5 text-neutral-400 hover:text-white transition-all disabled:opacity-40"
          >
            <FiRefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
          <Link href="/tasks/new"
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold px-3 py-2.5 rounded-xl transition-all"
          >
            <FiPlus size={16} />
            <span className="hidden sm:inline">New</span>
          </Link>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="mb-3">
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tasks, accounts…"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500/50"
            />
          </div>
        )}

        {/* View toggle */}
        <div className="flex gap-2 mb-2">
          <button onClick={() => setMainView("list")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${mainView==="list" ? "bg-violet-600 text-white border-violet-500" : "bg-white/3 text-neutral-500 border-white/8"}`}
          >
            <FiList size={14} /> List
          </button>
          <button onClick={() => setMainView("calendar")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${mainView==="calendar" ? "bg-violet-600 text-white border-violet-500" : "bg-white/3 text-neutral-500 border-white/8"}`}
          >
            <FiCalendar size={14} /> Calendar
          </button>
          <span className="ml-auto text-xs text-neutral-600 self-center">{filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* ── Category Tabs ── */}
      {mainView === "list" && (
        <div className="shrink-0 flex overflow-x-auto px-4 py-2 gap-2 border-b border-white/5 hide-scroll">
          {(Object.keys(CAT) as Category[]).map(c => {
            const cnt = c === "all" ? filteredTasks.length :
              filteredTasks.filter(t => classifyTask(t) === c).length
            return (
              <button key={c} onClick={() => setCategory(c)}
                className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                  category === c ? `${CAT[c].bg} ${CAT[c].text} ${CAT[c].border}` : "bg-white/3 text-neutral-500 border-white/8"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${CAT[c].dot}`} />
                {CAT[c].label}
                <span className="text-xs opacity-60 ml-0.5">({cnt})</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {mainView === "calendar" ? (
          <MiniCalendar tasks={tasks} onSelectTask={setSelectedTask} />
        ) : (
          <div className="h-full overflow-y-auto">
            {filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center px-8">
                <FiCheckSquare size={48} className="text-neutral-700 mb-4" />
                <p className="text-lg font-black text-neutral-400">All clear!</p>
                <p className="text-sm text-neutral-600 mt-1">No tasks match your filters</p>
                <Link href="/tasks/new"
                  className="mt-6 flex items-center gap-2 bg-violet-600 text-white font-bold px-6 py-3 rounded-xl transition-all hover:bg-violet-500"
                >
                  <FiPlus size={16} /> Create a Task
                </Link>
              </div>
            ) : category === "all" ? (
              /* Grouped view */
              <div className="divide-y divide-white/5">
                {(["communication","sales","process"] as const).map(cat => {
                  const catTasks = groups[cat]
                  if (catTasks.length === 0) return null
                  const cfg = CAT[cat]
                  const catLabels: Record<string, string> = {
                    communication: "Communication — Calls, Emails & Texts",
                    sales: "Sales — Account & Deal Tasks",
                    process: "Office & Process"
                  }
                  return (
                    <div key={cat}>
                      <div className={`px-4 py-3 flex items-center gap-2 sticky top-0 z-10 ${cfg.bg} backdrop-blur-sm`}>
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                        <span className={`text-xs font-black uppercase tracking-wider ${cfg.text}`}>{catLabels[cat]}</span>
                        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.border} ${cfg.text} opacity-70`}>{catTasks.length}</span>
                      </div>
                      <div className="px-3 py-2 space-y-2">
                        {catTasks.map(task => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            onTap={() => setSelectedTask(task)}
                            onComplete={() => handleComplete(task.zohoId)}
                            onStatusChange={s => handleUpdate(task.zohoId, { status: s as TaskStatus })}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Single category */
              <div className="px-3 py-3 space-y-2">
                {filteredTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onTap={() => setSelectedTask(task)}
                    onComplete={() => handleComplete(task.zohoId)}
                    onStatusChange={s => handleUpdate(task.zohoId, { status: s as TaskStatus })}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Filter Drawer ── */}
      <FilterDrawer
        open={showFilter}
        onClose={() => setShowFilter(false)}
        filters={filters}
        setFilters={setFilters}
      />

      <style jsx>{`
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .animate-slide-up { animation: slide-up 0.22s ease-out; }
      `}</style>
    </div>
  )
}
