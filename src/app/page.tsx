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
import { usePreferences } from "@/components/PreferencesProvider"
import { SalesBoard } from "@/components/SalesBoard"
import { FiSearch, FiClock, FiDollarSign, FiUsers, FiTrendingUp, FiUser, FiChevronRight, FiCheckCircle, FiFileText, FiPhoneCall, FiMail, FiMessageSquare, FiMenu, FiX, FiRefreshCw, FiFilter, FiPlus, FiEdit, FiCalendar, FiCheck, FiUploadCloud, FiImage, FiTrash2, FiPaperclip, FiAlertCircle, FiDatabase, FiUserPlus, FiCommand, FiTarget } from "react-icons/fi"

function formatLastCalled(dateStr: string | null) {
  if (!dateStr) return "Never called"
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return "Called today"
  if (diffDays === 1) return "Called yesterday"
  return `Called ${diffDays} days ago`
}

export default function Dashboard() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const { preferences, updatePreferences } = usePreferences()
  const router = useRouter()

  const [accounts, setAccounts] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  const [industryFilter, setIndustryFilter] = useState("All")
  const [mobileTab, setMobileTab] = useState<"accounts" | "tasks">("accounts")
  const [menuOpen, setMenuOpen] = useState(false)
  const [drillTitle, setDrillTitle] = useState("")
  const [drillItems, setDrillItems] = useState<any[] | null>(null)
  const [drillType, setDrillType] = useState<"invoices" | "deals" | "accounts" | null>(null)
  const [effort, setEffort] = useState<"sales" | "call_list" | "cold_call" | "dashboard">("sales")
  const [ownerFilter, setOwnerFilter] = useState("All")
  const [timezoneFilter, setTimezoneFilter] = useState("All")
  const [yearFilter, setYearFilter] = useState("All")
  const [sortBy, setSortBy] = useState<"default" | "timezone_asc" | "timezone_desc" | "recentOrders_desc" | "recentOrders_asc">("default")
  const [onlyWithSales, setOnlyWithSales] = useState(false)
  const [showDoNotCall, setShowDoNotCall] = useState(false)
  const [ltvMin, setLtvMin] = useState("")
  const [ltvMax, setLtvMax] = useState("")
  const [qualityFilter, setQualityFilter] = useState("All")
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false)
  const [repsList, setRepsList] = useState<any[]>([])
  const [accountsPage, setAccountsPage] = useState(1)
  const [accountsHasMore, setAccountsHasMore] = useState(false)
  const [accountsTotalCount, setAccountsTotalCount] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

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
  const [transactions, setTransactions] = useState<any[]>([])
  const [selectedTransaction, setSelectedTransaction] = useState("")
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [taskSaving, setTaskSaving] = useState(false)
  const [showEditTaskModal, setShowEditTaskModal] = useState(false)

  const [viewingInvoice, setViewingInvoice] = useState<any | null>(null)
  const [viewingDocType, setViewingDocType] = useState<'Quote' | 'SalesOrder' | 'Invoice'>('Invoice')
  const [fullInvoiceDetails, setFullInvoiceDetails] = useState<any | null>(null)
  const [isLoadingInvoiceDetails, setIsLoadingInvoiceDetails] = useState(false)

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
  const [campaignSending, setCampaignSending] = useState(false)
  const [campaignError, setCampaignError] = useState("")
  const [campaignSuccess, setCampaignSuccess] = useState("")
  const [campaignProgress, setCampaignProgress] = useState(0)
  const [campaignTotal, setCampaignTotal] = useState(0)
  const cancelCampaignRef = useRef(false)
  const [zohoNumbers, setZohoNumbers] = useState<any[]>([])
  const [selectedZohoNumber, setSelectedZohoNumber] = useState("")
  const [campaignTemplates, setCampaignTemplates] = useState<any[]>([])
  const [dbUser, setDbUser] = useState<any>(null)
  const [mediaAssets, setMediaAssets] = useState<any[]>([])
  const [loadingMedia, setLoadingMedia] = useState(false)
  const [showAssetSelector, setShowAssetSelector] = useState(false)

  // AI Magic States
  const [aiPrompt, setAiPrompt] = useState("")
  const [generatingAiText, setGeneratingAiText] = useState(false)
  const [generatingAiImage, setGeneratingAiImage] = useState(false)

  // --- Persistent Filters: Load from preferences on mount ---
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  useEffect(() => {
    if (!preferences || prefsLoaded) return
    // effort tab always defaults to "sales" (Sales Pipeline) — not restored from prefs
    if (preferences.ownerFilter) setOwnerFilter(preferences.ownerFilter)
    if (preferences.sortBy) setSortBy(preferences.sortBy)
    if (preferences.searchQuery) setSearchQuery(preferences.searchQuery)
    if (preferences.timezoneFilter) setTimezoneFilter(preferences.timezoneFilter)
    if (preferences.qualityFilter) setQualityFilter(preferences.qualityFilter)
    if (preferences.yearFilter) setYearFilter(preferences.yearFilter)
    if (preferences.statusFilter) setStatusFilter(preferences.statusFilter)
    if (preferences.industryFilter) setIndustryFilter(preferences.industryFilter)
    if (preferences.onlyWithSales !== undefined) setOnlyWithSales(preferences.onlyWithSales)
    if (preferences.showDoNotCall !== undefined) setShowDoNotCall(preferences.showDoNotCall)
    if (preferences.taskFilterTab) setTaskFilterTab(preferences.taskFilterTab)
    if (preferences.taskTypeFilter) setTaskTypeFilter(preferences.taskTypeFilter)
    setPrefsLoaded(true)
  }, [preferences])

  // --- Validate ownerFilter after accounts load (prevents stale filter hiding all accounts) ---
  useEffect(() => {
    if (!accounts.length || ownerFilter === "All") return
    // Build the set of valid owner IDs from loaded accounts
    const validOwnerIds = new Set(accounts.map((a: any) => a.ownerId).filter(Boolean))
    // If the saved ownerFilter ID doesn't correspond to any loaded account, reset it
    if (!validOwnerIds.has(ownerFilter)) {
      setOwnerFilter("All")
    }
  }, [accounts])



  // --- Persistent Filters: Save to preferences on change ---
  useEffect(() => {
    if (!prefsLoaded) return
    updatePreferences({
      ownerFilter, sortBy, searchQuery, timezoneFilter,
      qualityFilter, yearFilter, statusFilter, industryFilter,
      onlyWithSales, showDoNotCall, taskFilterTab, taskTypeFilter
    })
  }, [ownerFilter, sortBy, searchQuery, timezoneFilter, qualityFilter, yearFilter, statusFilter, industryFilter, onlyWithSales, showDoNotCall, taskFilterTab, taskTypeFilter, prefsLoaded])

  // --- Task Reminder Polling: Check every 60s ---
  useEffect(() => {
    const checkReminders = async () => {
      try {
        const res = await fetch('/api/check-reminders')
        const data = await res.json()
        if (data.success && data.processed > 0) {
          // Refresh tasks to show updated reminder states
          const taskRes = await fetch(`/api/get-tasks?ownerId=${currentUser?.id}`)
          const taskData = await taskRes.json()
          if (taskData.success) setTasks(taskData.tasks)
        }
      } catch (e) {
        // Silent fail for polling
      }
    }
    checkReminders()
    const interval = setInterval(checkReminders, 60000)
    return () => clearInterval(interval)
  }, [currentUser?.id])

  // Fetch Media Assets
  const fetchMediaAssets = async () => {
    setLoadingMedia(true)
    try {
      const res = await fetch("/api/get-media-assets")
      const data = await res.json()
      if (data.success && Array.isArray(data.assets)) {
        setMediaAssets(data.assets)
      }
    } catch (e) {
      console.error("Failed to load media assets", e)
    } finally {
      setLoadingMedia(false)
    }
  }

  // Handle Image upload dynamically via FileReader with compression
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type.startsWith("image/")) {
      const reader = new FileReader()
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          const img = new Image()
          img.onload = () => {
            const canvas = document.createElement("canvas")
            let width = img.width
            let height = img.height
            const maxDim = 800

            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width)
                width = maxDim
              } else {
                width = Math.round((width * maxDim) / height)
                height = maxDim
              }
            }

            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext("2d")
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height)
              const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7)
              setCampaignImageUrl(compressedBase64)
            } else {
              setCampaignImageUrl(reader.result as string)
            }
          }
          img.src = reader.result
        }
      }
      reader.readAsDataURL(file)
    } else {
      // For PDFs or other files, just check size (max 3MB to avoid 413 limits)
      if (file.size > 3 * 1024 * 1024) {
        alert("File is too large. Please select a file under 3MB.")
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          setCampaignImageUrl(reader.result)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const handleClearImage = () => {
    setCampaignImageUrl("")
  }

  const handleGenerateAiText = async () => {
    if (!aiPrompt) return
    setGeneratingAiText(true)
    setCampaignError("")
    try {
      const res = await fetch("/api/generate-campaign-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, type: "text", channel: campaignChannel })
      })
      const data = await res.json()
      if (data.success) {
        setCampaignText(data.result)
      } else {
        setCampaignError(data.error || "Failed to generate text.")
      }
    } catch (err: any) {
      setCampaignError(err.message || "AI Error")
    } finally {
      setGeneratingAiText(false)
    }
  }

  const handleGenerateAiImage = async () => {
    if (!aiPrompt) return
    setGeneratingAiImage(true)
    setCampaignError("")
    try {
      const res = await fetch("/api/generate-campaign-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, type: "image", channel: campaignChannel })
      })
      const data = await res.json()
      if (data.success) {
        setCampaignImageUrl(data.result)
      } else {
        setCampaignError(data.error || "Failed to generate image.")
      }
    } catch (err: any) {
      setCampaignError(err.message || "AI Error")
    } finally {
      setGeneratingAiImage(false)
    }
  }

  const handleSendCampaign = async (e: React.FormEvent) => {
    e.preventDefault()
    setCampaignSending(true)
    setCampaignError("")
    setCampaignSuccess("")
    setCampaignTotal(selectedAccountIds.length)
    setCampaignProgress(0)
    cancelCampaignRef.current = false

    try {
      const CHUNK_SIZE = 2
      const chunks: string[][] = []
      for (let i = 0; i < selectedAccountIds.length; i += CHUNK_SIZE) {
        chunks.push(selectedAccountIds.slice(i, i + CHUNK_SIZE))
      }

      let blastId: string | null = null
      let totalSuccess = 0
      let totalFailed = 0
      let i = 0

      for (const chunk of chunks) {
        if (cancelCampaignRef.current) {
          setCampaignError("Campaign sending was cancelled. Sent so far: " + totalSuccess)
          break
        }

        const fetchRes = await fetch("/api/send-campaign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blastId,
            accountIds: chunk,
            channel: campaignChannel,
            text: campaignText,
            imageUrl: campaignImageUrl,
            campaignName: campaignName,
            fromNumber: selectedZohoNumber,
            userId: currentUser?.id,
            userEmail: currentUser?.email
          })
        })

        const textRes = await fetchRes.text()
        let data: any = {}
        try {
          data = JSON.parse(textRes)
        } catch (e) {
          console.error("Non-JSON response from server:", textRes)
          throw new Error(`Server Error (${fetchRes.status} ${fetchRes.statusText}). If you attached a large image, it might be too big (limit is typically 1MB-4MB).`)
        }
        
        if (!fetchRes.ok || !data.success) {
          if (i === 0) throw new Error(data.message || `Failed to start campaign. (${fetchRes.status})`)
          console.error("Chunk failed:", data.message)
        } else {
          if (!blastId && data.blastId) {
            blastId = data.blastId
          }
          totalSuccess += data.count || 0
          totalFailed += data.failedCount || 0
        }
        
        i++
        setCampaignProgress(Math.min(selectedAccountIds.length, i * CHUNK_SIZE))
      }

      setCampaignSuccess(`Campaign finished! Sent: ${totalSuccess}, Failed: ${totalFailed}`)
      setTimeout(() => {
        setSelectedAccountIds([])
        setShowCampaignModal(false)
        setCampaignName("")
        setCampaignText("")
        setCampaignImageUrl("")
        setCampaignSuccess("")
        setCampaignProgress(0)
        setCampaignTotal(0)
      }, 3000)
    } catch (err: any) {
      setCampaignError(err.message || "An error occurred while sending campaign.")
    } finally {
      setCampaignSending(false)
    }
  }

  // Auto-fetch media assets and zoho numbers when campaign modal opens
  useEffect(() => {
    if (showCampaignModal) {
      fetchMediaAssets()
      Promise.all([
        fetch('/api/manage-zoho-numbers').then(r => r.json()),
        fetch('/api/admin/campaigns').then(r => r.json()),
        currentUser?.id ? fetch('/api/admin/users').then(r => r.json()) : Promise.resolve(null)
      ]).then(([numsData, campsData, usersData]) => {
        if (usersData?.success) {
          const user = usersData.users.find((u: any) => u.email === currentUser?.email || u.id === currentUser?.id)
          setDbUser(user)
        }
        
        if (campsData.success) {
          setCampaignTemplates(campsData.templates || [])
        }

        if (numsData.success && numsData.numbers) {
          // Filter numbers by assignment
          let availableNums = numsData.numbers
          const normalizedRole = currentUser?.role?.toLowerCase() || ""
          const isAdminUser = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("manager") || normalizedRole.includes("collections")

          if (!isAdminUser) {
             availableNums = numsData.numbers.filter((n: any) => 
               n.isDefault || (n.assignedUserIds && n.assignedUserIds.includes(currentUser?.id))
             )
          }
          setZohoNumbers(availableNums)
          const defaultNum = availableNums.find((n: any) => n.isDefault) || availableNums[0]
          if (defaultNum) setSelectedZohoNumber(defaultNum.number)
        }
      }).catch(console.error)
    }
  }, [showCampaignModal, currentUser])

  const fetchLocalData = async (pageNum = 1, append = false) => {
    if (!currentUser) return
    try {
      const query = currentUser.id && !currentUser.id.includes("@")
        ? `zohoId=${currentUser.id}`
        : `email=${currentUser.email}`

      const roleQuery = currentUser.role ? `&role=${encodeURIComponent(currentUser.role)}` : ""
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""
      const hiddenParam = preferences.showHiddenReps ? "&includeHidden=true" : ""
      const accountsQuery = `${query}${roleQuery}&page=${pageNum}${searchParam}${hiddenParam}&includeDocs=true`

      const ts = Date.now()
      const [resAccounts, resTasks] = await Promise.all([
        fetch(`/api/get-accounts?${accountsQuery}&_t=${ts}`),
        pageNum === 1 ? fetch(`/api/get-tasks?${query}${roleQuery}&_t=${ts}`) : Promise.resolve(null),
      ])
      const dataAccounts = await resAccounts.json()
      const dataTasks = resTasks ? await resTasks.json() : null

      if (dataAccounts.success) {
        if (append) {
          setAccounts(prev => {
            const existingIds = new Set(prev.map(a => a.id))
            const newAccounts = dataAccounts.accounts.filter((a: any) => !existingIds.has(a.id))
            return [...prev, ...newAccounts]
          })
        } else {
          setAccounts(dataAccounts.accounts)
        }
        if (dataAccounts.reps) setRepsList(dataAccounts.reps)
        if (dataAccounts.pagination) {
          setAccountsHasMore(dataAccounts.pagination.hasMore)
          setAccountsTotalCount(dataAccounts.pagination.totalCount)
          setAccountsPage(pageNum)
          // On first page, kick off background load of all remaining pages
          if (pageNum === 1 && dataAccounts.pagination.hasMore) {
            autoLoadAllAccounts(dataAccounts.pagination.totalCount, dataAccounts.accounts.length)
          }
        }
      } else {
        setApiError(dataAccounts.error || dataAccounts.message)
      }
      if (dataTasks?.success) setTasks(dataTasks.tasks)
    } catch (err: any) {
      setApiError(err.message)
    }
  }

  // After first page loads, automatically fetch all remaining pages in background
  const autoLoadRef = useRef(0)
  const autoLoadAllAccounts = async (totalCount: number, firstPageSize: number) => {
    const loadId = ++autoLoadRef.current
    const pageSize = firstPageSize
    const totalPages = Math.ceil(totalCount / pageSize)
    if (totalPages <= 1) return
    for (let pg = 2; pg <= totalPages; pg++) {
      if (autoLoadRef.current !== loadId) return // cancelled by newer load
      await fetchLocalData(pg, true)
    }
  }

  useEffect(() => {
    if (!isInitialized) return
    if (!currentUser) {
      router.push("/login")
      return
    }
    // Cancel any in-flight auto-load from a previous render
    autoLoadRef.current++
    const fetchData = async () => {
      setLoading(true)
      await fetchLocalData()
      setLoading(false)
    }
    fetchData()

    // Check query params for tab
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const tab = urlParams.get('tab')
      if (tab === 'dashboard') {
        setEffort('dashboard')
      }
    }
  }, [isInitialized, currentUser, router])

  // Fetch dbUser permissions on load
  useEffect(() => {
    if (!currentUser?.email && !currentUser?.id) return
    fetch('/api/admin/users').then(r => r.json()).then(data => {
      if (data?.success) {
        const user = data.users.find((u: any) => u.email === currentUser?.email || u.id === currentUser?.id)
        if (user) setDbUser(user)
      }
    }).catch(() => {})
  }, [currentUser?.email, currentUser?.id])

  useEffect(() => {
    if (viewingInvoice) {
      if (viewingInvoice.items?.custom_fields) {
        setFullInvoiceDetails({ custom_fields: viewingInvoice.items.custom_fields, ...viewingInvoice })
        setIsLoadingInvoiceDetails(false)
        return
      }

      const fetchInvoiceDetails = async () => {
        setIsLoadingInvoiceDetails(true)
        setFullInvoiceDetails(null)
        try {
          const res = await fetch(`/api/get-invoice-details?targetId=${viewingInvoice.zohoId || viewingInvoice.id}`)
          const data = await res.json()
          if (data.success && data.invoice) {
            setFullInvoiceDetails(data.invoice)
          } else {
            console.error("Failed to load invoice details", data.error)
          }
        } catch (error) {
          console.error("Error fetching invoice details:", error)
        } finally {
          setIsLoadingInvoiceDetails(false)
        }
      }
      fetchInvoiceDetails()
    } else {
      setFullInvoiceDetails(null)
      setIsLoadingInvoiceDetails(false)
    }
  }, [viewingInvoice?.id])

  const handleEffortChange = (val: "sales" | "call_list" | "cold_call" | "dashboard") => {
    setEffort(val)
  }

  const [syncing, setSyncing] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    try {
      const query = currentUser.id && !currentUser.id.includes("@")
        ? `zohoId=${currentUser.id}`
        : `email=${currentUser.email}`
      
      const roleQuery = currentUser.role ? `&role=${encodeURIComponent(currentUser.role)}` : ""
      const accountsQuery = `${query}${roleQuery}`

      const [resAccounts, resTasks] = await Promise.all([
        fetch(`/api/get-accounts?${accountsQuery}&refresh=true&includeDocs=true`),
        fetch(`/api/get-tasks?${accountsQuery}&refresh=true`),
      ])
      const dataAccounts = await resAccounts.json()
      const dataTasks = await resTasks.json()

      if (dataAccounts.success) {
        setAccounts(dataAccounts.accounts)
        if (dataAccounts.reps) setRepsList(dataAccounts.reps)
      } else {
        setApiError(dataAccounts.error || dataAccounts.message)
      }
      if (dataTasks.success) setTasks(dataTasks.tasks)
    } catch (err: any) {
      setApiError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  const refreshTasks = async () => {
    if (!currentUser) return
    try {
      const query = currentUser.id && !currentUser.id.includes("@")
        ? `zohoId=${currentUser.id}`
        : `email=${currentUser.email}`
      const roleQuery = currentUser.role ? `&role=${encodeURIComponent(currentUser.role)}` : ""
      const accountsQuery = `${query}${roleQuery}`
      const res = await fetch(`/api/get-tasks?${accountsQuery}`)
      const data = await res.json()
      if (data.success) {
        setTasks(data.tasks)
      }
    } catch (err) {
      console.error("Failed to refresh tasks:", err)
    }
  }

  const handleCompleteTask = async (task: any) => {
    try {
      const res = await fetch("/api/update-task", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, zohoId: task.zohoId, status: "Completed" })
      })
      if (res.ok) {
        await refreshTasks()
      } else {
        const data = await res.json()
        setApiError(data.error || data.message || "Failed to complete task")
      }
    } catch (err: any) {
      setApiError(err.message)
    }
  }

  const resetTaskForm = () => {
    setTaskSubject("")
    setTaskDescription("")
    setTaskPriority("Normal")
    setTaskDueDate("")
    setTaskDueTime("")
    setTaskOwnerId(currentUser?.id || "")
    setTaskStatus("Not Started")
    setTaskWhatId("")
    setTaskInvoiceId("")
    setTaskSalesOrderId("")
    setTaskQuoteId("")
    setTaskEstimateId("")
    setSelectedTransaction("")
  }


  useEffect(() => {
    if (!taskWhatId) {
      setTransactions([])
      setSelectedTransaction("")
      return
    }
    const fetchTransactions = async () => {
      setLoadingTransactions(true)
      try {
        const res = await fetch(`/api/get-account-details?id=${encodeURIComponent(taskWhatId)}`)
        const data = await res.json()
        if (data.success && data.account) {
          const txs: any[] = []
          
          if (data.account.invoices) {
            data.account.invoices.forEach((inv: any) => {
              txs.push({
                id: inv.id,
                zohoId: inv.zohoId,
                type: "Invoice",
                label: `Invoice: ${inv.zohoId || inv.id} ($${(inv.amount || 0).toLocaleString()})`
              })
            })
          }

          if (data.account.salesOrders) {
            data.account.salesOrders.forEach((so: any) => {
              txs.push({
                id: so.id,
                zohoId: so.zohoId || so.id,
                type: "SalesOrder",
                label: `Sales Order: SO-${so.id} ($${(so.amount || 0).toLocaleString()})`
              })
            })
          }

          if (data.account.quotes) {
            data.account.quotes.forEach((q: any) => {
              txs.push({
                id: q.id,
                zohoId: q.zohoId || q.id,
                type: "Quote",
                label: `Quote: Q-${q.id} ($${(q.amount || 0).toLocaleString()})`
              })
            })
          }

          setTransactions(txs)
        } else {
          setTransactions([])
        }
      } catch (e) {
        console.error("Error fetching transactions", e)
      } finally {
        setLoadingTransactions(false)
      }
    }
    fetchTransactions()
  }, [taskWhatId])

  const handleTransactionChange = (val: string) => {
    setSelectedTransaction(val)
    if (!val) {
      setTaskInvoiceId("")
      setTaskSalesOrderId("")
      setTaskQuoteId("")
      setTaskEstimateId("")
      return
    }
    const tx = transactions.find(t => (t.id === val || t.zohoId === val))
    if (!tx) return
    
    setTaskInvoiceId("")
    setTaskSalesOrderId("")
    setTaskQuoteId("")
    setTaskEstimateId("")

    if (tx.type === "Invoice") setTaskInvoiceId(tx.id)
    if (tx.type === "SalesOrder") setTaskSalesOrderId(tx.id)
    if (tx.type === "Quote") setTaskQuoteId(tx.id)
  }

  const handleOpenEditTask = (task: any) => {
    setEditingTask(task)
    setTaskSubject(task.title || "")
    setTaskDescription(task.description || "")
    setTaskPriority(task.priority ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1).toLowerCase() : "Normal")
    setTaskDueDate(task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : "")
    const dueDt = task.dueDate ? new Date(task.dueDate) : null
    setTaskDueTime(dueDt && (dueDt.getUTCHours() !== 0 || dueDt.getUTCMinutes() !== 0) ? `${String(dueDt.getHours()).padStart(2,'0')}:${String(dueDt.getMinutes()).padStart(2,'0')}` : "")
    setTaskOwnerId(task.ownerId || currentUser?.id || "")
    setTaskStatus(task.status || "Not Started")
    
    // Convert local accountId back to Zoho ID for the dropdown if possible
    let wId = task.accountId || task.dealId || ""
    if (task.accountId) {
      const acct = accounts.find(a => a.id === task.accountId)
      if (acct) wId = acct.zohoId
    }
    setTaskWhatId(wId)

    setTaskInvoiceId(task.invoiceId || "")
    setTaskSalesOrderId(task.salesOrderId || "")
    setTaskQuoteId(task.quoteId || "")
    setTaskEstimateId(task.estimateId || "")
    
    // Reminder fields
    if (task.reminderAt) {
      const rd = new Date(task.reminderAt)
      setReminderDate(rd.toISOString().split('T')[0])
      setReminderTime(`${String(rd.getHours()).padStart(2,'0')}:${String(rd.getMinutes()).padStart(2,'0')}`)
    } else {
      setReminderDate("")
      setReminderTime("")
    }
    setReminderMethods(task.reminderMethod ? task.reminderMethod.split(',') : [])
    
    if (task.invoiceId) setSelectedTransaction(task.invoiceId)
    else if (task.salesOrderId) setSelectedTransaction(task.salesOrderId)
    else if (task.quoteId) setSelectedTransaction(task.quoteId)
    else if (task.estimateId) setSelectedTransaction(task.estimateId)
    else setSelectedTransaction("")

    setShowEditTaskModal(true)
  }

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTask || !taskSubject.trim()) return
    setTaskSaving(true)
    try {
      const res = await fetch("/api/update-task", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: editingTask.id,
          zohoId: editingTask.zohoId,
          subject: taskSubject,
          description: taskDescription,
          priority: taskPriority,
          dueDate: taskDueDate ? (taskDueTime ? `${taskDueDate}T${taskDueTime}` : taskDueDate) : null,
          ownerId: taskOwnerId,
          status: taskStatus,
          whatId: taskWhatId || null,
          invoiceId: taskInvoiceId || null,
          salesOrderId: taskSalesOrderId || null,
          quoteId: taskQuoteId || null,
          estimateId: taskEstimateId || null,
          reminderAt: reminderDate ? (reminderTime ? `${reminderDate}T${reminderTime}` : `${reminderDate}T09:00`) : null,
          reminderMethod: reminderMethods.length > 0 ? reminderMethods.join(',') : null,
          reminderFired: false
        })
      })
      const data = await res.json()
      if (data.success) {
        setShowEditTaskModal(false)
        setEditingTask(null)
        resetTaskForm()
        await refreshTasks()
      } else {
        alert("Failed to update task: " + data.message)
      }
    } catch (err: any) {
      alert("Error updating task: " + err.message)
    } finally {
      setTaskSaving(false)
    }
  }

  // ── Separation Logic ──
  const normalizedRole = currentUser?.role?.toLowerCase() || ""
  const isAdminUser = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("collections") || normalizedRole.includes("manager")

  const owners = Array.from(
    new Map(
      accounts
        .map(a => a.owner)
        .filter(Boolean)
        .map((o: any) => [o.id, o])
    ).values()
  ) as any[]

  const activeAccounts = accounts.filter(a => showDoNotCall || a.quality !== "DO_NOT_CALL")
  const reactivationAccounts: any[] = []

  const filteredByOwnerActive = activeAccounts.filter(a => ownerFilter === "All" || a.ownerId === ownerFilter)
  const filteredByOwnerReactivation: any[] = []

  // Prioritize Call List (excluding DO NOT CALL, limit to top 50, sort by quality then lastCalledAt oldest/nulls first)
  const qualityScores: Record<string, number> = {
    HOT: 4,
    NEVER_STATUSED: 3,
    WARM: 3,
    COLD: 2,
    ON_HOLD: 1,
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const coldCallAccounts = accounts
    .filter(a => a.quality !== "DO_NOT_CALL" && (ownerFilter === "All" || a.ownerId === ownerFilter) && (!a.totalSales || a.totalSales === 0) && (!a._count?.quotes || a._count.quotes === 0) && (!a._count?.salesOrders || a._count.salesOrders === 0) && (!a.lastCalledAt || new Date(a.lastCalledAt) < todayStart))
    .sort((a, b) => {
      const scoreA = qualityScores[a.quality] || 0
      const scoreB = qualityScores[b.quality] || 0
      if (scoreA !== scoreB) return scoreB - scoreA
      
      if (!a.lastCalledAt && !b.lastCalledAt) return 0
      if (!a.lastCalledAt) return -1
      if (!b.lastCalledAt) return 1
      return new Date(a.lastCalledAt).getTime() - new Date(b.lastCalledAt).getTime()
    })
    .slice(0, 50)

  const callListAccounts = accounts
    .filter(a => a.quality !== "DO_NOT_CALL" && (ownerFilter === "All" || a.ownerId === ownerFilter) && (a.totalSales && a.totalSales > 0) && (!a.lastCalledAt || new Date(a.lastCalledAt) < todayStart))
    .sort((a, b) => {
      const scoreA = qualityScores[a.quality] || 0
      const scoreB = qualityScores[b.quality] || 0
      if (scoreA !== scoreB) return scoreB - scoreA
      
      // Tier by sales volume to bubble up higher value customers within the same quality
      const salesA = a.totalSales || 0
      const salesB = b.totalSales || 0
      const tierA = Math.floor(salesA / 5000)
      const tierB = Math.floor(salesB / 5000)
      if (tierA !== tierB) return tierB - tierA

      // If quality and sales tier are same, prioritize never called, then oldest called
      if (!a.lastCalledAt && !b.lastCalledAt) return 0
      if (!a.lastCalledAt) return -1
      if (!b.lastCalledAt) return 1
      return new Date(a.lastCalledAt).getTime() - new Date(b.lastCalledAt).getTime()
    })
    .slice(0, 50)

  let effortAccounts = effort === "sales"
    ? filteredByOwnerActive
    : effort === "cold_call"
      ? coldCallAccounts
      : callListAccounts

  if (sortBy === "timezone_asc") {
    effortAccounts = [...effortAccounts].sort((a, b) => (a.timeZone || "ZZZ").localeCompare(b.timeZone || "ZZZ"))
  } else if (sortBy === "timezone_desc") {
    effortAccounts = [...effortAccounts].sort((a, b) => (b.timeZone || "ZZZ").localeCompare(a.timeZone || "ZZZ"))
  } else if (sortBy === "recentOrders_desc" || sortBy === "recentOrders_asc") {
    effortAccounts = [...effortAccounts].sort((a, b) => {
      const getLatestDate = (acc: any) => {
        let maxDate = acc.lastPurchaseAt ? new Date(acc.lastPurchaseAt).getTime() : 0
        if (acc.invoices && Array.isArray(acc.invoices)) {
          acc.invoices.forEach((inv: any) => {
            const dStr = (inv.items as any)?.paymentDate || inv.issueDate
            if (dStr) {
              const t = new Date(dStr).getTime()
              if (t > maxDate) maxDate = t
            }
          })
        }
        return maxDate
      }
      const diff = getLatestDate(b) - getLatestDate(a)
      return sortBy === "recentOrders_desc" ? diff : -diff
    })
  }

  const effortTasks = tasks
    .filter(t => ownerFilter === "All" || t.ownerId === ownerFilter)

  // Compute LTV for Sales Pipeline (filtered by owner)
  const activeLtv = filteredByOwnerActive.reduce((sum, a) => sum + (a.totalSales || 0), 0)

  // Compute Profit for Sales Pipeline (filtered by owner)
  const activeProfit = filteredByOwnerActive.reduce((sum, a) => sum + (a.totalProfit || 0), 0)

  // Compute Overdue Balance for all Accounts (filtered by owner)
  const totalOverdueBalance = filteredByOwnerActive.reduce((sum, a) => sum + (a.overdueBalance || 0), 0)

  const allStatuses = Array.from(new Set(filteredByOwnerActive.map(a => a.status).filter(Boolean))) as string[]
  const allIndustries = Array.from(new Set(filteredByOwnerActive.map(a => a.industry).filter(Boolean))) as string[]
  const allTimezones = Array.from(new Set(filteredByOwnerActive.map(a => a.timeZone).filter(Boolean))) as string[]
  const allYears = Array.from(new Set(filteredByOwnerActive.map(a => a.lastPurchaseAt ? new Date(a.lastPurchaseAt).getFullYear().toString() : null).filter(Boolean))) as string[]
  allYears.sort((a, b) => parseInt(b) - parseInt(a))

  const filteredAccounts = effortAccounts.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (a.zohoId && a.zohoId.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesStatus = statusFilter === "All" || a.status === statusFilter
    const matchesIndustry = industryFilter === "All" || a.industry === industryFilter
    const matchesTimezone = timezoneFilter === "All" || a.timeZone === timezoneFilter
    const matchesQuality = qualityFilter === "All" || a.quality === qualityFilter
    const year = a.lastPurchaseAt ? new Date(a.lastPurchaseAt).getFullYear().toString() : "Unknown"
    const matchesYear = yearFilter === "All" || year === yearFilter
    
    const ltv = a.totalSales || 0
    const matchesSalesFilter = !onlyWithSales || ltv > 0
    const matchesLtvMin = !ltvMin || ltv >= parseFloat(ltvMin)
    const matchesLtvMax = !ltvMax || ltv <= parseFloat(ltvMax)

    return matchesSearch && matchesStatus && matchesIndustry && matchesTimezone && matchesQuality && matchesYear && matchesSalesFilter && matchesLtvMin && matchesLtvMax
  })

  const filteredTasksList = tasks.filter(task => {
    if (taskTypeFilter !== "All" && task.type !== taskTypeFilter) return false

    if (taskFilterTab === "completed") {
      return task.status === "Completed"
    } else if (taskFilterTab === "due") {
      if (task.status === "Completed") return false
      if (!task.dueDate) return false
      const today = new Date()
      today.setHours(23, 59, 59, 999)
      return new Date(task.dueDate) <= today
    } else if (taskFilterTab === "pending") {
      return task.status !== "Completed"
    }
    return true // "all"
  })

  const defaultSize = preferences.defaultPageSize

  const accountsPagination = usePagination(filteredAccounts, defaultSize)
  const tasksPagination = usePagination(filteredTasksList, defaultSize)
  const drillPagination = usePagination(drillItems || [], defaultSize)

  // Count Call List stats for metrics
  const hotCount = callListAccounts.filter(a => a.quality === "HOT").length
  const neverStatusedCount = callListAccounts.filter(a => a.quality === "NEVER_STATUSED").length

  // Effort Metrics Config
  const metrics = effort === "sales" ? [
    { id: "revenue", label: "Pipeline LTV", value: activeLtv >= 1000000 ? `$${(activeLtv / 1000000).toFixed(1)}M` : `$${(activeLtv / 1000).toFixed(1)}k`, sub: "All accounts LTV", icon: <FiTrendingUp />, color: "text-emerald-400" },
    { id: "profit", label: "Pipeline Profit", value: activeProfit >= 1000000 ? `$${(activeProfit / 1000000).toFixed(1)}M` : `$${(activeProfit / 1000).toFixed(1)}k`, sub: "All accounts profit", icon: <FiTrendingUp />, color: "text-sky-400" },
    { id: "overdue", label: "Overdue Balance", value: totalOverdueBalance >= 1000000 ? `$${(totalOverdueBalance / 1000000).toFixed(1)}M` : `$${(totalOverdueBalance / 1000).toFixed(1)}k`, sub: "Unpaid collections", icon: <FiDollarSign />, color: "text-rose-400" },
    { id: "accounts", label: "Pipeline Accounts", value: filteredByOwnerActive.length, sub: "Total accounts", icon: <FiUsers />, color: "text-teal-400" },
  ] : effort === "cold_call" ? [
    { id: "cold_queue", label: "Cold Queue", value: coldCallAccounts.length, sub: "Never purchased", icon: <FiTarget />, color: "text-indigo-400" },
    { id: "never_statused", label: "NEVER STATUSED", value: coldCallAccounts.filter(a => a.quality === "NEVER_STATUSED").length, sub: "Needs triage", icon: <FiUsers />, color: "text-amber-400" },
  ] : [
    { id: "queue", label: "Call Queue", value: callListAccounts.length, sub: "Top priority list", icon: <FiPhoneCall />, color: "text-sky-400" },
    { id: "hot", label: "HOT Customers", value: hotCount, sub: "Needs immediate touch", icon: <FiTrendingUp />, color: "text-red-400" },
    { id: "never_statused", label: "NEVER STATUSED", value: neverStatusedCount, sub: "Needs triage", icon: <FiUsers />, color: "text-amber-400" },
  ]

  const accentColor = effort === "sales" ? "emerald" : effort === "cold_call" ? "indigo" : "sky"
  const activeFilterCount = (ownerFilter !== "All" ? 1 : 0) + (statusFilter !== "All" ? 1 : 0) + (industryFilter !== "All" ? 1 : 0) + (timezoneFilter !== "All" ? 1 : 0) + (qualityFilter !== "All" ? 1 : 0) + (onlyWithSales ? 1 : 0) + (ltvMin ? 1 : 0) + (ltvMax ? 1 : 0)

  if (!isInitialized || loading) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] glass-panel text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-neutral-400 font-medium text-sm">Loading Sales Hub...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col text-neutral-100 font-sans overflow-y-auto" style={{ height: "100%" }}>

      {/* ── Main scrollable content ── */}
      <main className="flex-1 px-4 sm:px-6 py-4 space-y-4 overflow-y-auto safe-bottom">

        {apiError && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
            <strong>Error:</strong> {apiError}
          </div>
        )}


        {/* ── Workspace / Effort Selector Switcher ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => handleEffortChange("sales")}
            className={`relative overflow-hidden rounded-xl p-4 text-left border transition-all duration-300 ${
              effort === "sales"
                ? "bg-[#17191a] border-[var(--primary)]/50 text-white"
                : "bg-white/[0.035] border-[var(--border)] hover:border-[var(--border)] text-neutral-400"
            }`}
          >
            {effort === "sales" && (
              <div className="absolute right-3 top-3 w-2 h-2 rounded-full bg-emerald-400 "></div>
            )}
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border transition-colors ${
                effort === "sales"
                  ? "bg-[var(--primary)]/12 border-[var(--primary)]/30 text-[var(--primary)]"
                  : "bg-white/[0.045] border-[var(--border)] text-neutral-500"
              }`}>
                <FiTrendingUp size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight">Sales Pipeline</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Manage pipeline, accounts and deals</p>
              </div>
              <div className="ml-auto shrink-0 flex items-center justify-center min-w-[28px] h-7 px-2 rounded-md text-xs font-black bg-[var(--primary)]/12 text-[var(--primary)] border border-[var(--primary)]/25">
                {filteredByOwnerActive.length}
              </div>
            </div>
          </button>

          <button
            onClick={() => handleEffortChange("cold_call")}
            className={`relative overflow-hidden rounded-xl p-4 text-left border transition-all duration-300 ${
              effort === "cold_call"
                ? "bg-[#17191a] border-indigo-400/45 text-white"
                : "bg-white/[0.035] border-[var(--border)] hover:border-[var(--border)] text-neutral-400"
            }`}
          >
            {effort === "cold_call" && (
              <div className="absolute right-3 top-3 w-2 h-2 rounded-full bg-indigo-400 "></div>
            )}
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border transition-colors ${
                effort === "cold_call"
                  ? "bg-indigo-950 border-indigo-500/30 text-indigo-400"
                  : "bg-white/[0.045] border-[var(--border)] text-neutral-500"
              }`}>
                <FiTarget size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight">Cold Call List</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Never purchased</p>
              </div>
              <div className="ml-auto shrink-0 flex items-center justify-center min-w-[28px] h-7 px-2 rounded-md text-xs font-black bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                {coldCallAccounts.length}
              </div>
            </div>
          </button>

          <button
            onClick={() => handleEffortChange("call_list")}
            className={`relative overflow-hidden rounded-xl p-4 text-left border transition-all duration-300 ${
              effort === "call_list"
                ? "bg-[#17191a] border-sky-400/45 text-white"
                : "bg-white/[0.035] border-[var(--border)] hover:border-[var(--border)] text-neutral-400"
            }`}
          >
            {effort === "call_list" && (
              <div className="absolute right-3 top-3 w-2 h-2 rounded-full bg-sky-400 "></div>
            )}
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border transition-colors ${
                effort === "call_list"
                  ? "bg-sky-950 border-sky-500/30 text-sky-400"
                  : "bg-white/[0.045] border-[var(--border)] text-neutral-500"
              }`}>
                <FiPhoneCall size={20} />
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
          {resolvePermissions(dbUser?.permissions, dbUser?.role || currentUser?.role).salesBoard && (
          <button
            onClick={() => handleEffortChange("dashboard")}
            className={`relative overflow-hidden rounded-xl p-4 text-left border transition-all duration-300 ${
              effort === "dashboard"
                ? "bg-[#17191a] border-purple-400/45 text-white"
                : "bg-white/[0.035] border-[var(--border)] hover:border-[var(--border)] text-neutral-400"
            }`}
          >
            {effort === "dashboard" && (
              <div className="absolute right-3 top-3 w-2 h-2 rounded-full bg-purple-400 "></div>
            )}
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border transition-colors ${
                effort === "dashboard"
                  ? "bg-purple-950 border-purple-500/30 text-purple-400"
                  : "bg-white/[0.045] border-[var(--border)] text-neutral-500"
              }`}>
                <FiTarget size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight">Sales Board</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Live metrics</p>
              </div>
            </div>
          </button>
          )}
        </div>

        {effort === "dashboard" && resolvePermissions(dbUser?.permissions, dbUser?.role || currentUser?.role).salesBoard ? (
          <div className="mt-4">
            <SalesBoard />
          </div>
        ) : effort === "dashboard" ? (
          <></>
        ) : (
          <>
            {/* Quick Invoice Lookups */}
        <div className="flex flex-wrap gap-2.5 glass-panel p-3 rounded-xl border border-[var(--border)] ">
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
            <span className="bg-emerald-500/30 px-1.5 py-0.5 rounded text-[10px] font-black">${(() => { const t = accounts.filter(a => (ownerFilter === "All" || a.ownerId === ownerFilter) && (a.totalSales || 0) > 0).reduce((s, a) => s + (a.totalSales || 0), 0); return t >= 1000 ? (t/1000).toFixed(1) + 'k' : t.toFixed(0); })()}</span>
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
            <span className="bg-amber-500/30 px-1.5 py-0.5 rounded text-[10px] font-black">${(() => { const t = accounts.filter(a => (ownerFilter === "All" || a.ownerId === ownerFilter) && ((a.unpaidCount || 0) > 0 || (a.unpaidBalance || 0) > 0)).reduce((s, a) => s + (a.unpaidBalance || 0), 0); return t >= 1000 ? (t/1000).toFixed(1) + 'k' : t.toFixed(0); })()}</span>
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
            <span className="bg-rose-500/30 px-1.5 py-0.5 rounded text-[10px] font-black">${(() => { const t = accounts.filter(a => (ownerFilter === "All" || a.ownerId === ownerFilter) && ((a.overdueCount || 0) > 0)).reduce((s, a) => s + (a.overdueBalance || 0), 0); return t >= 1000 ? (t/1000).toFixed(1) + 'k' : t.toFixed(0); })()}</span>
          </button>
        </div>


        {/* Metrics row */}
        <div className={`grid gap-2 sm:gap-3 ${effort === "sales" ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
          {metrics.map(m => (
            <div key={m.label} className="glass-panel rounded-xl p-3 border border-[var(--border)] cursor-pointer hover:bg-white/[0.055] transition-all duration-200" onClick={() => {
              if (effort === "sales") {
                if (m.id === "revenue") {
                  setDrillType("accounts")
                  setDrillTitle("Active Pipeline Accounts")
                  setDrillItems(filteredByOwnerActive.filter(a => (a.totalSales || 0) > 0).sort((a: any, b: any) => (b.totalSales || 0) - (a.totalSales || 0)))
                } else if (m.id === "profit") {
                  setDrillType("accounts")
                  setDrillTitle("Active Pipeline Accounts (by Profit)")
                  setDrillItems(filteredByOwnerActive.filter(a => (a.totalProfit || 0) > 0).sort((a: any, b: any) => (b.totalProfit || 0) - (a.totalProfit || 0)))
                } else if (m.id === "overdue") {
                  setDrillType("accounts")
                  setDrillTitle("Overdue Accounts")
                  setDrillItems(filteredByOwnerActive.filter(a => (a.overdueCount || 0) > 0).sort((a: any, b: any) => (b.overdueBalance || 0) - (a.overdueBalance || 0)))
                } else if (m.id === "accounts") {
                  setDrillType("accounts")
                  setDrillTitle("Pipeline Accounts")
                  setDrillItems(filteredByOwnerActive)
                }
              } else {
                // Call List Drilldowns
                if (m.id === "queue") {
                  setDrillType("accounts")
                  setDrillTitle("Call Queue Accounts")
                  setDrillItems(callListAccounts)
                } else if (m.id === "hot") {
                  setDrillType("accounts")
                  setDrillTitle("HOT Call Queue Accounts")
                  setDrillItems(callListAccounts.filter(a => a.quality === "HOT"))
                } else if (m.id === "never_statused") {
                  setDrillType("accounts")
                  setDrillTitle("NEVER STATUSED Accounts")
                  setDrillItems(callListAccounts.filter(a => a.quality === "NEVER_STATUSED"))
                }
              }
            }}>
              <div className="flex justify-between items-start mb-1">
                <span className="text-[10px] uppercase text-neutral-500 font-semibold tracking-wider">{m.label}</span>
                <span className={`text-xs ${m.color}`}>{m.icon}</span>
              </div>
              <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
              <p className="text-[10px] text-neutral-500 mt-0.5">{m.sub}</p>
            </div>
          ))}
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

        {/* ── Main 2-col grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Accounts list — full width on mobile, hidden when tasks tab active */}
          <div className={`lg:col-span-2 space-y-3 ${mobileTab === "tasks" ? "hidden sm:block" : ""}`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <h2 className="text-base font-bold text-white whitespace-nowrap flex items-center gap-2">
                {effort === "sales" ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 "></span>
                    <span>{isAdminUser ? "All Pipeline Accounts" : "My Pipeline Accounts"}</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 "></span>
                    <span>Prioritized Call List (Top 50)</span>
                  </>
                )}
              </h2>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                {isAdminUser && owners.length > 0 && (
                  <div className="relative w-full sm:w-48">
                    <FiUsers className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={13} />
                    <select
                      value={ownerFilter}
                      onChange={e => setOwnerFilter(e.target.value)}
                      className="w-full glass-panel border border-[var(--border)] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 appearance-none cursor-pointer"
                    >
                      <option value="All">All Representatives</option>
                      {owners.map(o => (
                        <option key={o.id} value={o.id}>{o.name || o.email}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="w-3 h-3 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                )}

                <div className="relative w-full sm:w-40">
                  <FiClock className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={13} />
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as any)}
                    className="w-full glass-panel border border-[var(--border)] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 appearance-none cursor-pointer"
                  >
                    <option value="default">Default Sort</option>
                    <option value="timezone_asc">Time Zone (A-Z)</option>
                    <option value="timezone_desc">Time Zone (Z-A)</option>
                    <option value="recentOrders_desc">Orders (Newest)</option>
                    <option value="recentOrders_asc">Orders (Oldest)</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-3 h-3 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                <button
                  onClick={() => setShowFiltersDrawer(true)}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-[var(--border)] glass-panel hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors cursor-pointer relative"
                >
                  <FiFilter size={12} className={activeFilterCount > 0 ? (effort === "sales" ? "text-emerald-400" : "text-sky-400") : ""} />
                  <span>Filters</span>
                  {activeFilterCount > 0 && (
                    <span className={`flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-black ${
                      effort === "sales" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                    }`}>
                      {activeFilterCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all duration-200 ${
                    effort === "sales"
                      ? "text-emerald-400 border-emerald-500/30 bg-emerald-950/20 hover:bg-emerald-950/40"
                      : "text-sky-400 border-sky-500/30 bg-sky-950/20 hover:bg-sky-950/40"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <FiRefreshCw size={12} className={syncing ? "animate-spin" : ""} />
                  <span>{syncing ? "Syncing..." : "Sync CRM"}</span>
                </button>
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Active Filters:</span>
                {ownerFilter !== "All" && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-800 border border-[var(--border)] text-xs text-neutral-300">
                    Rep: {owners.find(o => o.id === ownerFilter)?.name || ownerFilter}
                    <button onClick={() => setOwnerFilter("All")} className="text-neutral-500 hover:text-white"><FiX size={12} /></button>
                  </span>
                )}
                {statusFilter !== "All" && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-800 border border-[var(--border)] text-xs text-neutral-300">
                    Status: {statusFilter}
                    <button onClick={() => setStatusFilter("All")} className="text-neutral-500 hover:text-white"><FiX size={12} /></button>
                  </span>
                )}
                {industryFilter !== "All" && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-800 border border-[var(--border)] text-xs text-neutral-300">
                    Industry: {industryFilter}
                    <button onClick={() => setIndustryFilter("All")} className="text-neutral-500 hover:text-white"><FiX size={12} /></button>
                  </span>
                )}
                {timezoneFilter !== "All" && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-800 border border-[var(--border)] text-xs text-neutral-300">
                    Zone: {timezoneFilter}
                    <button onClick={() => setTimezoneFilter("All")} className="text-neutral-500 hover:text-white"><FiX size={12} /></button>
                  </span>
                )}
                {onlyWithSales && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-800 border border-[var(--border)] text-xs text-neutral-300">
                    Has Purchases
                    <button onClick={() => setOnlyWithSales(false)} className="text-neutral-500 hover:text-white"><FiX size={12} /></button>
                  </span>
                )}
                <button 
                  onClick={() => {
                    setOwnerFilter("All")
                    setStatusFilter("All")
                    setIndustryFilter("All")
                    setTimezoneFilter("All")
                    setOnlyWithSales(false)
                  }}
                  className="text-[10px] uppercase font-bold text-neutral-500 hover:text-neutral-300 ml-1 transition-colors"
                >
                  Clear All
                </button>
              </div>
            )}

            <div className={`bg-neutral-800/30 rounded-xl border overflow-hidden transition-all duration-300 ${
              effort === "sales" ? "border-[var(--border)]" : "border-sky-900/20"
            }`}>
              {filteredAccounts.length === 0 ? (
                <div className="p-8 text-center">
                  <FiUsers className="mx-auto text-3xl text-neutral-700 mb-2" />
                  <p className="text-neutral-400 text-sm">No accounts found.</p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {/* Selection & Campaign Toolbar */}
                  <div className="glass-panel border-b border-[var(--border)] px-4 py-3 flex items-center justify-between gap-3 text-xs sm:text-sm flex-wrap">
                    <div className="flex items-center gap-3 flex-1 min-w-[250px]">
                      <input 
                        type="checkbox"
                        checked={accountsPagination.paginatedItems.length > 0 && accountsPagination.paginatedItems.every(a => selectedAccountIds.includes(a.id))}
                        ref={el => {
                          if (el) {
                            const pageSelected = accountsPagination.paginatedItems.filter(a => selectedAccountIds.includes(a.id)).length
                            el.indeterminate = pageSelected > 0 && pageSelected < accountsPagination.paginatedItems.length
                          }
                        }}
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
                      <span className="text-neutral-400 font-medium select-none shrink-0 hidden sm:inline">
                        {selectedAccountIds.length > 0 ? (
                          <>
                            Selected <span className="text-white font-bold">{selectedAccountIds.length}</span> of <span className="text-white font-bold">{filteredAccounts.length}</span> accounts
                          </>
                        ) : (
                          "Select accounts for campaign"
                        )}
                      </span>
                      
                      {/* Search box next to selection */}
                      <div className="relative flex-1 max-w-xs ml-0 sm:ml-2">
                        <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
                        <input 
                          type="text"
                          placeholder="Search accounts..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-neutral-800/80 border border-[var(--border)] rounded-md pl-8 pr-8 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors"
                        />
                        {searchQuery && (
                          <button 
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                          >
                            <FiX size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                    {selectedAccountIds.length > 0 && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setShowCallCampaignModal(true)}
                          className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-black font-extrabold  shadow-sky-950/20 hover:shadow-sky-950/45 transition-all flex items-center gap-1.5 text-xs sm:text-sm cursor-pointer"
                        >
                          <FiPhoneCall className="shrink-0" size={14} />
                          <span>Start Call Campaign</span>
                        </button>
                        <button 
                          onClick={() => setShowCampaignModal(true)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold  shadow-emerald-950/20 hover:shadow-emerald-950/45 transition-all flex items-center gap-1.5 text-xs sm:text-sm cursor-pointer"
                        >
                          <FiMail className="shrink-0" size={14} />
                          <span>Create Campaign</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {accountsPagination.paginatedItems.length > 0 && 
                   accountsPagination.paginatedItems.every(a => selectedAccountIds.includes(a.id)) && 
                   selectedAccountIds.length < filteredAccounts.length && (
                    <div className="bg-emerald-950/40 text-emerald-300 text-xs py-2 px-4 text-center border-b border-emerald-900/30">
                      All {accountsPagination.paginatedItems.length} accounts on this page are selected.
                      <button 
                        onClick={() => setSelectedAccountIds(filteredAccounts.map(a => a.id))}
                        className="ml-2 font-bold underline hover:text-emerald-100 transition-colors"
                      >
                        Select all {filteredAccounts.length} accounts in this view
                      </button>
                    </div>
                  )}

                  <ul className="divide-y divide-neutral-800">
                    {accountsPagination.paginatedItems.map(account => {
                    const ltv = account.totalSales || 0
                    const overdueCount = 0
                    const overdueBalance = 0;

                    const primaryContact = account.contacts?.find((c: any) => c.isPrimary) || account.contacts?.[0]
                    const cleanPhone = primaryContact?.phone ? primaryContact.phone.replace(/[^0-9+]/g, '') : ''

                    const daysSinceLastPurchase = account.lastPurchaseAt
                      ? Math.floor((Date.now() - new Date(account.lastPurchaseAt).getTime()) / 86400000)
                      : null

                    let activityLabel = "No purchases"
                    let activityColor = "text-neutral-500"
                    if (daysSinceLastPurchase !== null) {
                      if (daysSinceLastPurchase > 365) {
                        activityLabel = `${(daysSinceLastPurchase / 365).toFixed(1)}y inactive`
                        activityColor = "text-amber-500"
                      } else {
                        activityLabel = `${daysSinceLastPurchase}d since purchase`
                        activityColor = "text-emerald-500"
                      }
                    }

                    const isSelected = selectedAccountIds.includes(account.id)

                    return (
                      <li key={account.id} className={`hover:bg-neutral-800/50 transition-all ${isSelected ? 'bg-emerald-950/10 hover:bg-emerald-950/15 border-l-2 border-emerald-500' : ''}`}>
                        <div className="flex items-center justify-between px-4 py-3.5 gap-4">
                          {/* Checkbox */}
                          <div className="flex items-center shrink-0">
                            <input 
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedAccountIds(prev => 
                                  prev.includes(account.id) 
                                    ? prev.filter(id => id !== account.id) 
                                    : [...prev, account.id]
                                )
                              }}
                              className="w-4 h-4 rounded border-[var(--border)] text-emerald-600 focus:ring-emerald-500 bg-neutral-800 cursor-pointer"
                            />
                          </div>
                          {/* Left Side: Avatar & Basic Info */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Link href={`/account?id=${account.zohoId}`} className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-300 font-bold text-sm border border-[var(--border)] shrink-0 hover:border-emerald-500 transition-colors">
                              {account.name.charAt(0)}
                            </Link>
                            <div className="min-w-0">
                              <Link href={`/account?id=${account.zohoId}`} className="text-sm font-bold text-white truncate block hover:text-emerald-400 transition-colors">{account.name}</Link>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-[10px] text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded border border-[var(--border)]">{account.tags || "General"}</span>
                                <QualityPicker
                                  zohoId={account.zohoId}
                                  accountId={account.id}
                                  currentQuality={account.quality || "NEVER_STATUSED"}
                                  compact
                                  onUpdated={(newQuality) => {
                                    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, quality: newQuality } : a))
                                  }}
                                />
                                <TimezonePicker
                                  zohoId={account.zohoId}
                                  accountId={account.id}
                                  currentTimezone={account.timeZone || ""}
                                  compact
                                  onUpdated={(newTz) => {
                                    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, timeZone: newTz } : a))
                                  }}
                                />
                                {account.owner?.name && (
                                  <span className="text-[10px] text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20 flex items-center gap-1">
                                    <FiUser size={8} />{account.owner.name.split(' ')[0]}
                                  </span>
                                )}
                              </div>
                              {/* Mobile-only compact metadata stack */}
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap sm:hidden text-[10px] text-neutral-400 font-medium">
                                {effort === "call_list" ? (
                                  <span className="font-bold text-sky-400">{formatLastCalled(account.lastCalledAt)}</span>
                                ) : (
                                  <>
                                    <span className="font-bold text-emerald-400">
                                      ${ltv >= 1000000 ? `${(ltv / 1000000).toFixed(1)}M` : ltv >= 1000 ? `${(ltv / 1000).toFixed(1)}k` : ltv.toFixed(0)} LTV
                                    </span>
                                    {overdueBalance > 0 && (
                                      <>
                                        <span className="w-0.5 h-0.5 rounded-full bg-neutral-600"></span>
                                        <span className="font-bold text-rose-400">
                                          ${overdueBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })} Overdue
                                        </span>
                                      </>
                                    )}
                                  </>
                                )}
                                <span className="w-0.5 h-0.5 rounded-full bg-neutral-600"></span>
                                <span className={`font-semibold ${activityColor}`}>{activityLabel}</span>
                                {account.industry && (
                                  <>
                                    <span className="w-0.5 h-0.5 rounded-full bg-neutral-600"></span>
                                    <span className="truncate max-w-[100px]">{account.industry}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Middle Side: Sales Metrics & Invoice Counts */}
                          <div className="hidden sm:flex flex-col text-right shrink-0 min-w-[140px]">
                            {effort === "call_list" ? (
                              <>
                                <p className="text-sm font-bold text-sky-400">
                                  {formatLastCalled(account.lastCalledAt)}
                                </p>
                                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                  <span className="text-[10px] text-neutral-500">
                                    LTV: ${ltv >= 1000000 ? `${(ltv / 1000000).toFixed(1)}M` : ltv >= 1000 ? `${(ltv / 1000).toFixed(1)}k` : ltv.toFixed(0)}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-bold text-emerald-400">
                                  ${ltv >= 1000000 ? `${(ltv / 1000000).toFixed(1)}M` : ltv >= 1000 ? `${(ltv / 1000).toFixed(1)}k` : ltv.toFixed(0)} LTV
                                </p>
                                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                  <span className="text-[10px] text-neutral-400">Total Sales</span>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Right Side: Actions */}
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right hidden md:block">
                              <p className={`text-xs font-semibold ${activityColor}`}>{activityLabel}</p>
                              <p className="text-[10px] text-neutral-500 mt-0.5">{account.industry || "Unknown Industry"}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {cleanPhone ? (
                                <a href={"tel:" + cleanPhone } className="p-1.5 bg-neutral-800 hover:bg-blue-600 rounded-full text-neutral-400 hover:text-white transition-colors" title="Call">
                                  <FiPhoneCall size={12} />
                                </a>
                              ) : (
                                <button className="p-1.5 bg-neutral-800 rounded-full text-neutral-400 opacity-40 cursor-not-allowed" disabled>
                                  <FiPhoneCall size={12} />
                                </button>
                              )}
                              <a href={"sms:" + cleanPhone} className="p-1.5 bg-neutral-800 hover:bg-emerald-600 rounded-full text-neutral-400 hover:text-white transition-colors hidden sm:flex" title="Text Message (SMS)">
                                <FiMessageSquare size={12} />
                              </a>
                              <Link href={`/account?id=${account.zohoId}`} className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-full text-neutral-500 hover:text-white transition-colors">
                                <FiChevronRight size={14} />
                              </Link>
                            </div>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                  </ul>
                  <Pagination 
                    currentPage={accountsPagination.currentPage}
                    pageSize={accountsPagination.pageSize}
                    totalItems={filteredAccounts.length}
                    onPageChange={accountsPagination.setCurrentPage}
                    onPageSizeChange={accountsPagination.setPageSize}
                  />
                  {accountsHasMore && (
                    <div className="flex items-center justify-center gap-2 mt-2 py-1">
                      <div className="w-3 h-3 rounded-full border-2 border-neutral-600 border-t-blue-400 animate-spin" />
                      <p className="text-[11px] text-neutral-500">Loading accounts… {accounts.length.toLocaleString()} of {accountsTotalCount.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tasks — stacks below on mobile, column on desktop */}
          <div className={`lg:col-span-1 border-l border-[var(--border)] lg:pl-4 space-y-4 ${mobileTab === "accounts" ? "hidden sm:block" : ""}`}>
            <OrderNextSteps accounts={accounts} onViewDoc={(type, doc) => { setViewingDocType(type as any); setViewingInvoice(doc) }} />

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FiCheckCircle className="text-emerald-500" size={16} />
                <h2 className="text-base font-bold text-white">Task Manager</h2>
                {filteredTasksList.filter(t => t.status !== "Completed").length > 0 && (
                  <span className="text-[10px] bg-emerald-900/40 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                    {filteredTasksList.filter(t => t.status !== "Completed").length} pending
                  </span>
                )}
              </div>
            </div>

            {/* Quick Filters Tab Row */}
            <div className="flex border-b border-[var(--border)] pb-2 gap-1.5 flex-wrap">
              <button 
                onClick={() => setTaskFilterTab("due")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  taskFilterTab === "due"
                    ? "bg-neutral-800 text-emerald-400 border border-[var(--border)] "
                    : "text-neutral-400 hover:text-neutral-200 border border-transparent"
                }`}
              >
                Your Due / Overdue
              </button>
              <button 
                onClick={() => setTaskFilterTab("pending")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  taskFilterTab === "pending"
                    ? "bg-neutral-800 text-emerald-400 border border-[var(--border)] "
                    : "text-neutral-400 hover:text-neutral-200 border border-transparent"
                }`}
              >
                Pending
              </button>
              <button 
                onClick={() => setTaskFilterTab("completed")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  taskFilterTab === "completed"
                    ? "bg-neutral-800 text-emerald-400 border border-[var(--border)] "
                    : "text-neutral-400 hover:text-neutral-200 border border-transparent"
                }`}
              >
                Completed
              </button>
              <button 
                onClick={() => setTaskFilterTab("all")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  taskFilterTab === "all"
                    ? "bg-neutral-800 text-emerald-400 border border-[var(--border)] "
                    : "text-neutral-400 hover:text-neutral-200 border border-transparent"
                }`}
              >
                All Tasks
              </button>
            </div>

            <div className="flex items-center gap-2 mb-3 mt-4">
              <label className="text-xs font-semibold text-neutral-400">Type:</label>
              <select 
                value={taskTypeFilter} 
                onChange={e => setTaskTypeFilter(e.target.value)}
                className="bg-neutral-800 border border-[var(--border)] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="All">All Types</option>
                <option value="Task">Task</option>
                <option value="Call">Call</option>
                <option value="Email">Email</option>
                <option value="Text">Text</option>
                <option value="Processing">Processing</option>
              </select>
            </div>

            {/* Tasks List Container */}
            <div className="bg-neutral-800/30 rounded-xl border border-[var(--border)] p-3">
              {filteredTasksList.length === 0 ? (
                <div className="text-center py-8">
                  <FiCheckCircle className="mx-auto text-3xl text-neutral-600 mb-2" />
                  <p className="text-neutral-300 font-bold text-sm">All caught up!</p>
                  <p className="text-xs text-neutral-500 mt-1">No tasks in this filter tab.</p>
                </div>
              ) : (
                <div className="flex flex-col space-y-0">
                  <div className="space-y-3 p-1">
                    {tasksPagination.paginatedItems.map(task => {
                      const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "Completed"
                      const dueDateObj = task.dueDate ? new Date(task.dueDate) : null
                      const hasTime = dueDateObj && (dueDateObj.getHours() !== 0 || dueDateObj.getMinutes() !== 0)
                      const formattedDate = dueDateObj ? dueDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + (hasTime ? ` at ${dueDateObj.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '') : null
                      const assigneeName = repsList.find(r => r.id === task.ownerId)?.name || repsList.find(r => r.id === task.ownerId)?.email || "Unassigned"
                      const hasReminder = !!task.reminderAt
                      const reminderFiredFlag = task.reminderFired === true

                      return (
                        <div key={task.id} className="glass-panel border border-[var(--border)] rounded-xl p-3.5 hover:border-[var(--border)] transition-all shadow-sm flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            {/* Badges */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                task.priority === "HIGH" 
                                  ? "bg-red-950/40 text-red-400 border border-red-500/20" 
                                  : task.priority === "LOW"
                                  ? "bg-blue-950/40 text-blue-400 border border-blue-500/20"
                                  : "bg-black/25/40 text-neutral-400 border border-[var(--border)]"
                              }`}>
                                {task.priority} Priority
                              </span>
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                task.status === "Completed"
                                  ? "bg-emerald-950/40 text-emerald-400 border border-emerald-500/20"
                                  : task.status === "In Progress"
                                  ? "bg-sky-950/40 text-sky-400 border border-sky-500/20"
                                  : "bg-black/25/40 text-neutral-400 border border-[var(--border)]"
                              }`}>
                                {task.status}
                              </span>
                              {hasReminder && (
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                  reminderFiredFlag
                                    ? "bg-amber-950/40 text-amber-400 border border-amber-500/20 animate-pulse"
                                    : "bg-neutral-800 text-neutral-400 border border-[var(--border)]"
                                }`}>
                                  🔔 {reminderFiredFlag ? "REMINDER!" : "Reminder Set"}
                                </span>
                              )}
                            </div>
                            
                            {/* Edit / Complete Buttons */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button 
                                onClick={() => handleOpenEditTask(task)}
                                className="p-1 rounded glass-panel hover:bg-neutral-800 text-neutral-400 hover:text-white border border-[var(--border)] transition-colors"
                                title="Edit Task"
                              >
                                <FiEdit size={11} />
                              </button>
                              {task.status !== "Completed" && (
                                <button 
                                  onClick={() => handleCompleteTask(task)} 
                                  className="text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded px-2.5 py-1 transition-colors flex items-center gap-1"
                                >
                                  <FiCheck size={10} />
                                  <span>Complete</span>
                                </button>
                              )}
                            </div>
                          </div>

                          <h4 className="text-sm font-bold text-white leading-snug">{task.title}</h4>
                          {task.description && (
                            <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2 mt-0.5">{task.description}</p>
                          )}

                          <div className="border-t border-[var(--border)] pt-2 flex flex-col gap-1.5 text-[11px] text-neutral-400 mt-1">
                            {/* Linked Account / Deal */}
                            <div className="flex items-center gap-1">
                              <span className="text-neutral-500 font-medium">Link:</span>
                              {task.accountId ? (
                                <Link
                                  href={`/account?id=${task.accountId}`}
                                  className="text-emerald-400 hover:underline inline-flex items-center font-bold"
                                >
                                  {accounts.find(a => a.zohoId === task.accountId)?.name || "Linked Account"}
                                  <FiChevronRight size={10} className="ml-0.5" />
                                </Link>
                              ) : (
                                <span className="text-neutral-500 italic">Company-wide / General Task</span>
                              )}
                            </div>

                            {/* Linked Transactions */}
                            {(task.invoiceId || task.salesOrderId || task.quoteId || task.estimateId) && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-neutral-500 font-medium">Docs:</span>
                                {task.invoiceId && (
                                  <span className="bg-neutral-800 border border-[var(--border)] px-1.5 py-0.5 rounded text-[10px] text-blue-400 font-mono font-bold">
                                    INV: {task.invoiceId}
                                  </span>
                                )}
                                {task.salesOrderId && (
                                  <span className="bg-neutral-800 border border-[var(--border)] px-1.5 py-0.5 rounded text-[10px] text-purple-400 font-mono font-bold">
                                    SO: {task.salesOrderId}
                                  </span>
                                )}
                                {task.quoteId && (
                                  <span className="bg-neutral-800 border border-[var(--border)] px-1.5 py-0.5 rounded text-[10px] text-amber-400 font-mono font-bold">
                                    Quote: {task.quoteId}
                                  </span>
                                )}
                                {task.estimateId && (
                                  <span className="bg-neutral-800 border border-[var(--border)] px-1.5 py-0.5 rounded text-[10px] text-emerald-400 font-mono font-bold">
                                    EST: {task.estimateId}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Assignee (visible to all but useful for admin contexts) */}
                            <div className="flex items-center gap-1">
                              <span className="text-neutral-500 font-medium">Assignee:</span>
                              <span className="text-neutral-300 font-bold">{assigneeName}</span>
                            </div>

                            {/* Due Date */}
                            {formattedDate && (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <FiCalendar className={isOverdue ? "text-red-400 " : "text-neutral-500"} size={11} />
                                <span className={isOverdue ? "text-red-400 font-black" : "text-neutral-400 font-medium"}>
                                  Due: {formattedDate} {isOverdue && "(OVERDUE)"}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
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
      </main>

      {drillItems && drillType && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setDrillItems(null)}>
          <div className="glass-panel border border-[var(--border)] rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-[0_22px_70px_rgba(0,0,0,0.38)]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 sm:p-5 border-b border-[var(--border)]">
              <h3 className="text-white font-bold text-lg">{drillTitle}</h3>
              <button onClick={() => setDrillItems(null)} className="text-neutral-500 hover:text-white transition-colors bg-neutral-800 p-1.5 rounded-full">
                <FiX size={18} />
              </button>
            </div>
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
              {drillItems.length === 0 ? (
                <p className="text-neutral-500 text-sm text-center py-4">No data available.</p>
              ) : (
                <div className="flex flex-col h-full">
                  <div className="space-y-3 flex-1">
                    {drillPagination.paginatedItems.map((item, idx) => (
                <div key={idx} className="bg-neutral-800/50 rounded-xl p-3 border border-[var(--border)]">
                  {drillType === "invoices" && (
                    <div 
                      onClick={() => setViewingInvoice(item)}
                      className="flex justify-between items-center cursor-pointer hover:glass-panel p-2 rounded-xl transition-all group"
                      title="Click to view Invoice PDF"
                    >
                      <div>
                        {item.accountZohoId ? (
                          <Link 
                            href={`/account?id=${item.accountZohoId}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDrillItems(null);
                            }}
                            className="text-white text-sm font-bold hover:text-emerald-400 hover:underline inline-block"
                          >
                            {item.accountName}
                          </Link>
                        ) : (
                          <p className="text-white text-sm font-bold">{item.accountName}</p>
                        )}
                        <p className="text-neutral-400 text-xs mt-1 flex items-center gap-1.5">
                          <FiFileText className="text-amber-500 shrink-0" size={11} />
                          <span className="text-emerald-400 group-hover:underline font-mono">#{((item.items as any)?.invoiceNumber) || item.zohoId?.slice(-6) || item.id?.slice(-6) || "—"}</span>
                          <span className="text-neutral-500 font-sans ml-1 flex flex-col gap-0.5 border-l border-[var(--border)] pl-2">
                            <span>Ordered: {new Date(item.issueDate || item.orderDate || item.createdAt || Date.now()).toLocaleDateString()}</span>
                            {item.status === 'Paid' && (
                              <span className="text-blue-400">Paid: {new Date((item.items as any)?.paymentDate || item.updatedAt || item.issueDate).toLocaleDateString()}</span>
                            )}
                          </span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-emerald-400 font-bold text-sm">${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        {item.items?.profit !== undefined && (
                          <p className="text-[10px] text-sky-400 font-semibold mt-0.5">Profit: ${parseFloat(item.items.profit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        )}
                        <p className={`text-[10px] mt-0.5 ${item.status === 'Paid' ? 'text-blue-400' : 'text-amber-400'}`}>{item.status}</p>
                      </div>
                    </div>
                        )}
                        {drillType === "deals" && (
                          <div>
                            <p className="text-white text-sm font-bold">{item.title}</p>
                            <p className="text-neutral-400 text-xs mt-0.5">{item.description}</p>
                          </div>
                        )}
                        {drillType === "accounts" && (
                          <div>
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-white text-sm font-bold">{item.name}</p>
                                {item._latestPaymentTime > 0 && (
                                  <p className="text-neutral-500 text-xs mt-0.5 flex items-center gap-1"><FiCalendar size={10} /> Paid: {new Date(item._latestPaymentTime).toLocaleDateString()}</p>
                                )}
                                {(item.unpaidBalance > 0 || item.overdueBalance > 0) && (
                                  <div className="flex items-center gap-2 mt-1">
                                    {item.unpaidBalance > 0 && (
                                      <span className="text-[10px] font-black text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded">Unpaid: ${item.unpaidBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    )}
                                    {item.overdueBalance > 0 && (
                                      <span className="text-[10px] font-black text-rose-400 bg-rose-500/15 px-1.5 py-0.5 rounded">Overdue: ${item.overdueBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <Link href={`/account?id=${item.zohoId}`} onClick={() => setDrillItems(null)} className="text-emerald-400 text-xs hover:underline flex items-center gap-1 shrink-0">
                                View <FiChevronRight />
                              </Link>
                            </div>
                            {item.unpaidInvoiceSummary && item.unpaidInvoiceSummary.length > 0 && (
                              <div className="mt-2 space-y-1 border-t border-[var(--border)] pt-2">
                                {item.unpaidInvoiceSummary.map((inv: any, i: number) => (
                                  <div key={i} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-neutral-900/50">
                                    <div className="flex items-center gap-2">
                                      <span className="text-emerald-400 font-mono font-bold">#{inv.invoiceNumber}</span>
                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${inv.status === 'Overdue' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>{inv.status}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-neutral-400">
                                      {inv.dueDate && (
                                        <span className="flex items-center gap-1"><FiCalendar size={9} /> Due: {new Date(inv.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                      )}
                                      <span className="text-amber-400 font-bold">${inv.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Filters Popup Modal (portaled to body) ── */}
      {showFiltersDrawer && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFiltersDrawer(false)} />
          <div className="relative w-full max-w-md max-h-[85vh] glass-panel border border-[var(--border)] rounded-xl flex flex-col shadow-[0_22px_70px_rgba(0,0,0,0.38)] text-white z-[9999] overflow-hidden">
            <div className="p-6 flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-[var(--border)] shrink-0">
                <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-neutral-300">
                  <FiFilter className={effort === "sales" ? "text-emerald-400" : "text-sky-400"} /> Filters
                </h2>
                <button onClick={() => setShowFiltersDrawer(false)} className="text-neutral-400 hover:text-white p-1.5 rounded-full bg-neutral-800 transition-colors">
                  <FiX size={15} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto py-4 space-y-6 scrollbar-thin min-h-0">


                {/* Sales rep selector (Admin user only) */}
                {isAdminUser && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Sales Representative</label>
                    <select 
                      value={ownerFilter} 
                      onChange={e => setOwnerFilter(e.target.value)}
                      className="w-full bg-neutral-800 border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="All">All Representatives</option>
                      {owners.map(o => <option key={o.id} value={o.id}>{o.name || o.email}</option>)}
                    </select>
                  </div>
                )}
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Time Zone</label>
                  <select 
                    value={timezoneFilter} 
                    onChange={e => setTimezoneFilter(e.target.value)}
                    className="w-full bg-neutral-800 border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="All">All Time Zones</option>
                    {allTimezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                
                {/* Do Not Call toggle */}
                <label className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity bg-neutral-800/50 p-2.5 rounded-lg border border-[var(--border)]">
                  <input 
                    type="checkbox" 
                    checked={showDoNotCall}
                    onChange={(e) => setShowDoNotCall(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--border)] text-emerald-600 focus:ring-emerald-500 glass-panel cursor-pointer"
                  />
                  <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Show "Do Not Call" Accounts</span>
                </label>

                {/* Customer Quality filter */}
                {/* Quality Filter */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Quality</label>
                  <select
                    className="w-full bg-neutral-800 border border-neutral-700 text-white rounded p-2 text-sm focus:ring-1 focus:ring-emerald-500"
                    value={qualityFilter}
                    onChange={e => setQualityFilter(e.target.value)}
                  >
                    <option value="All">All Qualities</option>
                    <option value="HOT">Hot</option>
                    <option value="WARM">Warm</option>
                    <option value="COLD">Cold</option>
                    <option value="ON_HOLD">On Hold</option>
                    <option value="NEVER_STATUSED">Never Statused</option>
                  </select>
                </div>

                {/* Year Filter */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Purchase Year</label>
                  <select
                    className="w-full bg-neutral-800 border border-neutral-700 text-white rounded p-2 text-sm focus:ring-1 focus:ring-emerald-500"
                    value={yearFilter}
                    onChange={e => setYearFilter(e.target.value)}
                  >
                    <option value="All">All Years</option>
                    {allYears.map(yr => <option key={yr} value={yr}>{yr}</option>)}
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>

                {/* Status selector (only active for sales pipeline effort) */}
                {effort === "sales" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Pipeline Status</label>
                    <select 
                      value={statusFilter} 
                      onChange={e => setStatusFilter(e.target.value)}
                      className="w-full bg-neutral-800 border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="All">All Statuses</option>
                      {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}

                {/* Industry selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider Industry">Industry</label>
                  <select 
                    value={industryFilter} 
                    onChange={e => setIndustryFilter(e.target.value)}
                    className="w-full bg-neutral-800 border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="All">All Industries</option>
                    {allIndustries.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>

                {/* LTV Range Filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">LTV Range ($)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={ltvMin}
                      onChange={e => setLtvMin(e.target.value)}
                      placeholder="Min"
                      className="w-full bg-neutral-800 border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-neutral-500 text-xs">–</span>
                    <input
                      type="number"
                      value={ltvMax}
                      onChange={e => setLtvMax(e.target.value)}
                      placeholder="Max"
                      className="w-full bg-neutral-800 border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Checkbox filters */}
                <div className="space-y-3 pt-2">
                  <label className="flex items-center gap-3 text-xs font-semibold text-neutral-300 cursor-pointer select-none bg-neutral-800 border border-[var(--border)] rounded-lg px-3 py-2.5 hover:border-neutral-600 transition-colors">
                    <input
                      type="checkbox"
                      checked={onlyWithSales}
                      onChange={e => setOnlyWithSales(e.target.checked)}
                      className={`rounded glass-panel border-[var(--border)] ${effort === "sales" ? "text-emerald-500" : "text-amber-500"} focus:ring-0 focus:ring-offset-0 w-4 h-4`}
                    />
                    <span>Only show accounts with purchase history</span>
                  </label>
                  {isAdminUser && (
                    <label className="flex items-center gap-3 text-xs font-semibold text-neutral-300 cursor-pointer select-none bg-neutral-800 border border-[var(--border)] rounded-lg px-3 py-2.5 hover:border-neutral-600 transition-colors">
                      <input
                        type="checkbox"
                        checked={preferences.showHiddenReps || false}
                        onChange={e => {
                          updatePreferences({ showHiddenReps: e.target.checked })
                          setTimeout(() => fetchLocalData(1, false), 100)
                        }}
                        className={`rounded glass-panel border-[var(--border)] ${effort === "sales" ? "text-emerald-500" : "text-amber-500"} focus:ring-0 focus:ring-offset-0 w-4 h-4`}
                      />
                      <span>Include hidden reps in dropdowns</span>
                    </label>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-[var(--border)] flex gap-3 shrink-0">
                <button 
                  onClick={() => {
                    setSearchQuery("")
                    setOwnerFilter("All")
                    setStatusFilter("All")
                    setIndustryFilter("All")
                    setTimezoneFilter("All")
                    setQualityFilter("All")
                    setYearFilter("All")
                    setOnlyWithSales(false)
                    setShowFiltersDrawer(false)
                  }}
                  className="flex-1 bg-neutral-800 hover:bg-neutral-700 border border-[var(--border)] text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors"
                >
                  Clear All
                </button>
                <button 
                  onClick={() => setShowFiltersDrawer(false)}
                  className={`flex-1 ${
                    effort === "sales" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-amber-600 hover:bg-amber-500"
                  } text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors`}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showEditTaskModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEditTaskModal(false)} />
          <div className="relative w-full max-w-md glass-panel border border-[var(--border)] rounded-xl flex flex-col shadow-[0_22px_70px_rgba(0,0,0,0.38)] text-white z-[9999] p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-[var(--border)] mb-4">
              <h3 className="font-bold text-lg text-white">Edit Task</h3>
              <button onClick={() => setShowEditTaskModal(false)} className="text-neutral-400 hover:text-white glass-panel p-1 rounded-full">
                <FiX size={16} />
              </button>
            </div>
            <form onSubmit={handleUpdateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Subject *</label>
                <input 
                  type="text" 
                  value={taskSubject} 
                  onChange={e => setTaskSubject(e.target.value)} 
                  required
                  placeholder="Task subject..."
                  className="w-full glass-panel border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Description</label>
                <textarea 
                  value={taskDescription} 
                  onChange={e => setTaskDescription(e.target.value)} 
                  placeholder="Task details..."
                  rows={3}
                  className="w-full glass-panel border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Priority</label>
                  <select 
                    value={taskPriority} 
                    onChange={e => setTaskPriority(e.target.value)}
                    className="w-full glass-panel border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Due Date</label>
                  <input 
                    type="date" 
                    value={taskDueDate} 
                    onChange={e => setTaskDueDate(e.target.value)} 
                    className="w-full glass-panel border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    style={{ colorScheme: "dark" }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Time</label>
                  <input 
                    type="time" 
                    value={taskDueTime} 
                    onChange={e => setTaskDueTime(e.target.value)} 
                    className="w-full glass-panel border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    style={{ colorScheme: "dark" }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Status</label>
                  <select 
                    value={taskStatus} 
                    onChange={e => setTaskStatus(e.target.value)}
                    className="w-full glass-panel border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="Not Started">Not Started</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Assignee</label>
                  <select 
                    value={taskOwnerId} 
                    onChange={e => setTaskOwnerId(e.target.value)}
                    className="w-full glass-panel border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value={currentUser?.id}>Me ({currentUser?.name})</option>
                    {repsList.map(r => (
                      <option key={r.id} value={r.id}>{r.name || r.email}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Link to Account (Optional)</label>
                <select 
                  value={taskWhatId} 
                  onChange={e => setTaskWhatId(e.target.value)}
                  className="w-full glass-panel border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">-- No Linked Account (Company Task) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.zohoId}>{a.name}</option>
                  ))}
                </select>
              </div>
              {taskWhatId && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Link to Transaction (Optional)</label>
                  {loadingTransactions ? (
                    <p className="text-xs text-neutral-500  italic">Loading account documents...</p>
                  ) : (
                    <select
                      value={selectedTransaction}
                      onChange={e => handleTransactionChange(e.target.value)}
                      className="w-full glass-panel border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="">-- No Linked Document --</option>
                      {transactions.map(t => (
                        <option key={t.id || t.zohoId} value={t.id || t.zohoId}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              <div className="border-t border-[var(--border)] pt-3 mt-2">
                <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Linked Documents (Optional)</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Estimate ID</label>
                    <input 
                      type="text" 
                      value={taskEstimateId} 
                      onChange={e => setTaskEstimateId(e.target.value)} 
                      placeholder="e.g. EST-12345"
                      className="w-full glass-panel border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Sales Order ID</label>
                    <input 
                      type="text" 
                      value={taskSalesOrderId} 
                      onChange={e => setTaskSalesOrderId(e.target.value)} 
                      placeholder="e.g. SO-12345"
                      className="w-full glass-panel border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Quote ID</label>
                    <input 
                      type="text" 
                      value={taskQuoteId} 
                      onChange={e => setTaskQuoteId(e.target.value)} 
                      placeholder="e.g. Q-12345"
                      className="w-full glass-panel border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Invoice ID</label>
                    <input 
                      type="text" 
                      value={taskInvoiceId} 
                      onChange={e => setTaskInvoiceId(e.target.value)} 
                      placeholder="e.g. INV-12345"
                      className="w-full glass-panel border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
              <div className="border-t border-[var(--border)] pt-3 mt-2">
                <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">🔔 Reminder</h4>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Reminder Date</label>
                    <input 
                      type="date" 
                      value={reminderDate} 
                      onChange={e => setReminderDate(e.target.value)} 
                      className="w-full glass-panel border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                      style={{ colorScheme: "dark" }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Reminder Time</label>
                    <input 
                      type="time" 
                      value={reminderTime} 
                      onChange={e => setReminderTime(e.target.value)} 
                      className="w-full glass-panel border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                      style={{ colorScheme: "dark" }}
                    />
                  </div>
                </div>
                {reminderDate && (
                  <div>
                    <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Notify Via</label>
                    <div className="flex items-center gap-3">
                      {['push', 'sms', 'email'].map(method => (
                        <label key={method} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={reminderMethods.includes(method)}
                            onChange={e => {
                              if (e.target.checked) setReminderMethods(prev => [...prev, method])
                              else setReminderMethods(prev => prev.filter(m => m !== method))
                            }}
                            className="w-3.5 h-3.5 rounded border-white/20 bg-[#111214] text-emerald-500 focus:ring-emerald-500"
                          />
                          <span className="text-xs text-neutral-300 font-semibold">{method === 'push' ? '🔔 Push' : method === 'sms' ? '💬 SMS' : '📧 Email'}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="pt-4 flex justify-end gap-2 border-t border-[var(--border)]">
                <button 
                  type="button" 
                  onClick={() => setShowEditTaskModal(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={taskSaving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {taskSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Campaign Composer Modal */}
      {showCampaignModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCampaignModal(false)} />
          <div className="relative w-full max-w-lg glass-panel border border-[var(--border)] rounded-xl flex flex-col shadow-[0_22px_70px_rgba(0,0,0,0.38)] text-white z-[9999] p-6 max-h-[90vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-[var(--border)] mb-4">
              <div>
                <h3 className="font-bold text-lg text-white flex items-center gap-2">
                  <FiMail className="text-emerald-500 " />
                  <span>New Blast Campaign</span>
                </h3>
                <p className="text-neutral-500 text-xs mt-0.5">
                  Sending message to <span className="text-emerald-400 font-semibold">{selectedAccountIds.length}</span> selected {selectedAccountIds.length === 1 ? 'customer' : 'customers'}
                </p>
              </div>
              <button 
                onClick={() => setShowCampaignModal(false)} 
                className="text-neutral-400 hover:text-white glass-panel p-1.5 rounded-full transition-colors"
              >
                <FiX size={16} />
              </button>
            </div>

            {/* Success / Error Messages */}
            {campaignSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2">
                <FiCheckCircle size={16} className="shrink-0 animate-bounce" />
                <span>{campaignSuccess}</span>
              </div>
            )}
            {campaignError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
                <FiAlertCircle size={16} className="shrink-0" />
                <span>{campaignError}</span>
              </div>
            )}
            
            {campaignSending && campaignTotal > 0 && (
              <div className="mb-4">
                 <div className="flex justify-between text-xs text-neutral-400 mb-1">
                   <span>Sending...</span>
                   <span>{campaignProgress} / {campaignTotal}</span>
                 </div>
                 <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden mb-2">
                   <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${(campaignProgress / campaignTotal) * 100}%` }}></div>
                 </div>
                 <button
                   type="button"
                   onClick={() => { cancelCampaignRef.current = true }}
                   className="text-[10px] uppercase font-bold tracking-wider text-red-500 hover:text-red-400 py-1 transition-colors"
                 >
                   Cancel Remaining
                 </button>
              </div>
            )}

            <form onSubmit={handleSendCampaign} className="space-y-4">
              
              {/* Permission Check */}
              {dbUser?.canSendCampaigns === false && currentUser?.role !== 'ADMIN' && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
                  <FiAlertCircle size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <strong>Permission Denied</strong>
                    <p className="mt-1">You do not have permission to send campaigns. Please contact your administrator to enable this feature.</p>
                  </div>
                </div>
              )}

              {/* Campaign Name */}
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">Campaign Name *</label>
                <input 
                  type="text" 
                  value={campaignName} 
                  onChange={e => setCampaignName(e.target.value)} 
                  required
                  placeholder="e.g., Summer Blade Promotion 2026"
                  className="w-full glass-panel border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Predefined Templates */}
              {campaignTemplates.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">Load Template (Optional)</label>
                  <select
                    onChange={e => {
                      const t = campaignTemplates.find(ct => ct.id === e.target.value)
                      if (t) {
                        setCampaignName(t.name)
                        setCampaignText(t.content)
                        if (t.imageUrl) setCampaignImageUrl(t.imageUrl)
                        if (t.channel) setCampaignChannel(t.channel)
                      }
                    }}
                    className="w-full glass-panel border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value="">-- Select a template --</option>
                    {campaignTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.channel})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Channel & Options */}
              <div className="grid grid-cols-3 gap-2">
                {(["SMS", "WHATSAPP", "EMAIL"] as const).map(channel => (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => setCampaignChannel(channel)}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      campaignChannel === channel 
                        ? "bg-emerald-600 border-emerald-500 text-white  shadow-emerald-950/20" 
                        : "glass-panel border-[var(--border)] text-neutral-400 hover:text-white hover:border-neutral-600"
                    }`}
                  >
                    {channel === "SMS" && <FiMessageSquare size={13} />}
                    {channel === "WHATSAPP" && <FiPhoneCall size={13} />}
                    {channel === "EMAIL" && <FiMail size={13} />}
                    <span>{channel}</span>
                  </button>
                ))}
              </div>

              {/* Sender Number Selection (SMS Only) */}
              {campaignChannel === "SMS" && zohoNumbers.length > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">Sender Number *</label>
                    <a href="/admin/communications" target="_blank" className="text-xs font-semibold text-sky-400 hover:text-sky-300">
                      Manage Numbers &rarr;
                    </a>
                  </div>
                  <select
                    value={selectedZohoNumber}
                    onChange={e => setSelectedZohoNumber(e.target.value)}
                    className="w-full glass-panel border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    required
                  >
                    {zohoNumbers.map(n => (
                      <option key={n.number} value={n.number}>
                        {n.name} ({n.number})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* AI Magic */}
              <div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                  <FiCommand size={16} />
                  <span>AI Magic Generator</span>
                </div>
                <div>
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Describe what you want to say or the image you want..."
                    className="w-full glass-panel border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateAiText}
                    disabled={generatingAiText || !aiPrompt}
                    className="flex-1 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {generatingAiText ? "Generating..." : "Generate Ad Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateAiImage}
                    disabled={generatingAiImage || !aiPrompt}
                    className="flex-1 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {generatingAiImage ? "Generating..." : "Generate Ad Image"}
                  </button>
                </div>
              </div>

              {/* Message Text */}
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">Message Content</label>
                <textarea 
                  value={campaignText} 
                  onChange={e => setCampaignText(e.target.value)} 
                  placeholder={
                    campaignChannel === "EMAIL" 
                      ? "Write your email message..."
                      : "Write your text message (SMS/WhatsApp)..."
                  }
                  rows={4}
                  className="w-full glass-panel border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Image Attachment (Upload or select) */}
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">Image / Media Attachment</label>
                <div className="space-y-3">
                  {campaignImageUrl ? (
                    /* Image preview */
                    <div className="relative rounded-xl border border-[var(--border)] overflow-hidden bg-black/25 max-h-[160px] flex items-center justify-center p-2 group">
                      {campaignImageUrl.startsWith("data:") ? (
                        <img 
                          src={campaignImageUrl} 
                          alt="Campaign Preview" 
                          className="max-h-[140px] rounded object-contain"
                        />
                      ) : (
                        <div className="py-6 px-4 flex flex-col items-center gap-1.5">
                          <FiFileText size={28} className="text-sky-400 " />
                          <span className="text-xs text-neutral-300 truncate max-w-[280px]">
                            {campaignImageUrl.split("/").pop()}
                          </span>
                        </div>
                      )}
                      {/* Delete overlay */}
                      <button 
                        type="button"
                        onClick={handleClearImage}
                        className="absolute top-2 right-2 p-1.5 bg-red-600 hover:bg-red-500 rounded-full text-white shadow transition-all opacity-0 group-hover:opacity-100"
                        title="Remove attachment"
                      >
                        <FiTrash2 size={13} />
                      </button>
                    </div>
                  ) : (
                    /* Selector triggers */
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col items-center justify-center py-4 px-3 glass-panel hover:bg-neutral-800 border border-dashed border-[var(--border)] hover:border-neutral-600 rounded-xl cursor-pointer transition-colors group">
                        <FiUploadCloud className="text-neutral-500 group-hover:text-emerald-400 transition-colors mb-1" size={18} />
                        <span className="text-[10px] font-semibold text-neutral-400">Upload custom file</span>
                        <input 
                          type="file" 
                          accept="image/*,application/pdf"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAssetSelector(true)
                          fetchMediaAssets()
                        }}
                        className="flex flex-col items-center justify-center py-4 px-3 glass-panel hover:bg-neutral-800 border border-dashed border-[var(--border)] hover:border-neutral-600 rounded-xl transition-colors group"
                      >
                        <FiPaperclip className="text-neutral-500 group-hover:text-emerald-400 transition-colors mb-1" size={18} />
                        <span className="text-[10px] font-semibold text-neutral-400">Select library asset</span>
                      </button>
                    </div>
                  )}

                  {/* Preloaded Asset Selector dropdown list */}
                  {showAssetSelector && (
                    <div className="bg-black/25/60 border border-[var(--border)] rounded-xl p-3 max-h-[180px] overflow-y-auto space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="flex justify-between items-center pb-1.5 border-b border-[var(--border)] text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                        <span>Select Media Asset</span>
                        <button 
                          type="button" 
                          onClick={() => setShowAssetSelector(false)}
                          className="text-neutral-500 hover:text-white"
                        >
                          Hide
                        </button>
                      </div>
                      {loadingMedia ? (
                        <div className="py-4 text-center text-xs text-neutral-500 ">Loading library assets...</div>
                      ) : mediaAssets.length === 0 ? (
                        <div className="py-4 text-center text-xs text-neutral-600">No assets in library.</div>
                      ) : (
                        <div className="divide-y divide-neutral-900">
                          {mediaAssets.map((asset: any) => (
                            <button
                              key={asset.id || asset.title}
                              type="button"
                              onClick={() => {
                                setCampaignImageUrl(asset.url)
                                setShowAssetSelector(false)
                              }}
                              className="w-full text-left py-2 hover:glass-panel px-1 rounded flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {asset.type === 'Image' ? <FiImage className="text-emerald-400 shrink-0" size={12} /> : <FiFileText className="text-sky-400 shrink-0" size={12} />}
                                <span className="truncate font-semibold text-neutral-200">{asset.title}</span>
                              </div>
                              <span className="text-[9px] text-neutral-500 shrink-0">{asset.size}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Buttons */}
              <div className="pt-4 flex justify-end gap-2 border-t border-[var(--border)]">
                <button 
                  type="button" 
                  disabled={campaignSending}
                  onClick={() => setShowCampaignModal(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={campaignSending || (!campaignText && !campaignImageUrl) || (dbUser?.canSendCampaigns === false && currentUser?.role !== 'ADMIN')}
                  onClick={() => {
                    if (dbUser?.canSendCampaigns === false && currentUser?.role !== 'ADMIN') {
                      alert("You do not have permission to send campaigns. Please contact an administrator.");
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white  shadow-emerald-950/20 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {campaignSending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <FiMail size={14} />
                      Send Blast Campaign
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {showCallCampaignModal && createPortal(
        <SalesCallCampaignModal
          accounts={accounts.filter(a => selectedAccountIds.includes(a.id))}
          onClose={() => setShowCallCampaignModal(false)}
          onRefresh={fetchLocalData}
        />,
        document.body
      )}
      {/* ── Invoice Details Modal ── */}
      {viewingInvoice && (
        <InvoiceDetailsModal 
          invoice={viewingInvoice} 
          type={viewingDocType}
          onClose={() => setViewingInvoice(null)} 
        />
      )}
    </div>
  )
}

