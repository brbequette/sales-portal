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

import { FiSearch, FiClock, FiDollarSign, FiUsers, FiTrendingUp, FiUser, FiChevronRight, FiCheckCircle, FiFileText, FiPhoneCall, FiPhone, FiMail, FiMessageSquare, FiX, FiRefreshCw, FiFilter, FiPlus, FiEdit, FiCalendar, FiCheck, FiAlertCircle, FiBox, FiLayers, FiEye, FiTarget } from "react-icons/fi"
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

function getAccountBestPhone(account: any): { phone: string; label: string } {
  if (account.phone && String(account.phone).trim()) {
    return { phone: String(account.phone).trim(), label: "Company Phone" }
  }
  const contacts = account.contacts || []
  const primary = contacts.find((c: any) => c.isPrimary || c.is_primary)
  if (primary) {
    const ph = primary.phone || primary.mobilePhone || primary.mobile || primary.phone_number
    if (ph && String(ph).trim()) {
      const name = [primary.firstName || primary.first_name, primary.lastName || primary.last_name].filter(Boolean).join(" ") || primary.name || "Primary Contact"
      return { phone: String(ph).trim(), label: `${name}, Primary` }
    }
  }
  for (const c of contacts) {
    const ph = c.phone || c.mobilePhone || c.mobile || c.phone_number
    if (ph && String(ph).trim()) {
      const name = [c.firstName || c.first_name, c.lastName || c.last_name].filter(Boolean).join(" ") || c.name || "Contact"
      const isPrimary = c.isPrimary || c.is_primary
      return { phone: String(ph).trim(), label: isPrimary ? `${name}, Primary` : name }
    }
  }
  return { phone: "", label: "" }
}

function isDoNotCallAccount(account: any): boolean {
  if (!account) return false
  
  // Quality rating check
  const quality = (account.quality || "").toUpperCase().replace(/_/g, " ")
  if (quality === "DO NOT CALL" || quality.includes("DNC") || quality.includes("DNR")) return true

  // Tags check
  const tags = (account.tags || "").toLowerCase()
  if (
    tags.includes("do_not_call") ||
    tags.includes("do not call") ||
    tags.includes("dnc") ||
    tags.includes("dnr") ||
    tags.includes("do_not_resell") ||
    tags.includes("do not resell") ||
    tags.includes("do_not_re_sell")
  ) return true

  // Account name check (e.g. *** DNR *** AM CONCRETE, *** DO NOT RE-SELL ***)
  const name = (account.name || "").toUpperCase()
  if (
    name.includes("DNR") ||
    name.includes("DO NOT CALL") ||
    name.includes("DO NOT RE-SELL") ||
    name.includes("DO NOT RESELL") ||
    name.includes("DNC")
  ) return true

  // Status check
  const status = (account.status || "").toUpperCase()
  if (status.includes("DO NOT CALL") || status.includes("DNC") || status.includes("DNR")) return true

  return false
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

  const effectiveRole = preferences.impersonatedUser ? preferences.impersonatedUser.role : (dbUser?.role || currentUser?.role || "Administrator")
  const normalizedRole = (effectiveRole || "").toLowerCase()
  const isAdminUser = !normalizedRole.includes("sales") || normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("collections") || normalizedRole.includes("manager") || !currentUser?.email

  useEffect(() => {
    fetchUsers()
  }, [])

  useEffect(() => {
    fetchLocalData(1, false)
  }, [preferences.impersonatedUser, currentUser?.email, currentUser?.role, dbUser?.role, isAdminUser])

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
      const roleQuery = effectiveRole ? `&role=${encodeURIComponent(effectiveRole)}` : ""
      const ownerQuery = "&ownerIdFilter=all"

      let allFetchedAccounts: any[] = []
      let currentPage = 1
      let hasMoreToFetch = true

      while (hasMoreToFetch) {
        const res = await fetch(`/api/get-accounts?page=${currentPage}&limit=1000&ownerIdFilter=all`)
        const data = await res.json()

        if (data.accounts || data.success) {
          const batch = data.accounts || []
          allFetchedAccounts = [...allFetchedAccounts, ...batch]

          const serverHasMore = data.pagination?.hasMore || data.hasMore || false
          if (serverHasMore && batch.length > 0 && currentPage < 20) {
            currentPage++
          } else {
            hasMoreToFetch = false
          }
        } else {
          hasMoreToFetch = false
        }
      }

      setAccounts(allFetchedAccounts)
      setAccountsTotalCount(allFetchedAccounts.length)
      setAccountsHasMore(false)

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

  const matchesOwnerFilter = (a: any, filterVal: string) => {
    if (!filterVal || 
        filterVal === "All" || 
        filterVal === "all" || 
        filterVal.toLowerCase().includes("myself") ||
        filterVal.toLowerCase() === "myself"
    ) return true

    if (isAdminUser && !preferences.impersonatedUser) return true

    const repUser = allDbUsers.find(u => 
      u.id === filterVal || 
      u.zohoId === filterVal || 
      (u.email && u.email.toLowerCase() === filterVal.toLowerCase()) ||
      (u.name && u.name.toLowerCase().includes(filterVal.toLowerCase()))
    )
    const validOwnerIds = repUser 
      ? [repUser.id, repUser.zohoId, repUser.email, repUser.name].filter(Boolean).map(s => String(s).toLowerCase()) 
      : [String(filterVal).toLowerCase()]

    const accOwnerId = String(a.ownerId || a.owner?.id || a.owner?.zohoId || '').toLowerCase()
    const accOwnerEmail = String(a.owner?.email || '').toLowerCase()
    const accOwnerName = String(a.owner?.name || '').toLowerCase()

    return validOwnerIds.some(id => 
      id && (accOwnerId === id || accOwnerEmail === id || (accOwnerName && (accOwnerName.includes(id) || id.includes(accOwnerName))))
    )
  }

  const filteredByOwnerActive = accounts.filter(a => matchesOwnerFilter(a, ownerFilter))

  const filteredAccounts = filteredByOwnerActive.filter(account => {
    const isDNC = isDoNotCallAccount(account)
    if (!showDoNotCall && qualityFilter !== "DO_NOT_CALL" && isDNC) return false
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

  const clearAllFilters = () => {
    setOwnerFilter("All")
    setStatusFilter("All")
    setIndustryFilter("All")
    setTimezoneFilter("All")
    setQualityFilter("All")
    setYearFilter("All")
    setOnlyWithSales(false)
    setLtvMin("")
    setLtvMax("")
    setProductSearch("")
    setShowDoNotCall(false)
    setMissingInfoFilter({ noPhone: false, noEmail: false, noContacts: false })
    setSearchQuery("")
    setSortBy("default")
  }

  // Active filters count
  const activeFilterCount = (ownerFilter !== "All" ? 1 : 0) +
    (statusFilter !== "All" ? 1 : 0) +
    (industryFilter !== "All" ? 1 : 0) +
    (timezoneFilter !== "All" ? 1 : 0) +
    (qualityFilter !== "All" ? 1 : 0) +
    (yearFilter !== "All" ? 1 : 0) +
    (onlyWithSales ? 1 : 0) +
    (productSearch ? 1 : 0) +
    (ltvMin ? 1 : 0) +
    (ltvMax ? 1 : 0) +
    (showDoNotCall ? 1 : 0) +
    (missingInfoFilter.noPhone ? 1 : 0) +
    (missingInfoFilter.noEmail ? 1 : 0) +
    (missingInfoFilter.noContacts ? 1 : 0)

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
              {/* Mobile tab switcher */}
              <div className="flex sm:hidden bg-neutral-800 rounded-lg p-0.5 gap-0.5 mb-4">
                <button onClick={() => setMobileTab("accounts")} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${mobileTab === "accounts" ? "bg-neutral-700 text-white" : "text-neutral-400"}`}>
                  Accounts ({filteredAccounts.length})
                </button>
                <button onClick={() => setMobileTab("tasks")} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${mobileTab === "tasks" ? "bg-neutral-700 text-white" : "text-neutral-400"}`}>
                  Tasks ({effortTasks.length})
                </button>
              </div>

              <div className="flex flex-col lg:flex-row gap-6 items-start">
                
                {/* Left Column: Accounts List */}
                <div className={`w-full lg:flex-1 space-y-4 ${mobileTab === 'accounts' ? 'block' : 'hidden lg:block'}`}>
                  {/* Quick Invoice View Toolbar */}
                  <div className="flex flex-wrap gap-2.5 glass-panel p-3 rounded-xl border border-[var(--border)]">
                    <span className="text-xs text-neutral-400 font-semibold flex items-center gap-1.5 mr-2 self-center">
                      Quick Invoice View:
                    </span>
                    <button
                      onClick={() => {
                        const recentPaid = accounts
                          .filter(a => matchesOwnerFilter(a, ownerFilter))
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
                      <span className="bg-emerald-500/20 px-1.5 py-0.5 rounded text-[10px] font-black">{Math.min(50, accounts.filter(a => matchesOwnerFilter(a, ownerFilter) && (a.totalSales || 0) > 0).length)}</span>
                    </button>

                    <button
                      onClick={() => {
                        const unpaidAccounts = accounts
                          .filter(a => matchesOwnerFilter(a, ownerFilter))
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
                      <span className="bg-amber-500/20 px-1.5 py-0.5 rounded text-[10px] font-black">{accounts.filter(a => matchesOwnerFilter(a, ownerFilter) && ((a.unpaidCount || 0) > 0 || (a.unpaidBalance || 0) > 0)).length}</span>
                    </button>

                    <button
                      onClick={() => {
                        const overdueAccounts = accounts
                          .filter(a => matchesOwnerFilter(a, ownerFilter))
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

                  {/* Main Accounts Container */}
                  <div className="w-full space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <h2 className="text-base font-bold text-white whitespace-nowrap flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                        <span>{isAdminUser ? "All Pipeline Accounts" : "My Pipeline Accounts"}</span>
                        <span className="text-xs font-normal text-neutral-400">({activeAccountsList.length})</span>
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
                    <div className="bg-neutral-900/60 rounded-2xl border border-white/10 overflow-hidden shadow-xl">
                      {activeAccountsList.length === 0 ? (
                        <div className="p-12 text-center">
                          <FiUsers className="mx-auto text-4xl text-neutral-700 mb-3" />
                          <p className="text-neutral-300 font-bold text-base">
                            {accounts.length > 0 ? "No accounts match active filters" : "No accounts loaded"}
                          </p>
                          <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
                            {accounts.length > 0
                              ? `Loaded ${accounts.length} total accounts in memory, but your current active filters are hiding them all.`
                              : "Click below to clear filters or pull live data directly from Zoho CRM."}
                          </p>
                          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                            <button
                              onClick={clearAllFilters}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <FiFilter size={12} />
                              <span>Reset / Clear All Filters</span>
                            </button>
                            <button
                              onClick={() => handleSync()}
                              disabled={loading}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <FiRefreshCw size={12} className={loading ? "animate-spin" : ""} />
                              <span>{loading ? "Syncing..." : "Sync Live CRM Accounts"}</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          {/* Header Filter Bar */}
                          <div className="p-3 bg-neutral-900/90 border-b border-[var(--border)] space-y-2.5">
                            {/* Row 1: Search & Inline Filter Dropdowns */}
                            <div className="flex flex-wrap items-center gap-2">
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
                              <div className="relative flex-1 min-w-[200px]">
                                <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
                                <input 
                                  type="text"
                                  placeholder="Search accounts, cities, contacts..."
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  className="w-full bg-neutral-800/80 border border-[var(--border)] rounded-md pl-8 pr-8 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors"
                                />
                              </div>

                              {/* Inline Rep Filter */}
                              {owners.length > 1 && (
                                <select
                                  value={ownerFilter}
                                  onChange={(e) => setOwnerFilter(e.target.value)}
                                  className="bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-xs text-neutral-200 focus:border-emerald-500 focus:outline-none cursor-pointer max-w-[140px] truncate"
                                >
                                  <option value="All">All Reps</option>
                                  {owners.map(o => (
                                    <option key={o.id} value={o.id}>{o.name || o.email || o.id}</option>
                                  ))}
                                </select>
                              )}

                              {/* Inline Quality Filter */}
                              <select
                                value={qualityFilter}
                                onChange={(e) => setQualityFilter(e.target.value)}
                                className="bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1.5 text-xs text-neutral-200 focus:border-sky-500 focus:outline-none cursor-pointer max-w-[130px]"
                              >
                                  <option value="All">All Qualities</option>
                                  <option value="HOT">🔥 Hot</option>
                                  <option value="WARM">☀️ Warm</option>
                                  <option value="COLD">❄️ Cold</option>
                                  <option value="ON_HOLD">⏸️ On Hold</option>
                                  <option value="DO_NOT_CALL">🚫 DNC</option>
                                  <option value="NEVER_STATUSED">⚪ Never</option>
                                </select>

                                {/* Inline Timezone Filter */}
                                <select
                                  value={timezoneFilter}
                                  onChange={(e) => setTimezoneFilter(e.target.value)}
                                  className="bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1.5 text-xs text-neutral-200 focus:border-sky-500 focus:outline-none cursor-pointer max-w-[120px]"
                                >
                                  <option value="All">All Time Zones</option>
                                  {allTimezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                                </select>

                                {/* Inline Sort By */}
                                <select
                                  value={sortBy}
                                  onChange={(e) => setSortBy(e.target.value as any)}
                                  className="bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1.5 text-xs text-neutral-200 focus:border-emerald-500 focus:outline-none cursor-pointer max-w-[140px]"
                                >
                                  <option value="default">Sort: Default</option>
                                  <option value="ltv_desc">Sort: High LTV ($)</option>
                                  <option value="ltv_asc">Sort: Low LTV ($)</option>
                                  <option value="timezone_asc">Sort: Time Zone</option>
                                  <option value="recentOrders_desc">Sort: Recent Order</option>
                                </select>
                              </div>

                              {/* Row 2: Selected Accounts Action Bar (When items are checked) */}
                              {selectedAccountIds.length > 0 && (
                                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-xs font-bold text-emerald-300">
                                      {selectedAccountIds.length} Account{selectedAccountIds.length !== 1 ? 's' : ''} Selected
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 flex-wrap">
                                    <button 
                                      onClick={() => setShowCampaignModal(true)}
                                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all flex items-center gap-1.5 text-xs cursor-pointer shadow-md"
                                    >
                                      <FiMail size={14} />
                                      <span>Create Message Campaign ({selectedAccountIds.length})</span>
                                    </button>

                                    <button 
                                      onClick={() => setShowCallCampaignModal(true)}
                                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all flex items-center gap-1.5 text-xs cursor-pointer shadow-md"
                                    >
                                      <FiPhone size={14} />
                                      <span>Create Call Campaign ({selectedAccountIds.length})</span>
                                    </button>

                                    <button 
                                      onClick={() => setSelectedAccountIds([])}
                                      className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold transition-colors border border-neutral-700 cursor-pointer"
                                    >
                                      Deselect All
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Active Filters Tag Bar */}
                            {activeFilterCount > 0 && (
                              <div className="px-4 py-2 bg-neutral-900/60 border-b border-white/5 flex items-center gap-1.5 flex-wrap text-xs">
                                <span className="text-[10px] uppercase font-bold text-neutral-500 mr-1 flex items-center gap-1">
                                  <FiFilter size={10} className="text-emerald-400" /> Active Filters:
                                </span>

                                {ownerFilter !== "All" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[11px] font-medium">
                                    Rep: {owners.find(o => o.id === ownerFilter)?.name || ownerFilter}
                                    <button onClick={() => setOwnerFilter("All")} className="hover:text-white ml-0.5">×</button>
                                  </span>
                                )}

                                {qualityFilter !== "All" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 text-[11px] font-medium">
                                    Quality: {qualityFilter}
                                    <button onClick={() => setQualityFilter("All")} className="hover:text-white ml-0.5">×</button>
                                  </span>
                                )}

                                {timezoneFilter !== "All" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[11px] font-medium">
                                    Timezone: {timezoneFilter}
                                    <button onClick={() => setTimezoneFilter("All")} className="hover:text-white ml-0.5">×</button>
                                  </span>
                                )}

                                {statusFilter !== "All" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[11px] font-medium">
                                    Status: {statusFilter}
                                    <button onClick={() => setStatusFilter("All")} className="hover:text-white ml-0.5">×</button>
                                  </span>
                                )}

                                {industryFilter !== "All" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[11px] font-medium">
                                    Industry: {industryFilter}
                                    <button onClick={() => setIndustryFilter("All")} className="hover:text-white ml-0.5">×</button>
                                  </span>
                                )}

                                {ltvMin && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[11px] font-medium">
                                    Min LTV: ${ltvMin}
                                    <button onClick={() => setLtvMin("")} className="hover:text-white ml-0.5">×</button>
                                  </span>
                                )}

                                {ltvMax && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[11px] font-medium">
                                    Max LTV: ${ltvMax}
                                    <button onClick={() => setLtvMax("")} className="hover:text-white ml-0.5">×</button>
                                  </span>
                                )}

                                {productSearch && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-pink-500/10 text-pink-300 border border-pink-500/20 text-[11px] font-medium">
                                    Product: {productSearch}
                                    <button onClick={() => setProductSearch("")} className="hover:text-white ml-0.5">×</button>
                                  </span>
                                )}

                                {missingInfoFilter.noPhone && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[11px] font-medium">
                                    No Phone
                                    <button onClick={() => setMissingInfoFilter(prev => ({ ...prev, noPhone: false }))} className="hover:text-white ml-0.5">×</button>
                                  </span>
                                )}

                                {missingInfoFilter.noEmail && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[11px] font-medium">
                                    No Email
                                    <button onClick={() => setMissingInfoFilter(prev => ({ ...prev, noEmail: false }))} className="hover:text-white ml-0.5">×</button>
                                  </span>
                                )}

                                {missingInfoFilter.noContacts && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[11px] font-medium">
                                    No Contacts
                                    <button onClick={() => setMissingInfoFilter(prev => ({ ...prev, noContacts: false }))} className="hover:text-white ml-0.5">×</button>
                                  </span>
                                )}

                                {showDoNotCall && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[11px] font-medium">
                                    DNC Included
                                    <button onClick={() => setShowDoNotCall(false)} className="hover:text-white ml-0.5">×</button>
                                  </span>
                                )}

                                <button
                                  onClick={clearAllFilters}
                                  className="text-[10px] font-bold text-neutral-400 hover:text-amber-400 underline ml-auto cursor-pointer"
                                >
                                  Clear All
                                </button>
                              </div>
                            )}

                            {/* List Items */}
                            <ul className="divide-y divide-white/5">
                              {accountsPagination.paginatedItems.map(account => {
                                const isSelected = selectedAccountIds.includes(account.id)
                                const ltv = account.totalSales || 0
                                const bestPhoneInfo = getAccountBestPhone(account)
                                const hasPhone = !!bestPhoneInfo.phone
                                const callPhone = bestPhoneInfo.phone
                                const contactsCount = (account.contacts || []).length
                                const isContactsExpanded = expandedContactsAccountIds.includes(account.id)

                                return (
                                  <li key={account.id} className={`hover:bg-white/[0.03] transition-colors ${isSelected ? "bg-emerald-950/20" : ""}`}>
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
                                            subLabel={bestPhoneInfo.label}
                                            className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/40 rounded-xl text-emerald-300 transition-all"
                                          >
                                            <FiPhoneCall size={15} className="shrink-0 text-emerald-400" />
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
                                                      className="px-2 py-1 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-lg text-sky-300 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                                                    >
                                                      <FiMessageSquare size={10} />
                                                      <span>SMS</span>
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
                  </div>

                  {/* Right Column: Tasks List */}
                <div className={`w-full lg:w-96 shrink-0 space-y-4 ${mobileTab === 'tasks' ? 'block' : 'hidden lg:block'}`}>
                  <div className="bg-neutral-900/60 rounded-2xl border border-white/10 p-4 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <FiCheckCircle className="text-emerald-400" />
                        <span>Call Tasks & Follow-ups</span>
                        <span className="text-xs font-normal text-neutral-400">({effortTasks.length})</span>
                      </h2>
                      <button
                        onClick={() => {
                          setEditingTask(null)
                          setTaskSubject("")
                          setTaskDescription("")
                          setTaskPriority("Normal")
                          setTaskStatus("Not Started")
                          setTaskWhatId("")
                          setTaskInvoiceId("")
                          setTaskSalesOrderId("")
                          setTaskQuoteId("")
                          setTaskEstimateId("")
                          setTaskDueDate(new Date().toISOString().split("T")[0])
                          setTaskDueTime("12:00")
                          setShowEditTaskModal(true)
                        }}
                        className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer flex items-center justify-center shrink-0"
                        title="Add New Task"
                      >
                        <FiPlus size={14} />
                      </button>
                    </div>

                    {/* Task Filters tabs */}
                    <div className="grid grid-cols-4 bg-black/40 border border-white/5 p-0.5 rounded-lg text-[10px] font-bold text-center">
                      {["due", "pending", "completed", "all"].map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setTaskFilterTab(tab as any)}
                          className={`py-1 rounded capitalize transition-all ${
                            taskFilterTab === tab 
                              ? "bg-neutral-800 text-white shadow-sm" 
                              : "text-neutral-500 hover:text-neutral-300"
                          }`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    {/* Tasks List */}
                    <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                      {tasksPagination.paginatedItems.length === 0 ? (
                        <div className="p-8 text-center text-xs text-neutral-500 font-medium">
                          No tasks in this category.
                        </div>
                      ) : (
                        tasksPagination.paginatedItems.map((t: any) => {
                          const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "Completed"
                          const associatedAcc = accounts.find(a => a.id === t.accountId || a.zohoId === t.accountId)
                          return (
                            <div key={t.id} className="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-2 hover:border-white/10 transition-colors">
                              <div className="flex items-start gap-2.5">
                                <button
                                  onClick={() => handleCompleteTask(t)}
                                  disabled={t.status === "Completed"}
                                  className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-all ${
                                    t.status === "Completed" 
                                      ? "bg-emerald-500 border-emerald-500 text-white" 
                                      : "border-neutral-600 hover:border-neutral-400"
                                  }`}
                                >
                                  {t.status === "Completed" && <FiCheck size={10} />}
                                </button>
                                
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <h4 className={`text-xs font-bold text-white truncate ${t.status === "Completed" ? "line-through text-neutral-500" : ""}`}>
                                      {t.subject || t.title}
                                    </h4>
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                                      t.priority === "High" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                                      t.priority === "Low" ? "bg-neutral-800 text-neutral-400 border-neutral-700" :
                                      "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                    }`}>
                                      {t.priority}
                                    </span>
                                  </div>

                                  {t.description && (
                                    <p className="text-[10px] text-neutral-400 mt-1 leading-relaxed line-clamp-2">
                                      {t.description}
                                    </p>
                                  )}

                                  {/* Associated entity metadata */}
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-[9px] text-neutral-500 font-medium">
                                    {associatedAcc && (
                                      <Link 
                                        href={`/account?id=${associatedAcc.zohoId}`} 
                                        className="text-emerald-400 hover:underline flex items-center gap-0.5"
                                      >
                                        <FiUser size={10} />
                                        <span className="truncate max-w-[120px]">{associatedAcc.name}</span>
                                      </Link>
                                    )}

                                    {t.dueDate && (
                                      <span className={`flex items-center gap-0.5 ${isOverdue ? "text-red-400 font-bold" : ""}`}>
                                        <FiCalendar size={10} />
                                        {new Date(t.dueDate).toLocaleDateString(undefined, {month: "short", day: "numeric"})}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex justify-end gap-1.5 pt-1.5 border-t border-white/5">
                                <button
                                  onClick={() => handleOpenEditTask(t)}
                                  className="px-2 py-0.5 rounded text-[9px] font-bold bg-neutral-850 hover:bg-neutral-750 text-neutral-300 transition-colors cursor-pointer border border-white/5"
                                >
                                  Edit
                                </button>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>

                    {/* Tasks Pagination */}
                    {filteredTasksList.length > 25 && (
                      <div className="pt-2 border-t border-white/5">
                        <Pagination
                          currentPage={tasksPagination.currentPage}
                          pageSize={tasksPagination.pageSize}
                          totalItems={filteredTasksList.length}
                          onPageChange={tasksPagination.setCurrentPage}
                          onPageSizeChange={tasksPagination.setPageSize}
                        />
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

      {/* Filters Modal */}
      {showFiltersDrawer && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md" onClick={() => setShowFiltersDrawer(false)} />
          <div className="relative w-full max-w-2xl glass-panel border border-neutral-700/80 rounded-2xl p-6 text-white z-[9999] shadow-2xl max-h-[90vh] flex flex-col bg-neutral-900/95">
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-4 border-b border-neutral-800">
              <div>
                <h3 className="font-bold text-base text-white tracking-wide flex items-center gap-2">
                  <FiFilter className="text-emerald-400" size={18} /> Account Filters & Sorting
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">Filter pipeline accounts by rep, quality, location, revenue, and data completeness</p>
              </div>
              <button onClick={() => setShowFiltersDrawer(false)} className="text-neutral-400 hover:text-white p-1.5 rounded-full hover:bg-neutral-800 transition-colors">
                <FiX size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto py-4 space-y-5 pr-1 flex-1">
              
              {/* Section 1: Sales Rep & Account Info */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <FiUser size={13} /> Rep & Basic Info
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-300 mb-1">Sales Rep / Owner</label>
                    <select
                      value={ownerFilter}
                      onChange={e => setOwnerFilter(e.target.value)}
                      className="w-full bg-neutral-800/90 border border-neutral-700 rounded-lg px-2.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="All">All Reps</option>
                      {owners.map(o => (
                        <option key={o.id} value={o.id}>{o.name || o.email || o.id}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-300 mb-1">Account Status</label>
                    <select
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value)}
                      className="w-full bg-neutral-800/90 border border-neutral-700 rounded-lg px-2.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="All">All Statuses</option>
                      {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-300 mb-1">Industry</label>
                    <select
                      value={industryFilter}
                      onChange={e => setIndustryFilter(e.target.value)}
                      className="w-full bg-neutral-800/90 border border-neutral-700 rounded-lg px-2.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="All">All Industries</option>
                      {allIndustries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Quality & Timezone */}
              <div className="space-y-3 pt-2 border-t border-neutral-800/80">
                <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                  <FiClock size={13} /> Rating & Timezone
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-300 mb-1">Account Quality</label>
                    <select
                      value={qualityFilter}
                      onChange={e => setQualityFilter(e.target.value)}
                      className="w-full bg-neutral-800/90 border border-neutral-700 rounded-lg px-2.5 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                    >
                      <option value="All">All Qualities</option>
                      <option value="HOT">🔥 Hot Account</option>
                      <option value="WARM">☀️ Warm Account</option>
                      <option value="COLD">❄️ Cold Account</option>
                      <option value="ON_HOLD">⏸️ On Hold</option>
                      <option value="DO_NOT_CALL">🚫 Do Not Call</option>
                      <option value="NEVER_STATUSED">⚪ Never Statused</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-300 mb-1">Time Zone</label>
                    <select
                      value={timezoneFilter}
                      onChange={e => setTimezoneFilter(e.target.value)}
                      className="w-full bg-neutral-800/90 border border-neutral-700 rounded-lg px-2.5 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                    >
                      <option value="All">All Time Zones</option>
                      {allTimezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-300 mb-1">Sort Accounts By</label>
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as any)}
                      className="w-full bg-neutral-800/90 border border-neutral-700 rounded-lg px-2.5 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                    >
                      <option value="default">Default Order</option>
                      <option value="ltv_desc">Highest Total Sales ($)</option>
                      <option value="ltv_asc">Lowest Total Sales ($)</option>
                      <option value="timezone_asc">Time Zone (A-Z)</option>
                      <option value="recentOrders_desc">Recent Order Date</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 3: Revenue & Purchases */}
              <div className="space-y-3 pt-2 border-t border-neutral-800/80">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <FiDollarSign size={13} /> Revenue & Purchases
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-300 mb-1">Min Total Sales ($)</label>
                    <input
                      type="number"
                      placeholder="e.g. 1000"
                      value={ltvMin}
                      onChange={e => setLtvMin(e.target.value)}
                      className="w-full bg-neutral-800/90 border border-neutral-700 rounded-lg px-2.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-300 mb-1">Max Total Sales ($)</label>
                    <input
                      type="number"
                      placeholder="e.g. 50000"
                      value={ltvMax}
                      onChange={e => setLtvMax(e.target.value)}
                      className="w-full bg-neutral-800/90 border border-neutral-700 rounded-lg px-2.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-300 mb-1">Purchased Year</label>
                    <select
                      value={yearFilter}
                      onChange={e => setYearFilter(e.target.value)}
                      className="w-full bg-neutral-800/90 border border-neutral-700 rounded-lg px-2.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                    >
                      <option value="All">All Years</option>
                      {allYears.map(y => <option key={y} value={String(y)}>{y}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="onlyWithSales"
                    checked={onlyWithSales}
                    onChange={e => setOnlyWithSales(e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-700 text-amber-500 focus:ring-amber-500 bg-neutral-800 cursor-pointer"
                  />
                  <label htmlFor="onlyWithSales" className="text-xs text-neutral-300 font-medium cursor-pointer">
                    Only show accounts with existing sales history ($0+)
                  </label>
                </div>
              </div>

              {/* Section 4: Purchased Product Search & Data Quality */}
              <div className="space-y-3 pt-2 border-t border-neutral-800/80">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                  <FiAlertCircle size={13} /> Product & Data Quality Filters
                </h4>
                
                <div>
                  <label className="block text-[11px] font-bold text-neutral-300 mb-1">Purchased Product Name / SKU Search</label>
                  <input
                    type="text"
                    placeholder="e.g. 14 inch Diamond Blade, CW-14..."
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    className="w-full bg-neutral-800/90 border border-neutral-700 rounded-lg px-2.5 py-2 text-xs text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={missingInfoFilter.noPhone}
                      onChange={e => setMissingInfoFilter(prev => ({ ...prev, noPhone: e.target.checked }))}
                      className="w-3.5 h-3.5 rounded border-neutral-700 text-purple-500 bg-neutral-800 cursor-pointer"
                    />
                    <span>Missing Phone Number</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={missingInfoFilter.noEmail}
                      onChange={e => setMissingInfoFilter(prev => ({ ...prev, noEmail: e.target.checked }))}
                      className="w-3.5 h-3.5 rounded border-neutral-700 text-purple-500 bg-neutral-800 cursor-pointer"
                    />
                    <span>Missing Email Address</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={missingInfoFilter.noContacts}
                      onChange={e => setMissingInfoFilter(prev => ({ ...prev, noContacts: e.target.checked }))}
                      className="w-3.5 h-3.5 rounded border-neutral-700 text-purple-500 bg-neutral-800 cursor-pointer"
                    />
                    <span>No Contacts Linked</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDoNotCall}
                      onChange={e => setShowDoNotCall(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-neutral-700 text-rose-500 bg-neutral-800 cursor-pointer"
                    />
                    <span>Include "Do Not Call" Accounts</span>
                  </label>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-neutral-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold transition-all border border-neutral-700 cursor-pointer"
              >
                Reset All Filters
              </button>

              <button
                type="button"
                onClick={() => setShowFiltersDrawer(false)}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-950/50 flex items-center gap-1.5 cursor-pointer"
              >
                <span>View {filteredAccounts.length} Matching Account{filteredAccounts.length !== 1 ? 's' : ''}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Call Campaign Modal */}
      {showCallCampaignModal && createPortal(
        <SalesCallCampaignModal
          accounts={accounts.filter(a => selectedAccountIds.includes(a.id))}
          onClose={() => setShowCallCampaignModal(false)}
          onRefresh={() => fetchLocalData(1, false)}
        />,
        document.body
      )}

    </>
  )
}
