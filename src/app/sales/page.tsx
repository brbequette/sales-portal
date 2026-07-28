"use client"

import { formatPhoneNumber } from "@/lib/formatters"
import { resolvePermissions } from "@/lib/permissions"

import { useZoho } from "@/components/ZohoProvider"
import { InvoiceDetailsModal } from "@/components/InvoiceDetailsModal"
import { SalesCallCampaignModal } from "@/components/SalesCallCampaignModal"
import { OrderNextSteps } from "@/components/OrderNextSteps"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"

import { QualityPicker } from "@/components/QualityPicker"
import { TimezonePicker } from "@/components/TimezonePicker"
import { Pagination, usePagination } from "@/components/Pagination"
import { PhoneLink } from "@/components/PhoneLink"
import { usePreferences } from "@/components/PreferencesProvider"
import { DealPipeline } from "@/components/DealPipeline"
import { GlobalTopBar } from "@/components/GlobalTopBar"

import { FiSearch, FiClock, FiDollarSign, FiUsers, FiTrendingUp, FiUser, FiChevronRight, FiCheckCircle, FiFileText, FiPhoneCall, FiMail, FiMessageSquare, FiX, FiRefreshCw, FiFilter, FiPlus, FiEdit, FiCalendar, FiCheck, FiAlertCircle, FiBox, FiLayers, FiEye, FiTarget } from "react-icons/fi"
import { toast } from 'react-hot-toast';
import { useCampaignProgress } from "@/components/CampaignProgressProvider"

function formatLastCalled(dateStr: string | null) {
  if (!dateStr) return "Never called"
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return "Called today"
  if (diffDays === 1) return "Called yesterday"
  return `Called ${diffDays} days ago`
}

function getAccountBestPhone(account: any): { phone: string; contactName?: string } {
  if (account.phone && String(account.phone).trim()) {
    return { phone: String(account.phone).trim() }
  }
  const contacts = account.contacts || []
  const primary = contacts.find((c: any) => c.isPrimary || c.is_primary)
  if (primary) {
    const ph = primary.phone || primary.mobilePhone || primary.mobile || primary.phone_number
    if (ph && String(ph).trim()) {
      const name = [primary.firstName || primary.first_name, primary.lastName || primary.last_name].filter(Boolean).join(" ") || primary.name || "Primary Contact"
      return { phone: String(ph).trim(), contactName: name }
    }
  }
  for (const c of contacts) {
    const ph = c.phone || c.mobilePhone || c.mobile || c.phone_number
    if (ph && String(ph).trim()) {
      const name = [c.firstName || c.first_name, c.lastName || c.last_name].filter(Boolean).join(" ") || c.name || "Contact"
      return { phone: String(ph).trim(), contactName: name }
    }
  }
  return { phone: "" }
}

export default function SalesPage() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const { preferences, updatePreferences } = usePreferences()
  const router = useRouter()

  const [accounts, setAccounts] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedContactsAccountIds, setExpandedContactsAccountIds] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState("All")
  const [industryFilter, setIndustryFilter] = useState("All")
  const [mobileTab, setMobileTab] = useState<"accounts" | "tasks">("accounts")
  const [drillTitle, setDrillTitle] = useState("")
  const [drillItems, setDrillItems] = useState<any[] | null>(null)
  const [drillType, setDrillType] = useState<"invoices" | "deals" | "accounts" | null>(null)
  const [effort, setEffort] = useState<"sales" | "call_list" | "cold_call" | "pipeline">("sales")
  const [allDbUsers, setAllDbUsers] = useState<any[]>([])
  const [ownerFilter, setOwnerFilter] = useState("All")
  const [timezoneFilter, setTimezoneFilter] = useState("All")
  const [yearFilter, setYearFilter] = useState("All")
  const [sortBy, setSortBy] = useState<"default" | "timezone_asc" | "timezone_desc" | "recentOrders_desc" | "recentOrders_asc" | "ltv_desc" | "ltv_asc">("default")
  const [onlyWithSales, setOnlyWithSales] = useState(false)
  const [showDoNotCall, setShowDoNotCall] = useState(false)
  const [ltvMin, setLtvMin] = useState("")
  const [ltvMax, setLtvMax] = useState("")
  const [qualityFilter, setQualityFilter] = useState("All")
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false)
  const [missingInfoFilter, setMissingInfoFilter] = useState<{ noPhone: boolean; noEmail: boolean; noContacts: boolean }>({ noPhone: false, noEmail: false, noContacts: false })
  const [productSearch, setProductSearch] = useState("")
  const [repsList, setRepsList] = useState<any[]>([])
  const [accountsPage, setAccountsPage] = useState(1)
  const [accountsHasMore, setAccountsHasMore] = useState(false)
  const [accountsTotalCount, setAccountsTotalCount] = useState(0)

  const [editingTask, setEditingTask] = useState<any | null>(null)
  const [taskSubject, setTaskSubject] = useState("")
  const [taskDescription, setTaskDescription] = useState("")
  const [taskPriority, setTaskPriority] = useState("Normal")
  const [taskDueDate, setTaskDueDate] = useState("")
  const [taskDueTime, setTaskDueTime] = useState("")
  const [taskOwnerId, setTaskOwnerId] = useState("")
  const [taskStatus, setTaskStatus] = useState("Not Started")
  const [taskWhatId, setTaskWhatId] = useState("")
  const [taskInvoiceId, setTaskInvoiceId] = useState("")
  const [taskSalesOrderId, setTaskSalesOrderId] = useState("")
  const [taskQuoteId, setTaskQuoteId] = useState("")
  const [taskEstimateId, setTaskEstimateId] = useState("")
  const [taskSaving, setTaskSaving] = useState(false)
  const [showEditTaskModal, setShowEditTaskModal] = useState(false)

  const [viewingInvoice, setViewingInvoice] = useState<any | null>(null)
  const [viewingDocType, setViewingDocType] = useState<'Quote' | 'SalesOrder' | 'Invoice'>('Invoice')

  const [taskFilterTab, setTaskFilterTab] = useState<"due" | "pending" | "completed" | "all">("due")
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>("All")

  // Reminder states
  const [reminderDate, setReminderDate] = useState("")
  const [reminderTime, setReminderTime] = useState("")
  const [reminderMethods, setReminderMethods] = useState<string[]>([])

  // Campaign States
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [showCampaignModal, setShowCampaignModal] = useState(false)
  const [showCallCampaignModal, setShowCallCampaignModal] = useState(false)
  const [campaignName, setCampaignName] = useState("")
  const [campaignChannel, setCampaignChannel] = useState<"SMS" | "EMAIL" | "WHATSAPP">("SMS")
  const [campaignText, setCampaignText] = useState("")
  const [campaignImageUrl, setCampaignImageUrl] = useState("")
  const [campaignError, setCampaignError] = useState("")
  const [campaignSuccess, setCampaignSuccess] = useState("")
  const [zohoNumbers, setZohoNumbers] = useState<any[]>([])
  const [selectedZohoNumber, setSelectedZohoNumber] = useState("")
  const [campaignTemplates, setCampaignTemplates] = useState<any[]>([])
  const [dbUser, setDbUser] = useState<any>(null)
  const [mediaAssets, setMediaAssets] = useState<any[]>([])
  const [showAssetSelector, setShowAssetSelector] = useState(false)

  // Campaign Progress from context
  const { state: campaignState, start: startCampaign, cancel: cancelCampaign, showModal: campaignModalFromPill, setShowModal: setCampaignModalFromPill } = useCampaignProgress()
  const campaignSending = campaignState.status === 'running'
  const campaignProgress = campaignState.progress
  const campaignTotal = campaignState.total

  // Persistent Filters
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  useEffect(() => {
    if (!preferences || prefsLoaded) return
    if (preferences.ownerFilter) setOwnerFilter(preferences.ownerFilter)
    if (preferences.sortBy) setSortBy(preferences.sortBy)
    if (preferences.searchQuery) setSearchQuery(preferences.searchQuery)
    if (preferences.timezoneFilter) setTimezoneFilter(preferences.timezoneFilter)
    if (preferences.qualityFilter) setQualityFilter(preferences.qualityFilter)
    setPrefsLoaded(true)
  }, [preferences, prefsLoaded])

  const effectiveRole = preferences.impersonatedUser ? preferences.impersonatedUser.role : (dbUser?.role || currentUser?.role || "")
  const normalizedRole = effectiveRole.toLowerCase()
  const isAdminUser = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("collections") || normalizedRole.includes("manager")

  useEffect(() => {
    fetchLocalData(1, false)
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/get-users")
      const d = await res.json()
      if (d.users) setAllDbUsers(d.users)
    } catch (e) {}
  }

  const fetchLocalData = async (pageNum = 1, isLoadMore = false) => {
    try {
      if (!isLoadMore) setLoading(true)
      const userEmail = currentUser?.email || preferences.impersonatedUser?.email || ""
      const emailQuery = userEmail ? `&email=${encodeURIComponent(userEmail)}` : ""
      const res = await fetch(`/api/get-accounts?page=${pageNum}&limit=1000${emailQuery}`)
      const data = await res.json()
      if (data.accounts || data.success) {
        if (isLoadMore) {
          setAccounts(prev => [...prev, ...(data.accounts || [])])
        } else {
          setAccounts(data.accounts || [])
        }
        setAccountsTotalCount(data.total || (data.accounts?.length || 0))
        setAccountsHasMore(data.hasMore || false)
        setAccountsPage(pageNum)
      }
      
      const tRes = await fetch("/api/get-tasks")
      const tData = await tRes.json()
      if (tData.tasks) setTasks(tData.tasks)
    } catch (err: any) {
      console.error(err)
      setApiError("Failed to load accounts and tasks")
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    try {
      setLoading(true)
      await fetch("/api/zoho-sync", { method: "POST" })
      await fetchLocalData(1, false)
      toast.success("Synced with Zoho successfully")
    } catch (err) {
      toast.error("Sync failed")
    } finally {
      setLoading(false)
    }
  }

  const handleEffortChange = (newEffort: "sales" | "call_list" | "cold_call" | "pipeline") => {
    setEffort(newEffort)
    setSelectedAccountIds([])
  }

  // Account Filters
  const owners = Array.from(new Set(accounts.map(a => a.owner?.id).filter(Boolean))).map(id => {
    const acc = accounts.find(a => a.owner?.id === id)
    return { id, name: acc.owner?.name, email: acc.owner?.email }
  })

  const allTimezones = Array.from(new Set(accounts.map(a => a.timeZone).filter(Boolean))).sort()
  const allYears = Array.from(new Set(accounts.map(a => a.yearPurchased).filter(Boolean))).sort((a, b) => b - a)
  const allStatuses = Array.from(new Set(accounts.map(a => a.status).filter(Boolean))).sort()
  const allIndustries = Array.from(new Set(accounts.map(a => a.industry).filter(Boolean))).sort()

  const filteredByOwnerActive = accounts.filter(a => {
    if (ownerFilter !== "All" && a.ownerId !== ownerFilter) return false
    return true
  })

  const filteredAccounts = filteredByOwnerActive.filter(account => {
    if (!showDoNotCall && account.tags?.toLowerCase().includes("do_not_call")) return false
    if (effort === "cold_call" && (account.totalSales || 0) > 0) return false
    if (statusFilter !== "All" && account.status !== statusFilter) return false
    if (industryFilter !== "All" && account.industry !== industryFilter) return false
    if (timezoneFilter !== "All" && account.timeZone !== timezoneFilter) return false
    if (qualityFilter !== "All" && (account.quality || "NEVER_STATUSED") !== qualityFilter) return false
    if (yearFilter !== "All" && (account.yearPurchased ? String(account.yearPurchased) : "Unknown") !== yearFilter) return false
    if (onlyWithSales && (!account.totalSales || account.totalSales <= 0)) return false

    if (ltvMin && (account.totalSales || 0) < parseFloat(ltvMin)) return false
    if (ltvMax && (account.totalSales || 0) > parseFloat(ltvMax)) return false

    if (missingInfoFilter.noPhone || missingInfoFilter.noEmail || missingInfoFilter.noContacts) {
      const accPhone = account.phone || account.booksContact?.phone
      const accEmail = account.email || account.booksContact?.email
      const accContacts = account.contacts || []
      const hasPhone = !!accPhone || accContacts.some((c: any) => c.phone || c.mobilePhone)
      const hasEmail = !!accEmail || accContacts.some((c: any) => c.email)
      const hasContacts = accContacts.length > 0

      if (missingInfoFilter.noPhone && hasPhone) return false
      if (missingInfoFilter.noEmail && hasEmail) return false
      if (missingInfoFilter.noContacts && hasContacts) return false
    }

    if (productSearch) {
      const q = productSearch.toLowerCase()
      const boughtProducts = account.boughtProducts || []
      const matchesProduct = boughtProducts.some((p: any) => 
        (p.name && p.name.toLowerCase().includes(q)) || 
        (p.sku && p.sku.toLowerCase().includes(q))
      )
      if (!matchesProduct) return false
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const nameMatch = account.name?.toLowerCase().includes(q)
      const emailMatch = account.email?.toLowerCase().includes(q)
      const phoneMatch = account.phone?.includes(q)
      const cityMatch = account.shippingCity?.toLowerCase().includes(q) || account.billingCity?.toLowerCase().includes(q)
      const contactMatch = account.contacts?.some((c: any) => 
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || 
        c.email?.toLowerCase().includes(q) || 
        c.phone?.includes(q)
      )
      if (!nameMatch && !emailMatch && !phoneMatch && !cityMatch && !contactMatch) return false
    }

    return true
  }).sort((a, b) => {
    if (sortBy === "timezone_asc") return (a.timeZone || "").localeCompare(b.timeZone || "")
    if (sortBy === "timezone_desc") return (b.timeZone || "").localeCompare(a.timeZone || "")
    if (sortBy === "recentOrders_desc") return new Date(b.lastOrderDate || 0).getTime() - new Date(a.lastOrderDate || 0).getTime()
    if (sortBy === "recentOrders_asc") return new Date(a.lastOrderDate || 0).getTime() - new Date(b.lastOrderDate || 0).getTime()
    if (sortBy === "ltv_desc") return (b.totalSales || 0) - (a.totalSales || 0)
    if (sortBy === "ltv_asc") return (a.totalSales || 0) - (b.totalSales || 0)
    return 0
  })

  // Prioritized Smart Call List
  const callListAccounts = filteredByOwnerActive.filter(a => {
    if (!showDoNotCall && a.tags?.toLowerCase().includes("do_not_call")) return false
    return true
  }).sort((a, b) => {
    const qOrder: Record<string, number> = { HOT: 1, WARM: 2, COLD: 3, ON_HOLD: 4, NEVER_STATUSED: 5 }
    const qA = qOrder[a.quality || "NEVER_STATUSED"] || 5
    const qB = qOrder[b.quality || "NEVER_STATUSED"] || 5
    if (qA !== qB) return qA - qB
    return (b.totalSales || 0) - (a.totalSales || 0)
  }).slice(0, 50)

  const activeAccountsList = effort === "call_list" ? callListAccounts : filteredAccounts

  const accountsPagination = usePagination(activeAccountsList, 50)
  const drillPagination = usePagination(drillItems || [], 25)

  // Active filters count
  const activeFilterCount = (ownerFilter !== "All" ? 1 : 0) +
    (statusFilter !== "All" ? 1 : 0) +
    (industryFilter !== "All" ? 1 : 0) +
    (timezoneFilter !== "All" ? 1 : 0) +
    (qualityFilter !== "All" ? 1 : 0) +
    (yearFilter !== "All" ? 1 : 0) +
    (onlyWithSales ? 1 : 0) +
    (productSearch ? 1 : 0) +
    (missingInfoFilter.noPhone || missingInfoFilter.noEmail || missingInfoFilter.noContacts ? 1 : 0)

  // Tasks filter
  const effortTasks = tasks.filter(t => {
    if (ownerFilter !== "All" && t.ownerId !== ownerFilter) return false
    return true
  })

  const filteredTasksList = effortTasks.filter(t => {
    if (taskFilterTab === "due") {
      if (t.status === "Completed") return false
      if (!t.dueDate) return true
      return new Date(t.dueDate) <= new Date()
    }
    if (taskFilterTab === "pending") return t.status !== "Completed"
    if (taskFilterTab === "completed") return t.status === "Completed"
    return true
  }).filter(t => {
    if (taskTypeFilter === "All") return true
    return (t.type || "Task").toLowerCase() === taskTypeFilter.toLowerCase()
  })

  const tasksPagination = usePagination(filteredTasksList, 25)

  const handleOpenEditTask = (t: any) => {
    setEditingTask(t)
    setTaskSubject(t.subject || t.title || "")
    setTaskDescription(t.description || "")
    setTaskPriority(t.priority || "Normal")
    setTaskOwnerId(t.ownerId || "")
    setTaskStatus(t.status || "Not Started")
    setTaskWhatId(t.accountId || "")
    setTaskInvoiceId(t.invoiceId || "")
    setTaskSalesOrderId(t.salesOrderId || "")
    setTaskQuoteId(t.quoteId || "")
    setTaskEstimateId(t.estimateId || "")
    if (t.dueDate) {
      const d = new Date(t.dueDate)
      setTaskDueDate(d.toISOString().split("T")[0])
      setTaskDueTime(d.toTimeString().slice(0, 5))
    } else {
      setTaskDueDate("")
      setTaskDueTime("")
    }
    setShowEditTaskModal(true)
  }

  const handleCompleteTask = async (t: any) => {
    try {
      const res = await fetch("/api/update-task", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: t.id, status: "Completed" })
      })
      const d = await res.json()
      if (d.success) {
        setTasks(prev => prev.map(item => item.id === t.id ? { ...item, status: "Completed" } : item))
        toast.success("Task completed")
      }
    } catch (e) {
      toast.error("Failed to complete task")
    }
  }

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskSubject) return toast.error("Please enter a subject")
    setTaskSaving(true)
    try {
      let dueIso = null
      if (taskDueDate) {
        dueIso = taskDueTime ? `${taskDueDate}T${taskDueTime}:00` : `${taskDueDate}T00:00:00`
      }
      const payload = {
        taskId: editingTask?.id,
        title: taskSubject,
        subject: taskSubject,
        description: taskDescription,
        priority: taskPriority,
        dueDate: dueIso,
        ownerId: taskOwnerId,
        status: taskStatus,
        accountId: taskWhatId || null,
        invoiceId: taskInvoiceId || null,
        salesOrderId: taskSalesOrderId || null,
        quoteId: taskQuoteId || null,
        estimateId: taskEstimateId || null,
      }

      const method = editingTask ? "PUT" : "POST"
      const url = editingTask ? "/api/update-task" : "/api/create-task"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.success) {
        toast.success(editingTask ? "Task updated" : "Task created")
        setShowEditTaskModal(false)
        fetchLocalData(1, false)
      } else {
        toast.error("Error: " + data.error)
      }
    } catch (e) {
      toast.error("Failed to save task")
    } finally {
      setTaskSaving(false)
    }
  }

  const handleSendCampaign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAccountIds.length) return setCampaignError("Please select at least 1 account")
    if (!campaignText) return setCampaignError("Please enter campaign message text")
    
    setCampaignError("")
    setCampaignSuccess("")
    try {
      startCampaign({
        accountIds: selectedAccountIds,
        channel: campaignChannel,
        text: campaignText,
        imageUrl: campaignImageUrl,
        fromNumber: selectedZohoNumber,
        campaignName: campaignName || `Blast - ${new Date().toLocaleDateString()}`,
        userId: currentUser?.id || dbUser?.id || "",
        userEmail: currentUser?.email || dbUser?.email || ""
      })
      setShowCampaignModal(false)
      toast.success("Campaign blast started in background")
    } catch (err: any) {
      setCampaignError(err.message || "Failed to start campaign")
    }
  }

  return (
    <>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
          
          {/* Header & Sub-header Tabs */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <FiTrendingUp className="text-emerald-400" /> Sales Pipeline & Call Lists
              </h1>
              <p className="text-xs text-neutral-400 mt-1 font-medium">
                Manage sales pipeline, cold calls, smart call queue, and deal lifecycle.
              </p>
            </div>

            {/* Impersonation dropdown for Admin */}
            {isAdminUser && allDbUsers.length > 0 && (
              <div className="flex items-center gap-2 bg-neutral-900 border border-white/10 rounded-xl px-3 py-1.5 shrink-0">
                <FiEye size={14} className="text-neutral-400" />
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">View as Rep</span>
                <select
                  value={preferences.impersonatedUser?.id || ""}
                  onChange={e => {
                    const id = e.target.value;
                    if (!id) {
                      updatePreferences({ impersonatedUser: null });
                    } else {
                      const u = allDbUsers.find(user => user.id === id);
                      if (u) {
                        updatePreferences({ impersonatedUser: { id: u.id, name: u.name, email: u.email, role: u.role } });
                      }
                    }
                  }}
                  className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">Myself (Admin)</option>
                  {allDbUsers.filter(u => u.role !== 'ADMIN' && u.name).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')).map((u: any) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Sub-header Tabs Navigation */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            
            {/* Sales Pipeline Tab */}
            <button
              onClick={() => handleEffortChange("sales")}
              className={`relative overflow-hidden rounded-xl p-4 text-left border transition-all duration-300 ${
                effort === "sales"
                  ? "bg-[#17191a] border-emerald-400/45 text-white shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                  : "bg-white/[0.035] border-[var(--border)] hover:border-[var(--border)] text-neutral-400"
              }`}
            >
              {effort === "sales" && <div className="absolute right-3 top-3 w-2 h-2 rounded-full bg-emerald-400" />}
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border transition-colors ${effort === "sales" ? "bg-emerald-950 border-emerald-500/30 text-emerald-400" : "bg-white/[0.045] border-[var(--border)] text-neutral-500"}`}>
                  <FiTrendingUp size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Sales Pipeline</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">Manage accounts & deals</p>
                </div>
                <div className="ml-auto shrink-0 flex items-center justify-center min-w-[28px] h-7 px-2 rounded-md text-xs font-black bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  {filteredAccounts.length}
                </div>
              </div>
            </button>

            {/* Cold Call List Tab */}
            <button
              onClick={() => handleEffortChange("cold_call")}
              className={`relative overflow-hidden rounded-xl p-4 text-left border transition-all duration-300 ${
                effort === "cold_call"
                  ? "bg-[#17191a] border-blue-400/45 text-white shadow-[0_0_20px_rgba(59,130,246,0.15)]"
                  : "bg-white/[0.035] border-[var(--border)] hover:border-[var(--border)] text-neutral-400"
              }`}
            >
              {effort === "cold_call" && <div className="absolute right-3 top-3 w-2 h-2 rounded-full bg-blue-400" />}
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border transition-colors ${effort === "cold_call" ? "bg-blue-950 border-blue-500/30 text-blue-400" : "bg-white/[0.045] border-[var(--border)] text-neutral-500"}`}>
                  <FiPhoneCall size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Cold Call List</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">Never purchased</p>
                </div>
              </div>
            </button>

            {/* Smart Call List Tab */}
            <button
              onClick={() => handleEffortChange("call_list")}
              className={`relative overflow-hidden rounded-xl p-4 text-left border transition-all duration-300 ${
                effort === "call_list"
                  ? "bg-[#17191a] border-sky-400/45 text-white shadow-[0_0_20px_rgba(56,189,248,0.15)]"
                  : "bg-white/[0.035] border-[var(--border)] hover:border-[var(--border)] text-neutral-400"
              }`}
            >
              {effort === "call_list" && <div className="absolute right-3 top-3 w-2 h-2 rounded-full bg-sky-400" />}
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border transition-colors ${effort === "call_list" ? "bg-sky-950 border-sky-500/30 text-sky-400" : "bg-white/[0.045] border-[var(--border)] text-neutral-500"}`}>
                  <FiClock size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Smart Call List</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">Follow-ups prioritized</p>
                </div>
                <div className="ml-auto shrink-0 flex items-center justify-center min-w-[28px] h-7 px-2 rounded-md text-xs font-black bg-sky-500/10 text-sky-300 border border-sky-500/20">
                  {callListAccounts.length}
                </div>
              </div>
            </button>

            {/* Deal Pipeline Tab */}
            <button
              onClick={() => handleEffortChange("pipeline")}
              className={`relative overflow-hidden rounded-xl p-4 text-left border transition-all duration-300 ${
                effort === "pipeline"
                  ? "bg-[#17191a] border-purple-400/45 text-white shadow-[0_0_20px_rgba(168,85,247,0.15)]"
                  : "bg-white/[0.035] border-[var(--border)] hover:border-[var(--border)] text-neutral-400"
              }`}
            >
              {effort === "pipeline" && <div className="absolute right-3 top-3 w-2 h-2 rounded-full bg-purple-400" />}
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border transition-colors ${effort === "pipeline" ? "bg-purple-950 border-purple-500/30 text-purple-400" : "bg-white/[0.045] border-[var(--border)] text-neutral-500"}`}>
                  <FiLayers size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Deal Pipeline</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">Kanban lifecycle</p>
                </div>
              </div>
            </button>

          </div>

          {/* Effort View Switcher */}
          {effort === "pipeline" ? (
            <div className="mt-4">
              <DealPipeline onViewInvoice={(inv) => {
                setViewingInvoice(inv)
                setViewingDocType('Invoice')
              }} />
            </div>
          ) : (
            <>
              {/* Quick Invoice View Toolbar */}
              <div className="flex flex-wrap gap-2.5 glass-panel p-3 rounded-xl border border-[var(--border)]">
                <span className="text-xs text-neutral-400 font-semibold flex items-center gap-1.5 mr-2 self-center">
                  Quick Invoice View:
                </span>
                <button
                  onClick={() => {
                    const recentPaid = accounts
                      .filter(a => ownerFilter === "All" || a.ownerId === ownerFilter)
                      .filter(a => (a.totalSales || 0) > 0)
                      .map(a => {
                        let maxPaidDate = 0
                        if (a.invoices && Array.isArray(a.invoices)) {
                          a.invoices.forEach((inv: any) => {
                            if (inv.status === 'Paid' || inv.status === 'Closed') {
                              const pDateStr = (inv.items as any)?.paymentDate || inv.issueDate
                              if (pDateStr) {
                                const pTime = new Date(pDateStr).getTime()
                                if (pTime > maxPaidDate) maxPaidDate = pTime
                              }
                            }
                          })
                        }
                        return { ...a, _latestPaymentTime: maxPaidDate }
                      })
                      .filter(a => a._latestPaymentTime > 0)
                      .sort((a, b) => b._latestPaymentTime - a._latestPaymentTime)
                      .slice(0, 50)
                    setDrillType("accounts")
                    setDrillTitle("Recent Paid Accounts (Last 50)")
                    setDrillItems(recentPaid)
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer"
                >
                  <FiCheckCircle size={13} />
                  <span>Recent Paid Accounts</span>
                  <span className="bg-emerald-500/20 px-1.5 py-0.5 rounded text-[10px] font-black">{Math.min(50, accounts.filter(a => (ownerFilter === "All" || a.ownerId === ownerFilter) && (a.totalSales || 0) > 0).length)}</span>
                </button>

                <button
                  onClick={() => {
                    const unpaidAccounts = accounts
                      .filter(a => ownerFilter === "All" || a.ownerId === ownerFilter)
                      .filter(a => (a.unpaidCount || 0) > 0 || (a.unpaidBalance || 0) > 0)
                      .sort((a: any, b: any) => (b.unpaidBalance || 0) - (a.unpaidBalance || 0))
                    setDrillType("accounts")
                    setDrillTitle("Accounts with Unpaid Invoices")
                    setDrillItems(unpaidAccounts)
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all cursor-pointer"
                >
                  <FiAlertCircle size={13} />
                  <span>Accounts with Unpaid</span>
                  <span className="bg-amber-500/20 px-1.5 py-0.5 rounded text-[10px] font-black">{accounts.filter(a => (ownerFilter === "All" || a.ownerId === ownerFilter) && ((a.unpaidCount || 0) > 0 || (a.unpaidBalance || 0) > 0)).length}</span>
                </button>

                <button
                  onClick={() => {
                    const overdueAccounts = accounts
                      .filter(a => ownerFilter === "All" || a.ownerId === ownerFilter)
                      .filter(a => (a.overdueCount || 0) > 0)
                      .sort((a: any, b: any) => (b.overdueBalance || 0) - (a.overdueBalance || 0))
                    setDrillType("accounts")
                    setDrillTitle("Accounts with Overdue Invoices")
                    setDrillItems(overdueAccounts)
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-all cursor-pointer"
                >
                  <FiAlertCircle size={13} />
                  <span>All Overdue Accounts</span>
                  <span className="bg-rose-500/20 px-1.5 py-0.5 rounded text-[10px] font-black">{accounts.filter(a => (ownerFilter === "All" || a.ownerId === ownerFilter) && ((a.overdueCount || 0) > 0)).length}</span>
                </button>
              </div>

              {/* Mobile tab switcher */}
              <div className="flex sm:hidden bg-neutral-800 rounded-lg p-0.5 gap-0.5">
                <button onClick={() => setMobileTab("accounts")} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${mobileTab === "accounts" ? "bg-neutral-700 text-white" : "text-neutral-400"}`}>
                  Accounts ({filteredAccounts.length})
                </button>
                <button onClick={() => setMobileTab("tasks")} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${mobileTab === "tasks" ? "bg-neutral-700 text-white" : "text-neutral-400"}`}>
                  Tasks ({effortTasks.length})
                </button>
              </div>

              {/* Main 2-column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* Accounts Table Column */}
                <div className={`lg:col-span-2 space-y-3 ${mobileTab === "tasks" ? "hidden sm:block" : ""}`}>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <h2 className="text-base font-bold text-white whitespace-nowrap flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>{isAdminUser ? "All Pipeline Accounts" : "My Pipeline Accounts"}</span>
                    </h2>
                    
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                      <button
                        onClick={() => setShowFiltersDrawer(true)}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-[var(--border)] glass-panel hover:bg-white/10 transition-all text-neutral-300 hover:text-white cursor-pointer"
                      >
                        <FiFilter size={12} className={activeFilterCount > 0 ? "text-emerald-400" : ""} />
                        <span>Filters</span>
                        {activeFilterCount > 0 && (
                          <span className="flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {activeFilterCount}
                          </span>
                        )}
                      </button>

                      <button
                        onClick={handleSync}
                        disabled={loading}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-emerald-500/30 bg-emerald-950/20 hover:bg-emerald-950/40 text-emerald-400 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <FiRefreshCw size={12} className={loading ? "animate-spin" : ""} />
                        <span>{loading ? "Syncing..." : "Sync CRM"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Account List Box */}
                  <div className="bg-neutral-800/30 rounded-xl border border-[var(--border)] overflow-hidden">
                    {activeAccountsList.length === 0 ? (
                      <div className="p-8 text-center">
                        <FiUsers className="mx-auto text-3xl text-neutral-700 mb-2" />
                        <p className="text-neutral-400 text-sm">No accounts found matching filters.</p>
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {/* Selection & Toolbar */}
                        <div className="glass-panel border-b border-[var(--border)] px-4 py-3 flex items-center justify-between gap-3 text-xs sm:text-sm flex-wrap">
                          <div className="flex items-center gap-3 flex-1 min-w-[250px]">
                            <input 
                              type="checkbox"
                              checked={accountsPagination.paginatedItems.length > 0 && accountsPagination.paginatedItems.every(a => selectedAccountIds.includes(a.id))}
                              onChange={() => {
                                const pageIds = accountsPagination.paginatedItems.map(a => a.id)
                                const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedAccountIds.includes(id))
                                if (allPageSelected) {
                                  setSelectedAccountIds(prev => prev.filter(id => !pageIds.includes(id)))
                                } else {
                                  setSelectedAccountIds(prev => [...new Set([...prev, ...pageIds])])
                                }
                              }}
                              className="w-4 h-4 rounded border-[var(--border)] text-emerald-600 focus:ring-emerald-500 bg-neutral-800 cursor-pointer shrink-0"
                            />
                            
                            {/* Search box */}
                            <div className="relative flex-1 max-w-xs">
                              <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
                              <input 
                                type="text"
                                placeholder="Search accounts..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-neutral-800/80 border border-[var(--border)] rounded-md pl-8 pr-8 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors"
                              />
                            </div>
                          </div>

                          {selectedAccountIds.length > 0 && (
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => setShowCampaignModal(true)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all flex items-center gap-1.5 text-xs cursor-pointer"
                              >
                                <FiMail size={14} />
                                <span>Create Campaign ({selectedAccountIds.length})</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* List Items */}
                        <ul className="divide-y divide-neutral-800">
                          {accountsPagination.paginatedItems.map(account => {
                            const isSelected = selectedAccountIds.includes(account.id)
                            const ltv = account.totalSales || 0
                            const bestPhoneInfo = getAccountBestPhone(account)
                            const hasPhone = !!bestPhoneInfo.phone
                            const callPhone = bestPhoneInfo.phone
                            const contactsCount = (account.contacts || []).length
                            const isContactsExpanded = expandedContactsAccountIds.includes(account.id)

                            return (
                              <li key={account.id} className={`hover:bg-white/[0.02] transition-colors ${isSelected ? "bg-emerald-950/20" : ""}`}>
                                <div className="flex items-center justify-between px-4 py-3.5 gap-4">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() =>
                                      setSelectedAccountIds(prev =>
                                        prev.includes(account.id)
                                          ? prev.filter(id => id !== account.id)
                                          : [...prev, account.id]
                                      )
                                    }
                                    className="w-4 h-4 rounded border-[var(--border)] text-emerald-600 focus:ring-emerald-500 bg-neutral-800 cursor-pointer shrink-0"
                                  />
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <Link href={`/account?id=${account.zohoId}`} className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-300 font-bold text-sm border border-[var(--border)] shrink-0 hover:border-emerald-500 transition-colors">
                                      {account.name.charAt(0)}
                                    </Link>
                                    <div className="min-w-0">
                                      <Link href={`/account?id=${account.zohoId}`} className="text-sm font-bold text-white truncate block hover:text-emerald-400 transition-colors">
                                        {account.name}
                                      </Link>
                                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                        <QualityPicker
                                          zohoId={account.zohoId}
                                          accountId={account.id}
                                          currentQuality={account.quality || "NEVER_STATUSED"}
                                          compact
                                          onUpdated={(newQuality) =>
                                            setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, quality: newQuality } : a))
                                          }
                                        />
                                        <TimezonePicker
                                          zohoId={account.zohoId}
                                          accountId={account.id}
                                          currentTimezone={account.timeZone || ""}
                                          compact
                                          onUpdated={(newTz) =>
                                            setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, timeZone: newTz } : a))
                                          }
                                        />
                                        {contactsCount > 0 && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setExpandedContactsAccountIds(prev =>
                                                prev.includes(account.id)
                                                  ? prev.filter(id => id !== account.id)
                                                  : [...prev, account.id]
                                              )
                                            }}
                                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                                              isContactsExpanded
                                                ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                                                : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white hover:border-neutral-600"
                                            }`}
                                            title="Click to view all account contacts and communication options"
                                          >
                                            <FiUsers size={11} className={isContactsExpanded ? "text-sky-400" : "text-neutral-500"} />
                                            <span>{contactsCount} Contact{contactsCount !== 1 ? 's' : ''}</span>
                                            <span className={`inline-block transition-transform duration-200 ${isContactsExpanded ? "rotate-180" : ""}`}>▾</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="hidden sm:flex flex-col text-right shrink-0 min-w-[110px]">
                                    <p className="text-sm font-bold text-emerald-400">
                                      ${ltv >= 1000000 ? `${(ltv / 1000000).toFixed(1)}M` : ltv >= 1000 ? `${(ltv / 1000).toFixed(1)}k` : ltv.toFixed(0)}
                                    </p>
                                    <p className="text-[10px] text-neutral-500 mt-0.5">Total Sales</p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {hasPhone && (
                                      <PhoneLink
                                        phone={callPhone}
                                        showNumberOnDesktop
                                        className="p-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/40 rounded-xl text-emerald-300 font-mono text-xs font-bold transition-all"
                                      >
                                        <FiPhoneCall size={14} />
                                      </PhoneLink>
                                    )}
                                    <Link href={`/account?id=${account.zohoId}`} className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-full text-neutral-400 hover:text-white transition-colors">
                                      <FiChevronRight size={16} />
                                    </Link>
                                  </div>
                                </div>

                                {/* Collapsible Contacts Drawer */}
                                {isContactsExpanded && account.contacts && account.contacts.length > 0 && (
                                  <div className="px-4 pb-3.5 pt-2 bg-black/40 border-t border-white/5 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider flex items-center gap-1.5">
                                        <FiUsers size={12} className="text-sky-400" />
                                        <span>All Account Contacts ({account.contacts.length})</span>
                                      </span>
                                      <span className="text-[10px] text-neutral-500 font-medium">
                                        Click to call / SMS / email
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {account.contacts.map((contact: any, cIdx: number) => {
                                        const contactName = [contact.firstName || contact.first_name, contact.lastName || contact.last_name].filter(Boolean).join(" ") || contact.name || `Contact #${cIdx + 1}`
                                        const cPhone = contact.phone || contact.mobilePhone || contact.mobile || contact.phone_number
                                        const cEmail = contact.email

                                        return (
                                          <div key={contact.id || contact.zohoId || cIdx} className="glass-panel border border-neutral-750/70 rounded-xl p-3 flex flex-col justify-between gap-2 bg-neutral-900/80">
                                            <div>
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                                                  <FiUser size={12} className="text-neutral-400 shrink-0" />
                                                  <span className="truncate">{contactName}</span>
                                                </span>
                                                {contact.isPrimary && (
                                                  <span className="text-[8px] uppercase font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                                                    Primary
                                                  </span>
                                                )}
                                              </div>
                                              {(contact.title || contact.designation || contact.department) && (
                                                <p className="text-[10px] text-neutral-400 mt-0.5 truncate">{contact.title || contact.designation || contact.department}</p>
                                              )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/5">
                                              {cPhone && (
                                                <PhoneLink
                                                  phone={cPhone}
                                                  showNumberOnDesktop
                                                  className="px-2 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 font-mono text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                                                >
                                                  <FiPhoneCall size={10} />
                                                </PhoneLink>
                                              )}
                                              {cPhone && (
                                                <PhoneLink
                                                  phone={cPhone}
                                                  type="sms"
                                                  className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-400 font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer"
                                                >
                                                  💬 SMS
                                                </PhoneLink>
                                              )}
                                              {cEmail && (
                                                <a
                                                  href={`mailto:${cEmail}`}
                                                  className="px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-300 text-[10px] font-mono font-bold flex items-center gap-1 transition-all truncate max-w-[170px]"
                                                  title={cEmail}
                                                >
                                                  <FiMail size={10} />
                                                  <span className="truncate">{cEmail}</span>
                                                </a>
                                              )}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                              </li>
                            )
                          })}
                        </ul>

                        <Pagination 
                          currentPage={accountsPagination.currentPage}
                          pageSize={accountsPagination.pageSize}
                          totalItems={activeAccountsList.length}
                          onPageChange={accountsPagination.setCurrentPage}
                          onPageSizeChange={accountsPagination.setPageSize}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Tasks Column */}
                <div className={`space-y-3 ${mobileTab === "accounts" ? "hidden sm:block" : ""}`}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                      <span>Task List ({filteredTasksList.length})</span>
                    </h2>
                  </div>

                  <div className="bg-neutral-800/30 rounded-xl border border-[var(--border)] p-3">
                    {filteredTasksList.length === 0 ? (
                      <div className="text-center py-8">
                        <FiCheckCircle className="mx-auto text-3xl text-neutral-600 mb-2" />
                        <p className="text-neutral-300 font-bold text-sm">All caught up!</p>
                        <p className="text-xs text-neutral-500 mt-1">No tasks in this filter view.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {tasksPagination.paginatedItems.map(task => (
                          <div key={task.id} className="glass-panel border border-[var(--border)] rounded-xl p-3.5 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 uppercase">
                                {task.status}
                              </span>
                              {task.status !== "Completed" && (
                                <button onClick={() => handleCompleteTask(task)} className="text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded px-2 py-0.5">
                                  Complete
                                </button>
                              )}
                            </div>
                            <h4 className="text-sm font-bold text-white">{task.title}</h4>
                            {task.description && <p className="text-xs text-neutral-400">{task.description}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </>
          )}

        </div>

      {/* Invoice Details Modal */}
      {viewingInvoice && (
        <InvoiceDetailsModal
          invoice={viewingInvoice}
          onClose={() => setViewingInvoice(null)}
        />
      )}

      {/* Campaign Modal */}
      {showCampaignModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCampaignModal(false)} />
          <div className="relative w-full max-w-lg glass-panel border border-[var(--border)] rounded-xl p-6 text-white z-[9999]">
            <div className="flex justify-between items-center pb-4 border-b border-[var(--border)] mb-4">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <FiMail className="text-emerald-500" /> New Campaign Blast
              </h3>
              <button onClick={() => setShowCampaignModal(false)} className="text-neutral-400 hover:text-white p-1 rounded-full">
                <FiX size={16} />
              </button>
            </div>
            <form onSubmit={handleSendCampaign} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-300 uppercase mb-1">Message</label>
                <textarea
                  value={campaignText}
                  onChange={e => setCampaignText(e.target.value)}
                  rows={4}
                  className="w-full bg-black/30 border border-[var(--border)] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                  placeholder="Type your message..."
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowCampaignModal(false)} className="px-4 py-2 rounded-lg bg-neutral-800 text-sm font-semibold">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white">
                  Send Blast
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Filters Drawer */}
      {showFiltersDrawer && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFiltersDrawer(false)} />
          <div className="relative w-full max-w-md glass-panel border border-[var(--border)] rounded-xl p-6 text-white z-[9999]">
            <div className="flex justify-between items-center pb-4 border-b border-[var(--border)] mb-4">
              <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
                <FiFilter className="text-emerald-400" /> Filters
              </h3>
              <button onClick={() => setShowFiltersDrawer(false)} className="text-neutral-400 hover:text-white p-1 rounded-full">
                <FiX size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Time Zone</label>
                <select
                  value={timezoneFilter}
                  onChange={e => setTimezoneFilter(e.target.value)}
                  className="w-full bg-neutral-800 border border-[var(--border)] rounded-lg p-2 text-xs text-white"
                >
                  <option value="All">All Time Zones</option>
                  {allTimezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Quality</label>
                <select
                  value={qualityFilter}
                  onChange={e => setQualityFilter(e.target.value)}
                  className="w-full bg-neutral-800 border border-[var(--border)] rounded-lg p-2 text-xs text-white"
                >
                  <option value="All">All Qualities</option>
                  <option value="HOT">Hot</option>
                  <option value="WARM">Warm</option>
                  <option value="COLD">Cold</option>
                  <option value="ON_HOLD">On Hold</option>
                  <option value="NEVER_STATUSED">Never Statused</option>
                </select>
              </div>
            </div>
            <div className="pt-6 flex justify-end">
              <button onClick={() => setShowFiltersDrawer(false)} className="px-5 py-2 rounded-lg bg-emerald-600 text-white font-bold text-xs">
                Apply Filters
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </>
  )
}
