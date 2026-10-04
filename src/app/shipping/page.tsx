"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { createPortal } from "react-dom"
import { FiTruck, FiBox, FiPackage, FiCheck, FiSearch, FiMapPin, FiExternalLink, FiChevronDown, FiChevronUp, FiRefreshCw, FiDownloadCloud, FiDollarSign, FiX, FiEdit2, FiPlus, FiTrash2, FiPrinter, FiShield, FiXCircle, FiFileText, FiLink, FiCopy, FiScissors, FiAlertTriangle, FiUser, FiCalendar, FiClock, FiCheckSquare, FiSquare, FiSend, FiInfo, FiLayers } from "react-icons/fi"
import { CreatePackageModal } from "@/components/CreatePackageModal"
import { CreateDropshipmentModal } from "@/components/CreateDropshipmentModal"
import { BatchDropshipModal } from "@/components/BatchDropshipModal"
import { toast } from 'react-hot-toast';
import { PeriodSelector, isInPeriod, type PeriodValue } from "@/components/PeriodSelector"
import { financialZohoLineItems } from "@/lib/zoho-line-items"
import { getZohoBooksUrl } from "@/lib/zoho-urls"

type ShipStatus = "all" | "needs_packaging" | "packaged" | "shipped" | "delivered" | "dropship"

interface ShippingOrder {
  id: string
  zohoId: string
  soNumber: string
  customerName: string
  customerPhone?: string
  customerEmail?: string
  accountId: string
  orderDate: string
  amount: number
  status: string
  shipStatus: ShipStatus
  shippingAddress: any
  billingAddress?: any
  lineItemCount: number
  lineItemNames: string[]
  lineItems?: { name: string; sku: string; quantity: number; salesperson?: string }[]
  salesperson: string
  shippingCost: number
  packages: PackageInfo[]
  dropshipments: DropshipInfo[]
}

interface PackageInfo {
  id: string
  zohoId: string
  packageNumber: string
  salesOrderNumber?: string
  date: string
  status: string
  carrier: string
  trackingNumber: string
  shippingCharge: number
  items: any
  easyshipShipmentId?: string | null
  salesperson?: string
}

interface DropshipInfo {
  id: string
  zohoId: string
  poNumber?: string
  salesOrderId?: string
  salesOrderNumber?: string
  vendorName: string
  salesperson?: string
  shipToName?: string
  shippingAddress?: string
  referenceNumber?: string
  date: string
  total: number
  status: string
  carrier?: string
  trackingNumber: string
  shippingCharge?: number
  lineItems?: Array<{ name: string; sku: string; quantity: number; rate: number; salesperson?: string }>
}

const STATUS_TABS: { key: ShipStatus; label: string; icon: any; color: string; bg: string }[] = [
  { key: "all", label: "All Orders", icon: FiTruck, color: "text-neutral-300", bg: "bg-neutral-800" },
  { key: "needs_packaging", label: "Needs Packaging", icon: FiBox, color: "text-amber-400", bg: "bg-amber-950/50" },
  { key: "packaged", label: "Packaged", icon: FiPackage, color: "text-blue-400", bg: "bg-blue-950/50" },
  { key: "shipped", label: "Shipped", icon: FiTruck, color: "text-purple-400", bg: "bg-purple-950/50" },
  { key: "delivered", label: "Delivered", icon: FiCheck, color: "text-emerald-400", bg: "bg-emerald-950/50" },
  { key: "dropship", label: "Vendor Dropships", icon: FiLayers, color: "text-cyan-400", bg: "bg-cyan-950/50" },
]


function getTrackingUrl(carrier: string, tracking: string): string | null {
  if (!tracking) return null
  const c = carrier?.toLowerCase() || ""
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${tracking}`
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${tracking}`
  if (c.includes("usps")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tracking}`
  if (c.includes("dhl")) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${tracking}`
  if (c.includes("amazon")) return `https://track.amazon.com/tracking/${tracking}`
  return null
}

function formatAddress(addr: any): string {
  if (!addr) return "--"
  if (typeof addr === "string") return addr
  const street = addr.address || addr.street || addr.street1 || addr.shippingStreet || ""
  const parts = [street, addr.street2, addr.city, addr.state, addr.zip || addr.code, addr.country].filter(Boolean)
  return parts.join(", ") || "--"
}

export default function ShippingPage() {
  const [orders, setOrders] = useState<ShippingOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<ShipStatus>("needs_packaging")
  const [search, setSearch] = useState("")
  // counts are fetched independently of the active tab so they
  // always reflect totals for ALL statuses and never change on tab click.
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  // Filter & Sort State
  const [filterSalesperson, setFilterSalesperson] = useState("")
  const [filterCarrier, setFilterCarrier] = useState("")
  const [sortBy, setSortBy] = useState("orderDate")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [shipPeriod, setShipPeriod] = useState<PeriodValue>("all")
  const [shipCustomStart, setShipCustomStart] = useState("")
  const [shipCustomEnd, setShipCustomEnd] = useState("")

  // Dynamic Metadata
  const [isAdmin, setIsAdmin] = useState(false)
  const [availableSalespersons, setAvailableSalespersons] = useState<string[]>([])
  const [availableCarriers, setAvailableCarriers] = useState<string[]>([])
  const [businessDefaults, setBusinessDefaults] = useState<any>(null)

  // Tracking modal state
  const [trackingModal, setTrackingModal] = useState<{ packageId: string; carrier: string; tracking: string } | null>(null)
  const [trackingSubmitting, setTrackingSubmitting] = useState(false)

  // Package & Dropship creation state
  const [packageModal, setPackageModal] = useState<{ salesOrderId: string; lineItems: any[] } | null>(null)
  const [dropshipModal, setDropshipModal] = useState<{ salesOrderId: string; lineItems: any[] } | null>(null)
  const [batchDropshipModalOpen, setBatchDropshipModalOpen] = useState(false)
  const [fetchingLineItems, setFetchingLineItems] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncingTracking, setSyncingTracking] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [fetchingLabelPkgId, setFetchingLabelPkgId] = useState<string | null>(null)

  // Rate Calculator State
  const [calcExpanded, setCalcExpanded] = useState(false)
  const [calcForm, setCalcForm] = useState({
    zip: "",
    city: "",
    state: "",
    country: "US",
    weight: "",
    length: "",
    width: "",
    height: "",
    value: ""
  })
  const [findBestDeal, setFindBestDeal] = useState(false)
  const [calcLoading, setCalcLoading] = useState(false)
  const [calcRates, setCalcRates] = useState<any>(null)
  const [calcSort, setCalcSort] = useState<"price" | "speed">("price")

  // Vendor/Customer lookup state
  const [originVendorSearch, setOriginVendorSearch] = useState('')
  const [originVendorResults, setOriginVendorResults] = useState<any[]>([])
  const [selectedVendor, setSelectedVendor] = useState<any>(null)
  const [showVendorDropdown, setShowVendorDropdown] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

  // Debounced vendor search
  useEffect(() => {
    if (!originVendorSearch || originVendorSearch.length < 2) { setOriginVendorResults([]); return }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shipping/lookup?type=vendor&q=${encodeURIComponent(originVendorSearch)}`)
        const data = await res.json()
        if (data.results) setOriginVendorResults(data.results)
      } catch {}
    }, 300)
    return () => clearTimeout(timer)
  }, [originVendorSearch])

  // Debounced customer search
  useEffect(() => {
    if (!customerSearch || customerSearch.length < 2) { setCustomerResults([]); return }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shipping/lookup?type=customer&q=${encodeURIComponent(customerSearch)}`)
        const data = await res.json()
        if (data.results) setCustomerResults(data.results)
      } catch {}
    }, 300)
    return () => clearTimeout(timer)
  }, [customerSearch])

  const handleCheckRates = async () => {
    if (!calcForm.zip || !calcForm.weight) {
      toast.error("ZIP and Weight are required")
      return
    }
    setCalcLoading(true)
    setCalcRates(null)
    try {
      const res = await fetch("/api/shipping/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zip: calcForm.zip,
          city: calcForm.city,
          state: calcForm.state,
          country: calcForm.country,
          originAddress: selectedVendor ? {
            zip: selectedVendor.zip,
            city: selectedVendor.city,
            state: selectedVendor.state,
            country: selectedVendor.country || 'US'
          } : undefined,
          weight: parseFloat(calcForm.weight) || 1,
          length: parseFloat(calcForm.length) || undefined,
          width: parseFloat(calcForm.width) || undefined,
          height: parseFloat(calcForm.height) || undefined,
          declaredValue: parseFloat(calcForm.value) || 100,
          findBestDeal
        })
      })
      const data = await res.json()
      if (data.success) {
        setCalcRates(data)
      } else {
        toast.error("Failed to get rates: " + (data.error || "Unknown error"))
      }
    } catch (e: any) {
      toast.error("Error: " + e.message)
    } finally {
      setCalcLoading(false)
    }
  }

  const sortedRates = useMemo(() => {
    if (!calcRates?.rates) return []
    const rates = [...calcRates.rates]
    if (calcSort === "price") {
      rates.sort((a: any, b: any) => (a.totalCharge || 0) - (b.totalCharge || 0))
    } else {
      rates.sort((a: any, b: any) => (a.minDeliveryTime || 0) - (b.minDeliveryTime || 0))
    }
    return rates
  }, [calcRates, calcSort])

  const handleSyncSalesOrderDetail = async (zohoId: string) => {
    setFetchingLineItems(zohoId)
    try {
      const res = await fetch("/api/shipping/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "syncSalesOrder",
          salesOrderId: zohoId
        })
      })
      const data = await res.json()
      if (data.success) {
        await fetchOrders()
      } else {
        toast.error("Failed to sync items: " + data.error)
      }
    } catch (e: any) {
      console.error("Failed to sync items:", e)
      toast.error("Failed to sync items: " + e.message)
    } finally {
      setFetchingLineItems(null)
    }
  }

  const handleGetLabelFromEasyShip = async (pkg: PackageInfo) => {
    setFetchingLabelPkgId(pkg.id)
    const loadingToast = toast.loading('Retrieving label from EasyShip...')
    try {
      const pkgItems = (pkg.items as any) || {}
      const res = await fetch('/api/shipping/refresh-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: pkg.id,
          trackingNumber: pkg.trackingNumber,
          easyshipShipmentId: pkg.easyshipShipmentId || pkgItems.easyshipShipmentId,
          packageNumber: pkg.packageNumber,
          salesOrderNumber: pkg.salesOrderNumber
        })
      })
      const data = await res.json()
      if (data.success) {
        if (data.labelUrl) {
          toast.success('Label retrieved successfully!', { id: loadingToast })
          window.open(data.labelUrl, '_blank')
        } else {
          toast.success(`Shipment linked (${data.shipmentState || 'synced'}), but label document is pending.`, { id: loadingToast })
        }
        await fetchOrders()
        await fetchCounts()
      } else {
        toast.error(data.error || 'Failed to retrieve label from EasyShip', { id: loadingToast })
      }
    } catch (err: any) {
      toast.error(err.message || 'Error communicating with EasyShip', { id: loadingToast })
    } finally {
      setFetchingLabelPkgId(null)
    }
  }

  const handleExpandOrder = async (orderId: string) => {
    const isExpanded = expandedOrder === orderId
    if (isExpanded) {
      setExpandedOrder(null)
      return
    }

    setExpandedOrder(orderId)

    const order = orders.find(o => o.id === orderId)
    // Auto-fetch PO details for dropshipments that have no line items
    if (order?.dropshipments?.length) {
      for (const ds of order.dropshipments) {
        if (!ds.lineItems || ds.lineItems.length === 0) {
          try {
            const res = await fetch(`/api/shipping/po-details?poZohoId=${ds.zohoId}`)
            const data = await res.json()
            if (data.success && data.lineItems?.length) {
              // Update the order in state with the fetched line items
              setOrders(prev => prev.map(o => {
                if (o.id !== orderId) return o
                return {
                  ...o,
                  dropshipments: o.dropshipments.map(d =>
                    d.zohoId === ds.zohoId
                      ? {
                          ...d,
                          lineItems: data.lineItems,
                          poNumber: data.poNumber || d.poNumber,
                          salesOrderNumber: data.salesOrderNumber || d.salesOrderNumber,
                          shipToName: data.shipToName || d.shipToName,
                          trackingNumber: data.trackingNumber || d.trackingNumber,
                          shippingCharge: data.shippingCharge || d.shippingCharge
                        }
                      : d
                  )
                }
              }))
            }
          } catch (e) {
            console.error('Failed to fetch PO details for', ds.zohoId, e)
          }
        }
      }
    }
  }

  // fetchCounts: always fetches with status=all so the badge counts on every
  // tab reflect the TOTAL for that status, regardless of which tab is active.
  // This runs on mount and when search/salesperson/carrier filters change, but
  // NOT when the user merely switches tabs — so the numbers stay stable.
  const fetchCounts = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        status: "all",
        search,
        salesperson: filterSalesperson,
        carrier: filterCarrier,
        sortBy: "orderDate",
        sortDir: "desc",
        limit: "200"
      })
      const res = await fetch(`/api/shipping?${params}`)
      const data = await res.json()
      if (data.success) {
        setCounts(data.counts)
        setIsAdmin(!!data.isAdmin)
        if (data.availableSalespersons) setAvailableSalespersons(data.availableSalespersons)
        if (data.availableCarriers) setAvailableCarriers(data.availableCarriers)
      }
    } catch (e) {
      console.error("Failed to fetch shipping counts:", e)
    }
  }, [search, filterSalesperson, filterCarrier])

  // fetchOrders: fetches only the orders for the current active tab.
  // Does NOT update counts so switching tabs never mutates the badge numbers.
  const fetchOrders = useCallback(async () => {
    if (orders.length === 0) setLoading(true)
    else setRefreshing(true)
    try {
      const params = new URLSearchParams({
        status: activeTab,
        search,
        salesperson: filterSalesperson,
        carrier: filterCarrier,
        sortBy,
        sortDir,
        limit: "200"
      })
      const res = await fetch(`/api/shipping?${params}`)
      const data = await res.json()
      if (data.success) {
        setOrders(data.data)
        // Don't call setCounts here — counts are owned by fetchCounts
      }
    } catch (e) {
      console.error("Failed to fetch shipping data:", e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeTab, search, filterSalesperson, filterCarrier, sortBy, sortDir])

  // On mount and filter change: refresh both counts and orders
  useEffect(() => { fetchCounts() }, [fetchCounts])
  // On tab/sort change: refresh orders only (counts stay stable)
  useEffect(() => { fetchOrders() }, [fetchOrders])

  // ── Background Sync from Zoho ──────────────────────────────────────────
  // Calls a Netlify background function (returns 202 immediately, no timeout).
  // Polls the status endpoint every 5 s until the sync finishes.
  const [syncDays, setSyncDays] = useState(30)
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = () => {
    if (syncPollRef.current) { clearInterval(syncPollRef.current); syncPollRef.current = null }
  }

  const handleSyncPackages = async () => {
    setSyncing(true)
    setSyncResult(null)
    stopPolling()

    try {
      // Use unified sync-now API for all shipping-relevant tables
      const res = await fetch("/api/sync-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tables: ["packages", "purchaseOrders", "salesOrders"],
          force: true
        })
      })

      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          const counts = Object.entries(data.results || {})
            .map(([table, info]: [string, any]) => {
              if (info.skipped) return `${table}: ${info.skipped}`
              if (info.error) return `${table}: ⚠ ${info.error}`
              return `${table}: ${info.synced} updated`
            })
            .join(", ")
          const totalSynced = Object.values(data.results || {}).reduce((sum: number, info: any) => sum + (info.synced || 0), 0)
          setSyncResult(`✅ Sync complete (${totalSynced} records) — ${counts}`)
          fetchCounts()
          fetchOrders()
        } else {
          setSyncResult(`❌ Sync failed: ${data.error || "Unknown error"}`)
        }
      } else {
        const text = await res.text()
        setSyncResult(`❌ Failed to sync (${res.status}): ${text.substring(0, 120)}`)
      }
      setSyncing(false)
    } catch (e: any) {
      setSyncResult(`❌ ${e.message}`)
      setSyncing(false)
    }
  }

  // Carrier tracking sync handler
  const handleSyncTracking = async () => {
    setSyncingTracking(true)
    try {
      toast.loading("Checking live carrier tracking...", { id: "sync-tracking" })
      const res = await fetch("/api/shipping/sync-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxPackages: 30 })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(
          `Carrier sync complete: ${data.syncedCount} inspected, ${data.updatedCount} updated, ${data.deliveredCount} delivered!`,
          { id: "sync-tracking", duration: 5000 }
        )
        fetchOrders()
        fetchCounts()
      } else {
        toast.error(`Carrier sync failed: ${data.error || "Unknown error"}`, { id: "sync-tracking" })
      }
    } catch (err: any) {
      toast.error(`Carrier sync error: ${err.message}`, { id: "sync-tracking" })
    } finally {
      setSyncingTracking(false)
    }
  }

  // Cleanup polling on unmount
  useEffect(() => () => stopPolling(), [])

  // Fetch SO line items from Zoho for package creation
  const fetchLineItems = async (zohoId: string, action: "package" | "dropship") => {
    setFetchingLineItems(zohoId)
    try {
      const res = await fetch(`/api/zoho-fulfillment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "GetSalesOrder", salesOrderId: zohoId }),
      })
      const data = await res.json()
      if (data.success && data.lineItems) {
        if (action === "package") {
          setPackageModal({ salesOrderId: zohoId, lineItems: data.lineItems })
        } else {
          setDropshipModal({ salesOrderId: zohoId, lineItems: data.lineItems })
        }
      } else {
        toast.error("Failed to load line items: " + (data.error || data.message || "Unknown error"))
      }
    } catch (e: any) {
      toast.error("Error: " + e.message)
    } finally {
      setFetchingLineItems(null)
    }
  }

  // Add tracking
  const handleAddTracking = async () => {
    if (!trackingModal) return
    setTrackingSubmitting(true)
    try {
      const res = await fetch("/api/shipping/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addTracking",
          packageId: trackingModal.packageId,
          carrier: trackingModal.carrier,
          trackingNumber: trackingModal.tracking,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setTrackingModal(null)
        fetchOrders()
      } else {
        toast.error("Failed: " + data.error)
      }
    } catch (e: any) {
      toast.error("Error: " + e.message)
    } finally {
      setTrackingSubmitting(false)
    }
  }

  // Mark shipped/delivered
  const handleStatusChange = async (packageId: string, action: "markShipped" | "markDelivered") => {
    try {
      const res = await fetch("/api/shipping/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, packageId }),
      })
      const data = await res.json()
      if (data.success) fetchOrders()
      else toast.error("Failed: " + data.error)
    } catch (e: any) {
      toast.error("Error: " + e.message)
    }
  }

  // Compilation item filter
  const [compilationSkuFilter, setCompilationSkuFilter] = useState<string | null>(null)

  // Client-side period filter on orderDate + compilation SKU filter
  const filteredOrders = useMemo(() => {
    let result = orders
    if (shipPeriod !== 'all') {
      result = result.filter(o => isInPeriod((o as any).orderDate || (o as any).order_date || (o as any).date, shipPeriod, shipCustomStart, shipCustomEnd))
    }
    if (compilationSkuFilter) {
      result = result.filter(o =>
        o.shipStatus === 'packaged' &&
        Array.isArray(o.lineItems) &&
        o.lineItems.some(item => (item.sku || item.name || 'Unknown SKU') === compilationSkuFilter)
      )
    }
    return result
  }, [orders, shipPeriod, shipCustomStart, shipCustomEnd, compilationSkuFilter])

  // Compilation of items that are packaged but need shipped
  const getPackagedButNeedShippedItemsCompilation = () => {
    const compilation: Record<string, { sku: string; name: string; quantity: number; salespersons: string[] }> = {}
    
    const recordItem = (item: any, rep?: string) => {
      const sku = item.sku || item.name || "Unknown SKU"
      if (!compilation[sku]) {
        compilation[sku] = {
          sku,
          name: item.name || item.sku || "Unknown Item",
          quantity: 0,
          salespersons: []
        }
      }
      compilation[sku].quantity += Number(item.quantity || 0)
      const salesRep = (rep || item.salesperson || "").trim()
      if (salesRep && !compilation[sku].salespersons.includes(salesRep)) {
        compilation[sku].salespersons.push(salesRep)
      }
    }

    filteredOrders.forEach(order => {
      const unshippedPkgs = (order.packages || []).filter(
        p => p.status?.toLowerCase() !== "shipped" && p.status?.toLowerCase() !== "delivered"
      )

      if (unshippedPkgs.length > 0) {
        unshippedPkgs.forEach(pkg => {
          const pkgItems = financialZohoLineItems(
            pkg.items?.lineItems || pkg.items?.line_items || (Array.isArray(pkg.items) ? pkg.items : [])
          )
          if (pkgItems.length > 0) {
            pkgItems.forEach((item: any) => {
              recordItem(item, pkg.salesperson || item.salesperson || order.salesperson)
            })
          }
        })
      } else if (order.shipStatus === "packaged" && Array.isArray(order.lineItems)) {
        order.lineItems.forEach(item => {
          recordItem(item, item.salesperson || order.salesperson)
        })
      }
    })
    return Object.values(compilation).sort((a, b) => b.quantity - a.quantity)
  }

  const compilationList = getPackagedButNeedShippedItemsCompilation()

  // ── Ship Now Modal State ─────────────────────────────────────────────────
  const [shipNowOpen, setShipNowOpen] = useState(false)
  const [shipNowPkg, setShipNowPkg] = useState<any>(null)
  const [shipNowOrder, setShipNowOrder] = useState<any>(null)
  const [shipNowRates, setShipNowRates] = useState<any[]>([])
  const [shipNowLoading, setShipNowLoading] = useState(false)
  const [shipNowBuying, setShipNowBuying] = useState(false)
  const [shipNowResult, setShipNowResult] = useState<any>(null)
  const [shipNowWeight, setShipNowWeight] = useState('5')
  const [shipNowDims, setShipNowDims] = useState({ length: '15', width: '15', height: '4' })
  const [shipNowBoxPreset, setShipNowBoxPreset] = useState<string>('')
  const [copiedLabelUrl, setCopiedLabelUrl] = useState(false)
  const [splitRecommendation, setSplitRecommendation] = useState<any>(null)
  const [splittingPackage, setSplittingPackage] = useState(false)
  const [markedPrinted, setMarkedPrinted] = useState(false)

  // ── Address Analysis & Surcharge State ─────────────────────────────────
  const [addressAnalysis, setAddressAnalysis] = useState<any>(null)
  const [editingAddressInline, setEditingAddressInline] = useState(false)
  const [inlineAddressZip, setInlineAddressZip] = useState('')
  const [inlineAddressStreet, setInlineAddressStreet] = useState('')

  // ── Batch Fulfillment Mode State ────────────────────────────────────────
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [batchProcessing, setBatchProcessing] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; logs: string[] }>({ current: 0, total: 0, logs: [] })

  // ── Carrier Pickup Scheduling State ─────────────────────────────────────
  const [pickupModalOpen, setPickupModalOpen] = useState(false)
  const [pickupCarrier, setPickupCarrier] = useState('FedEx')
  const [pickupDate, setPickupDate] = useState(() => new Date().toISOString().split('T')[0])
  const [pickupTimeSlot, setPickupTimeSlot] = useState('14:00 - 17:00')
  const [pickupNotes, setPickupNotes] = useState('Front Office / Dock Area')
  const [schedulingPickup, setSchedulingPickup] = useState(false)
  const [pickupResult, setPickupResult] = useState<any>(null)

  const triggerAutoPrintLabel = (url: string) => {
    if (!url) return
    let printUrl = url
    if (printUrl.includes('easyship.com')) {
      printUrl = printUrl.includes('page_size=')
        ? printUrl.replace(/page_size=[^&]+/, 'page_size=4x6')
        : printUrl + (printUrl.includes('?') ? '&' : '?') + 'page_size=4x6'
    }

    try {
      const iframeId = 'auto-print-label-frame'
      let iframe = document.getElementById(iframeId) as HTMLIFrameElement
      if (!iframe) {
        iframe = document.createElement('iframe')
        iframe.id = iframeId
        iframe.style.position = 'fixed'
        iframe.style.top = '-9999px'
        iframe.style.left = '-9999px'
        iframe.style.width = '1px'
        iframe.style.height = '1px'
        iframe.style.opacity = '0'
        document.body.appendChild(iframe)
      }
      iframe.src = printUrl
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
        } catch {
          window.open(printUrl, '_blank')
        }
      }
    } catch (err) {
      console.warn('Auto-print iframe failed, opening print window:', err)
      window.open(printUrl, '_blank')
    }
  }

  useEffect(() => {
    fetch('/api/admin/business-defaults')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.defaults) {
          setBusinessDefaults(data.defaults)
          setShipNowWeight(data.defaults.defaultShippingWeight.toString())
          setShipNowDims({
            length: data.defaults.defaultShippingLength.toString(),
            width: data.defaults.defaultShippingWidth.toString(),
            height: data.defaults.defaultShippingHeight.toString(),
          })
          if (availableCarriers.length === 0 && data.defaults.carriers) {
            setAvailableCarriers(data.defaults.carriers)
          }
        }
      })
      .catch(console.error)
  }, [])
  const [addingPreset, setAddingPreset] = useState(false)
  const [newPreset, setNewPreset] = useState({ label: '', l: '', w: '', h: '', wt: '' })
  const [customBoxPresets, setCustomBoxPresets] = useState<Array<{ id?: string; label: string; l: string; w: string; h: string; wt: string }>>([])

  const loadShippingPresets = useCallback(async () => {
    try {
      const response = await fetch('/api/shipping/presets', { cache: 'no-store' })
      const data = await response.json()
      if (response.ok) setCustomBoxPresets((data.presets || []).map((preset: any) => ({ id: preset.id, label: preset.name, l: String(preset.length), w: String(preset.width), h: String(preset.height), wt: String(preset.weight) })))
    } catch (error) { console.error('Shipping presets unavailable', error) }
  }, [])
  useEffect(() => { void loadShippingPresets() }, [loadShippingPresets])

  const saveCustomPreset = async () => {
    if (!newPreset.label || !newPreset.l || !newPreset.w || !newPreset.h) return
    const response = await fetch('/api/shipping/presets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newPreset.label, length: newPreset.l, width: newPreset.w, height: newPreset.h, weight: newPreset.wt || '5', scope: 'COMPANY' }) })
    const data = await response.json()
    if (!response.ok) return toast.error(data.error || 'Preset could not be saved')
    await loadShippingPresets()
    toast.success('Shared shipping preset saved')
    setNewPreset({ label: '', l: '', w: '', h: '', wt: '' })
    setAddingPreset(false)
  }

  const removeCustomPreset = async (idx: number) => {
    const preset = customBoxPresets[idx]
    if (!preset?.id) return
    const response = await fetch(`/api/shipping/presets?id=${encodeURIComponent(preset.id)}`, { method: 'DELETE' })
    const data = await response.json()
    if (!response.ok) return toast.error(data.error || 'Preset could not be removed')
    await loadShippingPresets()
  }
  const [editingDropship, setEditingDropship] = useState<string | null>(null)
  const [dropshipEdit, setDropshipEdit] = useState({ tracking: '', shippingCharge: '' })

  const saveDropshipEdit = async (poId: string) => {
    try {
      const res = await fetch('/api/shipping/update-dropship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poId,
          trackingNumber: dropshipEdit.tracking || undefined,
          shippingCharge: dropshipEdit.shippingCharge || undefined,
        })
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Dropshipment updated')
        setEditingDropship(null)
        fetchOrders()
      } else {
        toast.error(data.error || 'Failed to update')
      }
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    }
  }

  const fetchShipNowRates = async (
    order: any, 
    weight: string, 
    dims: { length: string; width: string; height: string }, 
    pkgOverride?: any,
    forceRefresh: boolean = false,
    presetOverride?: string
  ) => {
    setShipNowLoading(true)
    setShipNowRates([])
    setSplitRecommendation(null)
    const activePkg = pkgOverride || shipNowPkg
    const parsedWeight = parseFloat(weight);
    const parsedLength = parseFloat(dims.length);
    const parsedWidth = parseFloat(dims.width);
    const parsedHeight = parseFloat(dims.height);
    
    if (isNaN(parsedWeight) || isNaN(parsedLength) || isNaN(parsedWidth) || isNaN(parsedHeight)) {
      toast.error('Weight and dimensions are required');
      setShipNowLoading(false);
      return;
    }

    if (forceRefresh) {
      toast.loading('Saving box info & calculating live rates...', { id: 'rate-refresh' })
    }

    try {
      const destAddr = order.shippingAddress || {}
      const zip = destAddr.zip || destAddr.postal_code || ''
      const city = destAddr.city || ''
      const state = destAddr.state || ''
      
      if (!zip || !city || !state) {
        toast.error(`Missing shipping address fields — ${[!city && 'city', !state && 'state', !zip && 'zip'].filter(Boolean).join(', ')}. Sync from Zoho to update.`)
        setShipNowLoading(false)
        if (forceRefresh) toast.dismiss('rate-refresh')
        return
      }

      const pkgItemsList = financialZohoLineItems(
        activePkg?.items?.lineItems || activePkg?.items?.line_items || (Array.isArray(activePkg?.items) ? activePkg?.items : [])
      );
      
      const effectivePreset = presetOverride !== undefined ? presetOverride : shipNowBoxPreset;

      const res = await fetch('/api/shipping/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zip,
          city,
          state,
          country: destAddr.country || destAddr.country_alpha2 || 'US',
          weight: parsedWeight,
          length: parsedLength,
          width: parsedWidth,
          height: parsedHeight,
          declaredValue: 0.10,
          packageId: activePkg?.id,
          packageNumber: activePkg?.packageNumber,
          soNumber: order?.soNumber,
          items: pkgItemsList.length > 0 ? pkgItemsList : undefined,
          boxPreset: effectivePreset || undefined,
          saveBox: forceRefresh,
          forceRefresh: forceRefresh,
        })
      })
      const data = await res.json()
      if (forceRefresh) {
        toast.dismiss('rate-refresh')
      }
      if (!res.ok || data.error) {
        toast.error(`Rate error: ${data.error || `HTTP ${res.status}`}`)
        return
      }
      if (forceRefresh && data.savedBox) {
        toast.success(`Box (${parsedLength}"×${parsedWidth}"×${parsedHeight}", ${parsedWeight} lbs) saved & rates updated!`)
      }
      if (data.splitRecommendation) {
        setSplitRecommendation(data.splitRecommendation)
      }
      if (data.addressAnalysis) {
        setAddressAnalysis(data.addressAnalysis)
      } else {
        setAddressAnalysis(null)
      }
      if (data.rates && data.rates.length > 0) {
        const sorted = [...data.rates].sort((a: any, b: any) => (a.totalCharge || 999) - (b.totalCharge || 999))
        setShipNowRates(sorted)
      } else {
        toast.error('No rates returned — check shipping address fields')
      }

      // If box was saved to package, update local package state and orders array
      if (data.package && activePkg?.id) {
        setShipNowPkg(data.package)
        setOrders((prevOrders: any[]) => prevOrders.map(ord => {
          if (ord.id !== order?.id && ord.soNumber !== order?.soNumber) return ord
          return {
            ...ord,
            packages: (ord.packages || []).map((p: any) => 
              p.id === activePkg.id ? { ...p, ...data.package } : p
            )
          }
        }))
      }
    } catch (e: any) {
      if (forceRefresh) toast.dismiss('rate-refresh')
      console.error('Failed to get rates:', e)
      toast.error(`Rate fetch failed: ${e.message || 'Network error'}`)
    } finally {
      setShipNowLoading(false)
    }
  }

  const openShipNow = async (pkg: any, order: any) => {
    setShipNowPkg(pkg)
    setShipNowOrder(order)
    setShipNowResult(null)
    setSplitRecommendation(null)
    setAddressAnalysis(null)
    setEditingAddressInline(false)
    setInlineAddressStreet(order.shippingAddress?.address || order.shippingAddress?.street || '')
    setInlineAddressZip(order.shippingAddress?.zip || order.shippingAddress?.postal_code || '')
    setMarkedPrinted(false)
    setShipNowOpen(true)

    // Load saved box information if previously customized/saved for this package
    const savedDims = pkg?.items?.dimensions
    const initialDims = {
      length: String(savedDims?.length ?? shipNowDims.length ?? '15'),
      width: String(savedDims?.width ?? shipNowDims.width ?? '15'),
      height: String(savedDims?.height ?? shipNowDims.height ?? '4'),
    }
    const initialWeight = String(pkg?.items?.weight ?? (pkg?.weight ? String(pkg.weight) : shipNowWeight ?? '5'))
    const initialPreset = pkg?.items?.boxPreset || ''

    setShipNowDims(initialDims)
    setShipNowWeight(initialWeight)
    setShipNowBoxPreset(initialPreset)

    // Fetch rates with the package's dimensions and weight
    await fetchShipNowRates(order, initialWeight, initialDims, pkg, false, initialPreset)
  }

  const handleSplitPackage = async () => {
    if (!shipNowPkg || !shipNowOrder) return
    const pkgItems = financialZohoLineItems(
      shipNowPkg.items?.lineItems || shipNowPkg.items?.line_items || (Array.isArray(shipNowPkg.items) ? shipNowPkg.items : [])
    )

    setSplittingPackage(true)
    try {
      let box1Items: any[] = []
      let box2Items: any[] = []

      if (pkgItems.length > 1) {
        const half = Math.ceil(pkgItems.length / 2)
        box1Items = pkgItems.slice(0, half)
        box2Items = pkgItems.slice(half)
      } else if (pkgItems.length === 1 && (pkgItems[0].quantity > 1)) {
        const item = pkgItems[0]
        const q1 = Math.ceil(item.quantity / 2)
        const q2 = item.quantity - q1
        box1Items = [{ ...item, quantity: q1 }]
        box2Items = [{ ...item, quantity: q2 }]
      } else {
        box1Items = pkgItems
        box2Items = [{ description: 'Split Package 2', quantity: 1, weight: parseFloat(shipNowWeight) / 2 }]
      }

      const res = await fetch('/api/shipping/split-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: shipNowPkg.id,
          packageZohoId: shipNowPkg.zohoId,
          salesOrderZohoId: shipNowOrder.zohoId,
          salesOrderNumber: shipNowOrder.soNumber,
          box1Items,
          box2Items
        })
      })

      const data = await res.json()
      if (data.success) {
        toast.success(data.message || 'Package split into 2 successfully!')
        const newWeight = (Math.round((parseFloat(shipNowWeight) / 2) * 10) / 10).toString()
        const newHeight = Math.max(2, Math.round(parseFloat(shipNowDims.height) / 2)).toString()
        setShipNowWeight(newWeight)
        setShipNowDims(d => ({ ...d, height: newHeight }))
        setSplitRecommendation(null)
        await fetchOrders()
        await fetchCounts()
        if (data.originalPackage) {
          setShipNowPkg(data.originalPackage)
          await fetchShipNowRates(shipNowOrder, newWeight, { ...shipNowDims, height: newHeight }, data.originalPackage)
        }
      } else {
        toast.error('Failed to split: ' + (data.error || 'Unknown error'))
      }
    } catch (e: any) {
      toast.error('Split error: ' + e.message)
    } finally {
      setSplittingPackage(false)
    }
  }

  const handleBuyLabel = async (rate: any) => {
    if (!shipNowPkg || !shipNowOrder) return
    setShipNowBuying(true)
    const parsedWeight = parseFloat(shipNowWeight);
    const parsedLength = parseFloat(shipNowDims.length);
    const parsedWidth = parseFloat(shipNowDims.width);
    const parsedHeight = parseFloat(shipNowDims.height);
    
    if (isNaN(parsedWeight) || isNaN(parsedLength) || isNaN(parsedWidth) || isNaN(parsedHeight)) {
      toast.error('Weight and dimensions are required');
      setShipNowBuying(false);
      return;
    }

    try {
      const destAddr = shipNowOrder.shippingAddress || {}
      const pkgItemsList = financialZohoLineItems(
        shipNowPkg.items?.lineItems || shipNowPkg.items?.line_items || (Array.isArray(shipNowPkg.items) ? shipNowPkg.items : [])
      )
      const packedItems = (Array.isArray(pkgItemsList) && pkgItemsList.length > 0)
        ? pkgItemsList.map((li: any) => ({
            description: li.name || li.item_name || li.description || 'Item',
            sku: li.sku || li.sku_code || '',
            quantity: parseInt(li.quantity) || 1,
            declaredValue: 0.10,
            weight: parsedWeight / (pkgItemsList.length || 1),
          }))
        : (shipNowOrder.packages?.length === 1 && shipNowOrder.lineItems?.length > 0
          ? shipNowOrder.lineItems.map((li: any) => ({
              description: li.name || 'Order item',
              sku: li.sku || '',
              quantity: li.quantity || 1,
              declaredValue: 0.10,
              weight: parsedWeight / (shipNowOrder.lineItems.length || 1),
            }))
          : [{ description: 'Package contents', sku: '', quantity: 1, declaredValue: 0.10, weight: parsedWeight }])

      const res = await fetch('/api/shipping/ship-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: shipNowPkg.id,
          packageZohoId: shipNowPkg.zohoId,
          salesOrderZohoId: shipNowOrder.zohoId,
          easyshipShipmentId: shipNowPkg.items?.easyshipShipmentId || shipNowPkg.easyshipShipmentId || null,
          courierServiceId: rate.courierServiceId || rate.courierName,
          selectedRateCost: rate.totalCharge || 0,
          originAddress: null,
          destinationAddress: {
            address: destAddr.address || destAddr.street || '',
            city: destAddr.city || '',
            state: destAddr.state || '',
            zip: destAddr.zip || destAddr.postal_code || '',
            country: destAddr.country_alpha2 || 'US',
          },
          destinationContactName: shipNowOrder.customerName || 'Customer',
          weight: parsedWeight,
          dimensions: {
            length: parsedLength,
            width: parsedWidth,
            height: parsedHeight,
          },
          boxPreset: shipNowBoxPreset || undefined,
          items: packedItems,
          soNumber: shipNowOrder.soNumber,
          packageNumber: shipNowPkg.packageNumber || '',
          destinationContactPhone: shipNowOrder?.shippingAddress?.phone || '',
        })
      })
      const data = await res.json()
      if (data.success) {
        let labelUrl = data.labelUrl || ''
        if (labelUrl.includes('easyship.com')) {
          labelUrl = labelUrl.includes('page_size=')
            ? labelUrl.replace(/page_size=[^&]+/, 'page_size=4x6')
            : labelUrl + (labelUrl.includes('?') ? '&' : '?') + 'page_size=4x6'
        }

        const fullResult = {
          ...data,
          labelUrl,
          orderNumber: shipNowOrder.soNumber || shipNowOrder.computedInvoiceNumber || 'Order',
          soNumber: shipNowOrder.soNumber,
          packageNumber: shipNowPkg.packageNumber || 'Package',
          customerName: shipNowOrder.customerName || 'Customer',
          customerPhone: shipNowOrder.shippingAddress?.phone || shipNowOrder.account?.phone || '',
          customerEmail: shipNowOrder.account?.email || shipNowOrder.customerEmail || '',
          salesperson: shipNowOrder.salesperson || 'Unassigned',
          orderAmount: shipNowOrder.amount || 0,
          destinationAddress: {
            address: destAddr.address || destAddr.street || '',
            city: destAddr.city || '',
            state: destAddr.state || '',
            zip: destAddr.zip || destAddr.postal_code || '',
            country: destAddr.country_alpha2 || 'US',
          },
          weight: parsedWeight,
          dimensions: {
            length: parsedLength,
            width: parsedWidth,
            height: parsedHeight,
          },
          items: packedItems.map((it: any) => ({
            ...it,
            salesperson: it.salesperson || shipNowOrder.salesperson || 'Unassigned',
          })),
          courierName: data.courierName || rate.courierName,
          trackingNumber: data.trackingNumber,
          trackingPageUrl: data.trackingPageUrl,
          childTrackingNumbers: data.childTrackingNumbers || [],
          parcelCount: data.parcelCount || 1,
          totalCharge: data.totalCharge ?? rate.totalCharge ?? 0,
          fuelSurcharge: data.fuelSurcharge || rate.fuelSurcharge || 0,
          residentialSurcharge: data.residentialSurcharge || rate.residentialSurcharge || 0,
          insuranceFee: data.insuranceFee || rate.insuranceFee || 0,
          discountAmount: data.discountAmount || rate.discountAmount || 0,
          minDeliveryTime: data.minDeliveryTime || rate.minDeliveryTime,
          maxDeliveryTime: data.maxDeliveryTime || rate.maxDeliveryTime,
          labelState: data.labelState || 'created',
          shippingDocuments: data.shippingDocuments || [],
          easyshipShipmentId: data.easyshipShipmentId,
          purchasedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        }
        setShipNowResult(fullResult)
        setMarkedPrinted(data.labelState === 'printed')

        // Trigger automatic 4x6 label print to Zebra / default printer immediately
        if (labelUrl) {
          triggerAutoPrintLabel(labelUrl)
        }
        // If other documents exist (e.g. customs or packing slip), open them
        if (Array.isArray(data.shippingDocuments) && data.shippingDocuments.length > 1) {
          data.shippingDocuments.slice(1).forEach((doc: any, i: number) => {
            if (doc.url && doc.category !== 'label') {
              setTimeout(() => { window.open(doc.url, '_blank') }, (i + 1) * 800)
            }
          })
        }

        if (data.warning) {
          toast.error(data.warning, { duration: 8000 })
        } else {
          toast.success('Label purchased! Tracking: ' + data.trackingNumber)
        }
        // Refresh orders list
        setTimeout(() => { fetchOrders(); fetchCounts(); }, 1000)
      } else {
        toast.error('Failed: ' + (data.error || 'Unknown error'))
      }
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setShipNowBuying(false)
    }
  }

  const handleCopyShipmentSummary = (result: any) => {
    if (!result) return
    const itemsLines = Array.isArray(result.items)
      ? result.items.map((it: any) => `  • ${it.quantity || 1}x ${it.sku || it.name || it.description || 'Item'} (Rep: ${it.salesperson || result.salesperson || 'Unassigned'})`).join('\n')
      : '  • Packed Items'

    const textLines = [
      `📦 SHIPMENT CONFIRMED — ${result.soNumber || result.orderNumber || 'Order'}`,
      `========================================`,
      `Sales Order: ${result.soNumber || '--'}`,
      `Package #: ${result.packageNumber || '--'}`,
      `Sales Rep: ${result.salesperson || 'Unassigned'}`,
      `Customer: ${result.customerName || '--'}`,
      `Phone / Email: ${result.customerPhone || 'On File'} / ${result.customerEmail || 'On File'}`,
      `Destination: ${[result.destinationAddress?.address, result.destinationAddress?.city, result.destinationAddress?.state, result.destinationAddress?.zip].filter(Boolean).join(', ')}`,
      `Carrier & Service: ${result.courierName || '--'}`,
      `Master Tracking #: ${result.trackingNumber || '--'}`,
      ...(Array.isArray(result.childTrackingNumbers) && result.childTrackingNumbers.length > 0 ? [`Child Tracking #s: ${result.childTrackingNumbers.join(', ')}`] : []),
      `Parcels: ${result.parcelCount || 1} Box (${result.weight} lbs)`,
      `Total Cost: $${result.totalCharge?.toFixed(2) || '0.00'}${result.residentialSurcharge > 0 ? ` (Includes +$${result.residentialSurcharge.toFixed(2)} Residential Surcharge)` : ''}`,
      `Delivery ETA: ${result.minDeliveryTime ? `${result.minDeliveryTime}-${result.maxDeliveryTime} business days` : 'Standard Delivery'}`,
      `----------------------------------------`,
      `Shipped Items:`,
      itemsLines,
      `----------------------------------------`,
      `Label URL: ${result.labelUrl || 'Available in Shipping Center'}`,
      `EasyShip ID: ${result.easyshipShipmentId || '--'}`
    ].join('\n')

    if (navigator?.clipboard) {
      navigator.clipboard.writeText(textLines)
      toast.success('Complete shipment summary copied to clipboard!')
    }
  }

  // ── Batch Fulfillment Functions ──────────────────────────────────────────
  const toggleSelectOrder = (orderId: string, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation()
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedOrderIds.size === filteredOrders.length && filteredOrders.length > 0) {
      setSelectedOrderIds(new Set())
    } else {
      setSelectedOrderIds(new Set(filteredOrders.map(o => o.id)))
    }
  }

  const runBatchFulfillment = async () => {
    const ordersToProcess = orders.filter(o => selectedOrderIds.has(o.id))
    if (ordersToProcess.length === 0) return
    setBatchProcessing(true)
    setBatchProgress({ current: 0, total: ordersToProcess.length, logs: [] })

    for (let i = 0; i < ordersToProcess.length; i++) {
      const ord = ordersToProcess[i]
      const pkg = ord.packages[0]
      setBatchProgress(p => ({
        ...p,
        current: i + 1,
        logs: [...p.logs, `Processing ${ord.soNumber} (${ord.customerName} • Rep: ${ord.salesperson})...`]
      }))

      if (!pkg) {
        setBatchProgress(p => ({
          ...p,
          logs: [...p.logs, `⚠️ ${ord.soNumber}: No package found, skipped.`]
        }))
        continue
      }

      try {
        const destAddr = ord.shippingAddress || {}
        const pkgWeight = parseFloat((pkg as any).shippingWeight || '5') || 5
        // 1. Get rates
        const rateRes = await fetch('/api/shipping/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            zip: destAddr.zip || destAddr.postal_code || '',
            city: destAddr.city || '',
            state: destAddr.state || '',
            country: destAddr.country || 'US',
            weight: pkgWeight,
            length: 15,
            width: 15,
            height: 4,
            packageNumber: pkg.packageNumber,
            soNumber: ord.soNumber,
          })
        })
        const rateData = await rateRes.json()
        const bestRate = (rateData.rates || []).sort((a: any, b: any) => (a.totalCharge || 999) - (b.totalCharge || 999))[0]

        if (!bestRate) {
          setBatchProgress(p => ({
            ...p,
            logs: [...p.logs, `❌ ${ord.soNumber}: No carrier rates available.`]
          }))
          continue
        }

        // 2. Buy label
        const buyRes = await fetch('/api/shipping/ship-now', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            packageId: pkg.id,
            packageZohoId: pkg.zohoId,
            salesOrderZohoId: ord.zohoId,
            courierServiceId: bestRate.courierServiceId,
            selectedRateCost: bestRate.totalCharge,
            destinationAddress: {
              address: destAddr.address || destAddr.street || '',
              city: destAddr.city || '',
              state: destAddr.state || '',
              zip: destAddr.zip || destAddr.postal_code || '',
              country: destAddr.country || 'US',
            },
            destinationContactName: ord.customerName,
            weight: pkgWeight,
            dimensions: { length: 15, width: 15, height: 4 },
            items: [{ description: 'Order Items', quantity: 1, declaredValue: 100, weight: pkgWeight }],
            soNumber: ord.soNumber,
            packageNumber: pkg.packageNumber,
          })
        })
        const buyData = await buyRes.json()
        if (buyData.success && buyData.labelUrl) {
          triggerAutoPrintLabel(buyData.labelUrl)
          setBatchProgress(p => ({
            ...p,
            logs: [...p.logs, `✅ ${ord.soNumber}: Label purchased (${buyData.courierName} $${buyData.totalCharge}) • Tracking: ${buyData.trackingNumber} • Sent to thermal printer`]
          }))
        } else {
          setBatchProgress(p => ({
            ...p,
            logs: [...p.logs, `❌ ${ord.soNumber}: Failed (${buyData.error || 'Unknown error'})`]
          }))
        }
      } catch (err: any) {
        setBatchProgress(p => ({
          ...p,
          logs: [...p.logs, `❌ ${ord.soNumber}: ${err.message}`]
        }))
      }
    }

    setBatchProcessing(false)
    toast.success('Batch processing completed!')
    setSelectedOrderIds(new Set())
    await fetchOrders()
    await fetchCounts()
  }

  // ── Carrier Pickup Scheduling Function ──────────────────────────────────
  const handleScheduleCarrierPickup = async () => {
    const shippedTodayPkgs = orders
      .flatMap(o => o.packages || [])
      .filter(p => p.status === 'shipped' || p.trackingNumber)
      .map(p => p.easyshipShipmentId || (p.items as any)?.easyshipShipmentId)
      .filter((id): id is string => Boolean(id))

    if (shippedTodayPkgs.length === 0) {
      toast.error('No EasyShip shipments found ready for pickup.')
      return
    }

    setSchedulingPickup(true)
    setPickupResult(null)
    try {
      const res = await fetch('/api/shipping/schedule-pickup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          easyshipShipmentIds: shippedTodayPkgs.slice(0, 25),
          preferredDate: pickupDate,
          preferredTimeSlot: pickupTimeSlot,
        })
      })
      const data = await res.json()
      if (res.ok && !data.error) {
        setPickupResult(data)
        toast.success(`Pickup scheduled with ${pickupCarrier}! Confirmation reference created.`)
      } else {
        toast.error(`Pickup scheduling failed: ${data.error || 'Check carrier hours'}`)
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`)
    } finally {
      setSchedulingPickup(false)
    }
  }

  return (
    <div className="page-content">
      {/* ─── Header ─────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <FiTruck className="text-orange-400" size={17} />
          </div>
          <div>
            <h1 className="page-title">Shipping Center</h1>
            <p className="page-subtitle">Manage packages, tracking &amp; shipments</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncTracking}
            disabled={syncingTracking}
            className="td-btn td-btn-ghost td-btn-sm disabled:opacity-50 text-cyan-400 border-cyan-800/40 hover:bg-cyan-950/30"
            title="Checks live carrier tracking and updates delivery status for active shipments"
          >
            <FiTruck size={13} className={syncingTracking ? "animate-spin" : ""} />
            {syncingTracking ? "Syncing Tracking…" : "Sync Tracking"}
          </button>
          <button
            onClick={handleSyncPackages}
            disabled={syncing}
            className="td-btn td-btn-ghost td-btn-sm disabled:opacity-50"
            title="Syncs all packages and POs from Zoho in the background"
          >
            <FiDownloadCloud size={13} className={syncing ? "animate-pulse" : ""} />
            {syncing ? "Syncing…" : "Sync from Zoho"}
          </button>
          <button
            onClick={fetchOrders}
            className="td-btn td-btn-ghost td-btn-sm"
          >
            <FiRefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* ─── Body ───────────────────────────────────── */}
      <div className="page-body animate-fade-in space-y-4">

        {/* Period Filter */}
        <PeriodSelector
          value={shipPeriod}
          onChange={setShipPeriod}
          options={["today", "this_week", "this_month", "this_quarter", "this_year", "all"]}
          accentColor="orange"
          customStart={shipCustomStart}
          customEnd={shipCustomEnd}
          onCustomStartChange={setShipCustomStart}
          onCustomEndChange={setShipCustomEnd}
        />

      {/* Rate Calculator */}
      <div className="glass-panel border border-white/10 rounded-2xl overflow-hidden mb-4">
        <div 
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => setCalcExpanded(!calcExpanded)}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <FiDollarSign className="text-orange-400" />
            </div>
            <h2 className="text-sm font-bold text-white">Shipping Rate Calculator</h2>
          </div>
          {calcExpanded ? <FiChevronUp className="text-neutral-500" /> : <FiChevronDown className="text-neutral-500" />}
        </div>
        
        {calcExpanded && (
          <div className="p-4 border-t border-white/10 space-y-4">
            {/* Row 0: Origin & Destination Lookups */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Vendor Origin Lookup */}
              <div className="relative">
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">Ship From (Vendor)</label>
                {selectedVendor ? (
                  <div className="flex items-center gap-2 bg-emerald-950/30 border border-emerald-500/20 rounded-xl px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white truncate">{selectedVendor.name}</div>
                      <div className="text-[10px] text-neutral-400 truncate">{selectedVendor.city}, {selectedVendor.state} {selectedVendor.zip}</div>
                    </div>
                    <button onClick={() => { setSelectedVendor(null); setOriginVendorSearch('') }} className="text-neutral-500 hover:text-red-400 shrink-0"><FiX size={14} /></button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={originVendorSearch}
                      onChange={e => { setOriginVendorSearch(e.target.value); setShowVendorDropdown(true) }}
                      onFocus={() => originVendorResults.length > 0 && setShowVendorDropdown(true)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none"
                      placeholder="Search vendor name..."
                    />
                    {showVendorDropdown && originVendorResults.length > 0 && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                        {originVendorResults.map((v: any) => (
                          <button
                            key={v.id}
                            onClick={() => { setSelectedVendor(v); setShowVendorDropdown(false); setOriginVendorSearch('') }}
                            className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                          >
                            <div className="text-sm font-medium text-white">{v.name}</div>
                            <div className="text-[10px] text-neutral-500">{v.address ? `${v.address}, ` : ''}{v.city}, {v.state} {v.zip}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Customer Destination Lookup */}
              <div className="relative">
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">Ship To (Customer)</label>
                {selectedCustomer ? (
                  <div className="flex items-center gap-2 bg-blue-950/30 border border-blue-500/20 rounded-xl px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white truncate">{selectedCustomer.name}</div>
                      <div className="text-[10px] text-neutral-400 truncate">{selectedCustomer.city}, {selectedCustomer.state} {selectedCustomer.zip}</div>
                    </div>
                    <button onClick={() => {
                      setSelectedCustomer(null)
                      setCustomerSearch('')
                      setCalcForm(f => ({...f, zip: '', city: '', state: ''}))
                    }} className="text-neutral-500 hover:text-red-400 shrink-0"><FiX size={14} /></button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true) }}
                      onFocus={() => customerResults.length > 0 && setShowCustomerDropdown(true)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none"
                      placeholder="Search customer name..."
                    />
                    {showCustomerDropdown && customerResults.length > 0 && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                        {customerResults.map((c: any) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setSelectedCustomer(c)
                              setShowCustomerDropdown(false)
                              setCustomerSearch('')
                              // Auto-fill destination fields
                              setCalcForm(f => ({...f, zip: c.zip || '', city: c.city || '', state: c.state || ''}))
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                          >
                            <div className="text-sm font-medium text-white">{c.name}</div>
                            <div className="text-[10px] text-neutral-500">{c.address ? `${c.address}, ` : ''}{c.city}, {c.state} {c.zip}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Row 1: Destination (manual override) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">ZIP / Postal *</label>
                <input 
                  type="text" 
                  value={calcForm.zip}
                  onChange={e => setCalcForm({...calcForm, zip: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none"
                  placeholder="e.g. 90210"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">City</label>
                <input 
                  type="text" 
                  value={calcForm.city}
                  onChange={e => setCalcForm({...calcForm, city: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">State</label>
                <select 
                  value={calcForm.state}
                  onChange={e => setCalcForm({...calcForm, state: e.target.value})}
                  className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none"
                >
                  <option value="">Select State</option>
                  {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">Country</label>
                <select 
                  value={calcForm.country}
                  onChange={e => setCalcForm({...calcForm, country: e.target.value})}
                  className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none"
                >
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="GB">United Kingdom</option>
                  <option value="AU">Australia</option>
                </select>
              </div>
            </div>

            {/* Row 2: Package */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">Weight (lbs) *</label>
                <input 
                  type="number" 
                  value={calcForm.weight}
                  onChange={e => setCalcForm({...calcForm, weight: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none"
                  placeholder="0.0"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">Length (in)</label>
                <input 
                  type="number" 
                  value={calcForm.length}
                  onChange={e => setCalcForm({...calcForm, length: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none"
                  placeholder="0.0"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">Width (in)</label>
                <input 
                  type="number" 
                  value={calcForm.width}
                  onChange={e => setCalcForm({...calcForm, width: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none"
                  placeholder="0.0"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">Height (in)</label>
                <input 
                  type="number" 
                  value={calcForm.height}
                  onChange={e => setCalcForm({...calcForm, height: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none"
                  placeholder="0.0"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">Value ($)</label>
                <input 
                  type="number" 
                  value={calcForm.value}
                  onChange={e => setCalcForm({...calcForm, value: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Row 3: Actions */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button 
                onClick={handleCheckRates}
                disabled={calcLoading}
                className="td-btn bg-orange-600 hover:bg-orange-500 text-white border-none shadow-lg shadow-orange-900/20"
              >
                {calcLoading ? <FiRefreshCw className="animate-spin" /> : <FiSearch />}
                Check Rates
              </button>
              
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className={`w-10 h-5 rounded-full transition-colors relative ${findBestDeal ? 'bg-orange-500' : 'bg-neutral-700'}`}>
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${findBestDeal ? 'left-6' : 'left-1'}`} />
                </div>
                <span className="text-sm font-bold text-neutral-400 group-hover:text-white transition-colors">Find Best Deal</span>
              </label>
            </div>

            {/* Results */}
            {calcRates && (
              <div className="pt-4 mt-4 border-t border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white">Available Rates</h3>
                  <div className="flex gap-2 bg-neutral-900 p-1 rounded-lg border border-white/10">
                    <button 
                      onClick={() => setCalcSort('price')}
                      className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${calcSort === 'price' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'}`}
                    >
                      Price
                    </button>
                    <button 
                      onClick={() => setCalcSort('speed')}
                      className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${calcSort === 'speed' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'}`}
                    >
                      Speed
                    </button>
                  </div>
                </div>

                {calcRates.savingsSummary && (
                  <div className="mb-4 px-4 py-3 bg-emerald-950/30 border border-emerald-800/50 rounded-xl text-emerald-400 text-sm font-bold flex items-center gap-2">
                    <FiCheck /> {calcRates.savingsSummary}
                  </div>
                )}

                {/* Average vs Cheapest Summary */}
                {calcRates.averagePrice > 0 && (
                  <div className="mb-4 grid grid-cols-3 gap-3">
                    <div className="bg-neutral-900/50 border border-white/10 rounded-lg p-3 text-center">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">Average Rate</div>
                      <div className="text-lg font-black text-white">${calcRates.averagePrice?.toFixed(2)}</div>
                    </div>
                    <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-lg p-3 text-center">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mb-1">Cheapest</div>
                      <div className="text-lg font-black text-emerald-400">${calcRates.cheapestPrice?.toFixed(2)}</div>
                    </div>
                    <div className="bg-orange-950/30 border border-orange-800/30 rounded-lg p-3 text-center">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-orange-500 mb-1">You Save</div>
                      <div className="text-lg font-black text-orange-400">${calcRates.savingsVsAverage?.toFixed(2)}</div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {sortedRates.map((r: any, idx: number) => (
                    <div key={idx} className="bg-neutral-900/50 border border-white/10 rounded-xl p-4 relative flex flex-col hover:border-orange-500/50 transition-colors">
                      <div className="flex flex-wrap gap-1 absolute -top-2.5 right-2">
                        {r.isCheapest && <span className="bg-emerald-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-lg">Cheapest</span>}
                        {r.costRank === 1 && !r.isCheapest && <span className="bg-emerald-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-lg">Cheapest</span>}
                        {r.deliveryTimeRank === 1 && <span className="bg-blue-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-lg">Fastest</span>}
                        {r.isBestValue && <span className="bg-amber-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-lg">Best Value</span>}
                        {r.valueForMoneyRank === 1 && !r.isBestValue && <span className="bg-amber-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-lg">Best Value</span>}
                      </div>
                      
                      <div className="flex items-center gap-3 mb-3">
                        {r.logoUrl ? (
                          <img src={r.logoUrl} alt={r.courierName} className="h-6 object-contain" />
                        ) : (
                          <span className="font-bold text-white">{r.umbrellaName || r.courierName}</span>
                        )}
                        <span className="text-xs text-neutral-400 font-medium">{r.courierName}</span>
                      </div>
                      
                      <div className="mt-auto pt-2">
                        <div className="text-2xl font-black text-white">
                          ${(r.totalCharge || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider mt-1">
                          Est. Delivery: {r.minDeliveryTime || '?'} - {r.maxDeliveryTime || '?'} business days
                        </div>
                      </div>
                    </div>
                  ))}
                  {sortedRates.length === 0 && (
                    <div className="col-span-full text-center py-8 text-neutral-500 text-sm">
                      No rates found for this destination and package dimensions.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sync Result Banner */}
      {syncResult && (
        <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-bold border ${
          syncResult.startsWith("✅") ? "bg-emerald-950/30 text-emerald-400 border-emerald-800/50" : "bg-red-950/30 text-red-400 border-red-800/50"
        }`}>
          {syncResult}
          <button onClick={() => setSyncResult(null)} className="ml-3 text-neutral-500 hover:text-white">✍-</button>
        </div>
      )}

      {/* Status Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2 -mx-1 px-1">
        {STATUS_TABS.map(tab => {
          const count = counts[tab.key] || 0
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all border ${
                isActive
                  ? `${tab.bg} ${tab.color} border-current shadow-lg`
                  : "glass-panel/50 text-neutral-500 border-white/10 hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 hover:text-neutral-300"
              }`}
            >
              <tab.icon className="text-base" />
              {tab.label}
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                isActive ? "bg-white/10" : "bg-neutral-800"
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search & Filters Row */}
      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Search by SO #, customer, product, SKU, tracking #..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full glass-panel/70 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-orange-500/50 transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Salesperson Filter (Admin view only or available) */}
          {isAdmin && (
            <select
              value={filterSalesperson}
              onChange={e => setFilterSalesperson(e.target.value)}
              className="bg-neutral-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-bold text-neutral-300 focus:outline-none focus:border-orange-500/50"
            >
              <option value="">All Sales Reps</option>
              {availableSalespersons.map(sp => (
                <option key={sp} value={sp}>{sp}</option>
              ))}
            </select>
          )}

          {/* Carrier Filter */}
          <select
            value={filterCarrier}
            onChange={e => setFilterCarrier(e.target.value)}
            className="bg-neutral-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-bold text-neutral-300 focus:outline-none focus:border-orange-500/50"
          >
            <option value="">All Carriers</option>
            {availableCarriers.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-neutral-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-bold text-neutral-300 focus:outline-none focus:border-orange-500/50"
          >
            <option value="orderDate">Sort: Order Date</option>
            <option value="amount">Sort: Amount</option>
            <option value="customer">Sort: Customer Name</option>
            <option value="soNumber">Sort: SO #</option>
          </select>

          {/* Sort Direction Toggle */}
          <button
            onClick={() => setSortDir(prev => prev === "asc" ? "desc" : "asc")}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-neutral-900 border border-white/10 text-neutral-300 text-sm font-bold hover:bg-neutral-800 transition-colors"
            title="Toggle sort direction"
          >
            {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>

          {/* Select All Orders for Batch Shipping */}
          {filteredOrders.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                selectedOrderIds.size > 0
                  ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                  : 'bg-neutral-900 border-white/10 text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
              title="Select or deselect visible orders for batch fulfillment"
            >
              {selectedOrderIds.size === filteredOrders.length && filteredOrders.length > 0 ? (
                <FiCheckSquare size={14} className="text-orange-400" />
              ) : (
                <FiSquare size={14} />
              )}
              <span>{selectedOrderIds.size === filteredOrders.length ? "Deselect All" : `Select All (${filteredOrders.length})`}</span>
            </button>
          )}
        </div>
      </div>

      {/* End-of-Day Dispatch & Carrier Pickup Banner (Shipped Tab) */}
      {activeTab === 'shipped' && (
        <div className="mb-6 bg-gradient-to-r from-purple-950/60 via-neutral-900 to-indigo-950/40 border border-purple-500/30 rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shrink-0">
              <FiTruck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-white font-bold text-sm">End-of-Day Dispatch &amp; Carrier Pickup</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {orders.filter(o => o.shipStatus === 'shipped' || o.shipStatus === 'delivered').reduce((sum, o) => sum + (o.packages?.length || 1), 0)} Outbound Packages
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Generate carrier end-of-day manifest and schedule daily carrier pickup for outbound packages.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setPickupModalOpen(true)}
              className="td-btn td-btn-sm bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-purple-950/40 cursor-pointer"
            >
              <FiCalendar size={14} />
              Schedule Carrier Pickup
            </button>
          </div>
        </div>
      )}
      
      {/* Packaged Items Compilation Summary */}
      {!loading && compilationList.length > 0 && (
        <div className="mb-6 bg-gradient-to-br from-neutral-900 via-neutral-900 to-indigo-950/20 border border-indigo-500/20 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                <FiPackage className="text-indigo-400 text-sm" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white tracking-tight">Packaged Items Awaiting Shipment</h2>
                <p className="text-[10px] text-neutral-500">Consolidated list of items packed and ready to go out</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {shipPeriod !== 'all' && (
                <span className="text-[10px] text-indigo-400 font-bold">Filtered Period</span>
              )}
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-indigo-950/60 border border-indigo-500/30 text-indigo-300">
                {compilationList.reduce((sum, item) => sum + item.quantity, 0)} Total Units
              </span>
            </div>
          </div>

          {compilationSkuFilter && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-[10px] text-indigo-300 font-bold">Filtering by:</span>
              <span className="px-2 py-0.5 rounded-md bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-[10px] font-black font-mono">{compilationSkuFilter}</span>
              <button
                onClick={() => setCompilationSkuFilter(null)}
                className="text-[10px] text-neutral-500 hover:text-white underline transition-colors"
              >
                Clear Filter
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
            {compilationList.map((item, idx) => (
              <div
                key={idx}
                onClick={() => setCompilationSkuFilter(prev => prev === item.sku ? null : item.sku)}
                className={`bg-neutral-900/40 border rounded-xl p-3 flex items-center justify-between cursor-pointer transition-all duration-300 ${
                  compilationSkuFilter === item.sku
                    ? 'border-indigo-500/60 bg-indigo-950/30 ring-1 ring-indigo-500/30'
                    : 'border-white/5 hover:border-indigo-500/30'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-black text-white font-mono truncate" title={item.sku}>{item.sku}</p>
                  <p className="text-[10px] text-neutral-500 truncate" title={item.name}>{item.name}</p>
                  {item.salespersons && item.salespersons.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <FiUser size={10} className="text-amber-400 shrink-0" />
                      <span className="text-[9px] text-amber-300 font-bold truncate" title={`Sales Rep: ${item.salespersons.join(', ')}`}>
                        {item.salespersons.join(', ')}
                      </span>
                    </div>
                  )}
                </div>
                <span className={`flex-shrink-0 min-w-[28px] h-7 rounded-lg font-black text-xs flex items-center justify-center border px-2 ${
                  compilationSkuFilter === item.sku
                    ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40'
                    : 'bg-indigo-600/15 text-indigo-400 border-indigo-500/20'
                }`}>
                  {item.quantity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders Table */}
      {refreshing && <div className="h-0.5 bg-orange-500/60 animate-pulse w-full rounded mb-2" />}
      {loading && filteredOrders.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredOrders.length === 0 && !loading ? (
        <div className="text-center py-20">
          <FiPackage className="text-4xl text-neutral-700 mx-auto mb-3" />
          <p className="text-neutral-500 font-bold">No orders found</p>
          <p className="text-neutral-600 text-sm mt-1">Try changing the filter or search term</p>
        </div>
      ) : (
        <div className={`space-y-2 transition-opacity duration-200 ${refreshing ? 'opacity-60' : 'opacity-100'}`}>
          {filteredOrders.map((order, idx) => {
            const isExpanded = expandedOrder === order.id
            const statusColor: Record<string, string> = {
              needs_packaging: "text-amber-400 bg-amber-950/40 border-amber-800/50",
              packaged: "text-blue-400 bg-blue-950/40 border-blue-800/50",
              shipped: "text-purple-400 bg-purple-950/40 border-purple-800/50",
              delivered: "text-emerald-400 bg-emerald-950/40 border-emerald-800/50",
            }

            const statusLabels: Record<string, string> = {
              needs_packaging: "Needs Packaging",
              packaged: "Packaged",
              shipped: "Shipped",
              delivered: "Delivered",
            }

            const currentColor = statusColor[order.shipStatus] || "text-neutral-400 bg-neutral-800 border-neutral-700"
            const statusLabel = statusLabels[order.shipStatus] || order.shipStatus

            return (
              <div key={order.id} className={`glass-panel/60 border border-white/10/80 rounded-2xl overflow-hidden hover:border-neutral-700 transition-all ${idx % 2 === 1 ? 'bg-white/[0.03]' : ''}`}>
                {/* Main Row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => handleExpandOrder(order.id)}
                >
                  {/* Batch Selection Checkbox */}
                  <div className="flex items-center" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedOrderIds.has(order.id)}
                      onChange={(e) => toggleSelectOrder(order.id, e)}
                      className="rounded bg-neutral-900 border-white/20 text-orange-500 focus:ring-0 cursor-pointer h-4 w-4 shrink-0"
                      title="Select for batch shipping"
                    />
                  </div>

                  {/* Status Badge */}
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${currentColor}`}>
                    {statusLabel}
                  </span>

                  {/* SO Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <a
                        href={getZohoBooksUrl('salesorders', order.zohoId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white hover:text-orange-400 hover:underline font-bold text-sm cursor-pointer z-10"
                        onClick={(e) => {
                          e.stopPropagation()
                        }}
                      >
                        {order.soNumber || "--"}
                      </a>
                      <span className="text-neutral-600 text-xs">-</span>
                      <span className="text-neutral-400 text-sm truncate">{order.customerName}</span>
                    </div>
                    <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                      <span className="text-[10px] text-neutral-500 font-mono">
                        {order.orderDate ? new Date(order.orderDate).toLocaleDateString() : "--"}
                      </span>
                      <span className="text-[10px] text-neutral-500 font-medium">
                        {order.lineItemCount} item{order.lineItemCount !== 1 ? "s" : ""}
                      </span>
                      {order.salesperson && order.salesperson !== "Unknown" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shadow-sm" title={`Sales Rep: ${order.salesperson}`}>
                          <FiUser size={10} className="text-indigo-400" />
                          <span>Rep: {order.salesperson}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <span className="text-white font-black text-sm">
                    ${order.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>

                  {/* Total Shipping Cost */}
                  {(() => {
                    const totalShip = (order.shippingCost || 0) + order.packages.reduce((sum, p) => sum + (p.shippingCharge || 0), 0)
                    return totalShip > 0 ? (
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded font-bold">
                        Ship: ${totalShip.toFixed(2)}
                      </span>
                    ) : null
                  })()}

                  {/* Packages count */}
                  {order.packages.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-neutral-400 bg-neutral-800 px-2 py-1 rounded-lg">
                      <FiPackage className="text-[10px]" /> {order.packages.length}
                    </span>
                  )}

                  {/* Dropshipments count & PO indicators */}
                  {order.dropshipments?.length > 0 && (
                    <span
                      className="flex items-center gap-1.5 text-xs text-orange-400 bg-orange-950/40 px-2 py-1 rounded-lg border border-orange-800/40 font-bold"
                      title={order.dropshipments.map(d => `PO #${d.poNumber || d.zohoId} (${d.vendorName})`).join(', ')}
                    >
                      <FiTruck className="text-[11px]" />
                      <span>{order.dropshipments.length} DS</span>
                      <span className="text-[10px] text-orange-300 font-mono font-medium">
                        ({order.dropshipments.map(d => d.poNumber ? (d.poNumber.startsWith('PO') ? d.poNumber : `PO #${d.poNumber}`) : `PO ${d.zohoId.slice(-4)}`).join(', ')})
                      </span>
                    </span>
                  )}

                  {/* Expand chevron */}
                  {isExpanded ? <FiChevronUp className="text-neutral-500" /> : <FiChevronDown className="text-neutral-500" />}
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/10/50 pt-3 space-y-4">
                    {/* Shipping Address + Actions row */}
                    <div className="flex flex-col md:flex-row gap-4">
                      {/* Address */}
                      <div className="flex-1 bg-black/20/50 rounded-xl p-3 border border-white/10/50">
                        <div className="flex items-center gap-2 mb-2">
                          <FiMapPin className="text-orange-400 text-xs" />
                          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Shipping Address</span>
                        </div>
                        <p className="text-sm text-neutral-300">{formatAddress(order.shippingAddress)}</p>
                      </div>

                      {/* Items Preview */}
                      <div className="flex-1 bg-black/20/50 rounded-xl p-3 border border-white/10/50">
                        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                          <span>Line Items</span>
                          {fetchingLineItems === order.zohoId && (
                            <span className="text-[10px] text-orange-400 font-bold animate-pulse flex items-center gap-1">
                              <FiRefreshCw className="animate-spin text-[8px]" /> Syncing Zoho...
                            </span>
                          )}
                        </div>
                        {fetchingLineItems === order.zohoId ? (
                          <div className="flex items-center gap-2 py-4 text-xs text-neutral-500">
                            <div className="w-3.5 h-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                            Loading details from Zoho...
                          </div>
                        ) : order.lineItems && order.lineItems.length > 0 ? (
                          <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                            {order.lineItems.map((li, i) => (
                              <div key={i} className="flex items-center justify-between text-sm hover:bg-white/5 p-1 rounded transition-colors gap-2">
                                <span className="text-neutral-300 font-medium truncate flex-1 min-w-0" title={li.name}>
                                  {li.sku ? `[${li.sku}] ` : ""}{li.name}
                                </span>
                                {(li.salesperson || order.salesperson) && (li.salesperson || order.salesperson) !== 'Unknown' && (
                                  <span className="text-[9px] text-indigo-300/90 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/40 font-mono shrink-0 flex items-center gap-1" title={`Sales Rep: ${li.salesperson || order.salesperson}`}>
                                    <FiUser size={8} /> {li.salesperson || order.salesperson}
                                  </span>
                                )}
                                <span className="flex-shrink-0 bg-neutral-800 text-neutral-300 font-bold px-2 py-0.5 rounded text-xs min-w-[20px] text-center font-mono">
                                  {li.quantity}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-neutral-500 flex flex-col gap-1 py-2">
                            <span>No item data cached locally.</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSyncSalesOrderDetail(order.zohoId)
                              }}
                              className="text-left text-[10px] text-orange-400 hover:text-orange-300 font-bold underline cursor-pointer"
                            >
                              Fetch Items from Zoho
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Packages List */}
                    {order.packages.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Packages</div>
                        <div className="space-y-2">
                          {order.packages.map(pkg => (
                            <div key={pkg.id} className="bg-black/20/50 border border-white/10/50 rounded-xl p-3 flex flex-col md:flex-row md:items-center gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <FiPackage className="text-blue-400 text-xs" />
                                  <span className="text-sm font-bold text-white">{pkg.packageNumber || pkg.zohoId}</span>
                                  <a
                                    href={getZohoBooksUrl('salesorders', order.zohoId)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-indigo-400 font-mono bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/50 font-bold hover:text-orange-400 hover:underline transition-colors cursor-pointer"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    SO #{pkg.salesOrderNumber || order.soNumber}
                                  </a>
                                  {(pkg.salesperson || order.salesperson) && (pkg.salesperson || order.salesperson) !== 'Unknown' && (
                                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 flex items-center gap-1">
                                      <FiUser size={9} /> Rep: {pkg.salesperson || order.salesperson}
                                    </span>
                                  )}
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                    pkg.status === "delivered" ? "text-emerald-400 bg-emerald-950/50" :
                                    pkg.status === "shipped" ? "text-purple-400 bg-purple-950/50" :
                                    "text-blue-400 bg-blue-950/50"
                                  }`}>
                                    {pkg.status || "created"}
                                  </span>
                                  {/* EasyShip Link Indicator */}
                                  {(() => {
                                    const esId = pkg.easyshipShipmentId || (pkg.items as any)?.easyshipShipmentId
                                    return esId ? (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase text-emerald-400 bg-emerald-950/50 flex items-center gap-1" title={`EasyShip: ${esId}`}>
                                        <FiLink size={9} /> Linked
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase text-amber-400/60 bg-amber-950/30 flex items-center gap-1">
                                        <FiLink size={9} /> No Link
                                      </span>
                                    )
                                  })()}
                                </div>

                                {/* Items in Shipment */}
                                <div className="mt-2 bg-neutral-900/60 rounded-lg p-2 border border-white/5">
                                  <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                    <FiBox className="text-xs text-blue-400" /> Items in Shipment
                                  </div>
                                  {(() => {
                                    const pkgItems = financialZohoLineItems(pkg.items?.lineItems || pkg.items?.line_items || (Array.isArray(pkg.items) ? pkg.items : []))
                                    if (pkgItems && pkgItems.length > 0) {
                                      return (
                                        <div className="space-y-1">
                                          {pkgItems.map((li: any, idx: number) => {
                                            const name = li.name || li.itemName || li.item_name || ""
                                            const qty = li.quantity || li.quantity_packed || ""
                                            const rep = li.salesperson || pkg.salesperson || order.salesperson
                                            return (
                                              <div key={idx} className="flex items-center justify-between text-xs text-neutral-300 font-medium py-0.5">
                                                <span className="truncate pr-2">• {qty ? `${qty}x ` : ""}{name}</span>
                                                {rep && rep !== "Unknown" && (
                                                  <span className="text-[9px] text-indigo-300/80 font-mono shrink-0 ml-auto bg-indigo-950/50 px-1.5 py-0.2 rounded border border-indigo-800/30 flex items-center gap-1">
                                                    <FiUser size={8} /> {rep}
                                                  </span>
                                                )}
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )
                                    }
                                    
                                    return (
                                      <p className="text-xs text-neutral-500 italic">Package contents pending sync</p>
                                    )
                                  })()}
                                </div>

                                {(() => {
                                  const pItems = (pkg.items as any) || {}
                                  if (pItems.dimensions) {
                                    return (
                                      <div className="flex items-center gap-1.5 mt-2">
                                        <span className="text-[10px] bg-neutral-900 border border-white/10 text-neutral-300 px-2 py-0.5 rounded font-mono flex items-center gap-1">
                                          <FiBox className="text-orange-400" size={10} />
                                          {pItems.boxPreset ? `${pItems.boxPreset}: ` : 'Box: '}
                                          {pItems.dimensions.length}"×{pItems.dimensions.width}"×{pItems.dimensions.height}"
                                          {pItems.weight ? ` (${pItems.weight} lbs)` : ''}
                                        </span>
                                      </div>
                                    )
                                  }
                                  return null
                                })()}

                                {pkg.trackingNumber && (
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className="text-[10px] text-neutral-500">{pkg.carrier || "Carrier"}</span>
                                    <span className="text-xs text-neutral-300 font-mono">{pkg.trackingNumber}</span>
                                    {(() => {
                                      const url = getTrackingUrl(pkg.carrier, pkg.trackingNumber)
                                      return url ? (
                                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 text-xs">
                                          <FiExternalLink />
                                        </a>
                                      ) : null
                                    })()}
                                  </div>
                                )}

                                {/* Shipping Cost */}
                                {pkg.shippingCharge > 0 && (
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className="text-[10px] text-neutral-500">Shipping Cost:</span>
                                    <span className="text-xs text-emerald-400 font-bold font-mono">${pkg.shippingCharge.toFixed(2)}</span>
                                  </div>
                                )}
                              </div>

                              {/* Package Actions — state-based */}
                              <div className="flex gap-2 flex-wrap">
                                {(() => {
                                  const pkgItems = (pkg.items as any) || {}
                                  const hasEasyship = !!pkgItems.easyshipShipmentId || !!pkg.easyshipShipmentId
                                  const hasLabel = !!pkgItems.labelUrl && !pkgItems.labelVoided
                                  const hasTracking = !!pkg.trackingNumber
                                  const isDelivered = pkg.status === 'delivered'
                                  const isShipped = pkg.status === 'shipped'

                                  return (
                                    <>
                                      {/* Ship Now — show when no label yet */}
                                      {!hasLabel && !isDelivered && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); openShipNow(pkg, order); }}
                                          className="td-btn td-btn-sm bg-orange-600 hover:bg-orange-500 text-white border-none"
                                        >
                                          <FiTruck size={12} /> Ship Now
                                        </button>
                                      )}

                                      {/* Print 4x6 Label (Zebra Thermal) — when label exists */}
                                      {hasLabel && (
                                        <a
                                          href={(() => {
                                            let u = pkgItems.labelUrl || ''
                                            if (u.includes('easyship.com')) {
                                              u = u.includes('page_size=') ? u.replace(/page_size=[^&]+/, 'page_size=4x6') : u + (u.includes('?') ? '&' : '?') + 'page_size=4x6'
                                            }
                                            return u
                                          })()}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={e => e.stopPropagation()}
                                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/50 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-emerald-950/50 hover:scale-[1.02] active:scale-[0.98]"
                                          title="Open and print 4x6 label (Zebra thermal printer format)"
                                        >
                                          <FiPrinter size={13} /> Print 4x6 Label
                                        </a>
                                      )}

                                      {/* Get Label from EasyShip — when no label yet, but has tracking or easyship */}
                                      {!hasLabel && !isDelivered && (hasTracking || hasEasyship || isShipped) && (
                                        <button
                                          disabled={fetchingLabelPkgId === pkg.id}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleGetLabelFromEasyShip(pkg)
                                          }}
                                          className="px-3 py-1.5 rounded-lg bg-cyan-600/25 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 disabled:opacity-50"
                                          title="Fetch label and shipment details from EasyShip"
                                        >
                                          {fetchingLabelPkgId === pkg.id ? (
                                            <FiRefreshCw size={11} className="animate-spin" />
                                          ) : (
                                            <FiDownloadCloud size={12} />
                                          )}
                                          Get Label from EasyShip
                                        </button>
                                      )}

                                      {/* Packing Slip — if available */}
                                      {pkgItems.packingSlipUrl && (
                                        <a
                                          href={pkgItems.packingSlipUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={e => e.stopPropagation()}
                                          className="px-3 py-1.5 rounded-lg bg-neutral-700/40 text-neutral-300 border border-neutral-700/50 text-[10px] font-bold uppercase hover:bg-neutral-700/60 transition-all flex items-center gap-1"
                                        >
                                          <FiPrinter size={11} /> Packing Slip
                                        </a>
                                      )}

                                      {/* Add Tracking — no tracking yet, no easyship */}
                                      {!hasTracking && !hasEasyship && !isDelivered && (
                                        <button
                                          onClick={() => setTrackingModal({ packageId: pkg.id, carrier: pkg.carrier || "", tracking: "" })}
                                          className="px-3 py-1.5 rounded-lg bg-purple-600/20 text-purple-400 border border-purple-800/50 text-[10px] font-bold uppercase hover:bg-purple-600/30 transition-all"
                                        >
                                          Add Tracking
                                        </button>
                                      )}

                                      {/* Refresh Status — when easyship shipment or label exists */}
                                      {(hasEasyship || hasLabel) && !isDelivered && (
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation()
                                            try {
                                              const res = await fetch('/api/shipping/refresh-status', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ 
                                                  easyshipShipmentId: pkgItems.easyshipShipmentId || pkg.easyshipShipmentId, 
                                                  packageId: pkg.id,
                                                  trackingNumber: pkg.trackingNumber
                                                })
                                              })
                                              const data = await res.json()
                                              if (data.success) {
                                                toast.success(`Status: ${data.shipmentState || 'updated'} | Label: ${data.labelState || (data.labelUrl ? 'ready' : 'n/a')}`)
                                                fetchOrders(); fetchCounts()
                                              } else {
                                                toast.error('Refresh failed: ' + (data.error || 'Unknown'))
                                              }
                                            } catch (err: any) { toast.error(err.message) }
                                          }}
                                          className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700/50 text-[10px] font-bold uppercase transition-all flex items-center gap-1"
                                          title="Refresh shipment & label status from EasyShip"
                                        >
                                          <FiRefreshCw size={11} /> Refresh
                                        </button>
                                      )}

                                      {/* Mark Delivered — when shipped but not delivered */}
                                      {!isDelivered && (isShipped || hasTracking) && (
                                        <button
                                          onClick={() => handleStatusChange(pkg.id, "markDelivered")}
                                          className="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-800/50 text-[10px] font-bold uppercase hover:bg-emerald-600/30 transition-all"
                                        >
                                          Mark Delivered
                                        </button>
                                      )}

                                      {/* Void Label — when label purchased but not delivered */}
                                      {hasLabel && !isDelivered && (
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation()
                                            if (!confirm('Void this label? The shipment will remain but the label will be cancelled.')) return
                                            try {
                                              const res = await fetch('/api/shipping/void-label', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ easyshipShipmentId: pkgItems.easyshipShipmentId, packageId: pkg.id })
                                              })
                                              const data = await res.json()
                                              if (data.success) {
                                                toast.success('Label voided successfully')
                                                fetchOrders(); fetchCounts()
                                              } else {
                                                toast.error('Void failed: ' + (data.error || 'Unknown'))
                                              }
                                            } catch (err: any) { toast.error(err.message) }
                                          }}
                                          className="px-3 py-1.5 rounded-lg bg-red-600/10 text-red-400 border border-red-800/40 text-[10px] font-bold uppercase hover:bg-red-600/20 transition-all flex items-center gap-1"
                                        >
                                          <FiXCircle size={11} /> Void Label
                                        </button>
                                      )}

                                      {/* Cancel Shipment — easyship exists, no label, not shipped */}
                                      {hasEasyship && !hasLabel && !isShipped && !isDelivered && (
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation()
                                            if (!confirm('Cancel this Easyship shipment? This will remove it from Easyship.')) return
                                            try {
                                              const res = await fetch('/api/shipping/cancel-shipment', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ easyshipShipmentId: pkgItems.easyshipShipmentId, packageId: pkg.id })
                                              })
                                              const data = await res.json()
                                              if (data.success) {
                                                toast.success('Shipment cancelled')
                                                fetchOrders(); fetchCounts()
                                              } else {
                                                toast.error('Cancel failed: ' + (data.error || 'Unknown'))
                                              }
                                            } catch (err: any) { toast.error(err.message) }
                                          }}
                                          className="px-3 py-1.5 rounded-lg bg-red-600/10 text-red-400 border border-red-800/40 text-[10px] font-bold uppercase hover:bg-red-600/20 transition-all flex items-center gap-1"
                                        >
                                          <FiTrash2 size={11} /> Cancel
                                        </button>
                                      )}
                                    </>
                                  )
                                })()}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dropshipments List */}
                    {order.dropshipments?.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <FiTruck className="text-orange-400" /> Dropshipments ({order.dropshipments.length})
                        </div>
                        <div className="space-y-2.5">
                          {order.dropshipments.map(ds => {
                            const poDisplay = ds.poNumber ? (ds.poNumber.startsWith('PO') ? ds.poNumber : `PO #${ds.poNumber}`) : `PO (${ds.zohoId.slice(-4)})`
                            const soDisplay = ds.salesOrderNumber || ds.referenceNumber || order.soNumber
                            const zohoPoUrl = getZohoBooksUrl('purchaseorders', ds.zohoId)
                            const zohoSoUrl = getZohoBooksUrl('salesorders', order.zohoId)

                            return (
                              <div key={ds.id} className="bg-orange-950/20 border border-orange-800/40 rounded-xl p-3.5 space-y-2.5">
                                {/* Top Row: PO Badge, SO Badge, Vendor, Status, Date, Ship To, Total, Review Actions */}
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <FiTruck className="text-orange-400 text-sm shrink-0" />

                                    {/* PO Number link badge */}
                                    <a
                                      href={zohoPoUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-orange-300 font-mono bg-orange-950/80 px-2.5 py-0.5 rounded border border-orange-700/60 font-black hover:text-white hover:bg-orange-800/80 transition-colors flex items-center gap-1 shadow-sm"
                                      title={`Review ${poDisplay} in Zoho Books`}
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <FiFileText size={11} className="text-orange-400" />
                                      <span>{poDisplay}</span>
                                      <FiExternalLink size={10} className="text-orange-400/80" />
                                    </a>

                                    {/* Sales Order link badge */}
                                    <a
                                      href={zohoSoUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-indigo-400 font-mono bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/50 font-bold hover:text-orange-400 hover:underline transition-colors flex items-center gap-1 cursor-pointer"
                                      title={`Review Sales Order #${soDisplay} in Zoho Books`}
                                      onClick={e => e.stopPropagation()}
                                    >
                                      SO #{soDisplay}
                                    </a>

                                    {/* Sales Rep Badge */}
                                    {(ds.salesperson || order.salesperson) && (ds.salesperson || order.salesperson) !== 'Unknown' && (
                                      <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 shadow-sm">
                                        <FiUser size={9} /> Rep: {ds.salesperson || order.salesperson}
                                      </span>
                                    )}

                                    {/* Vendor Name */}
                                    <span className="text-sm font-bold text-white tracking-wide">{ds.vendorName || "Vendor"}</span>

                                    {/* Status Badge */}
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                      ds.status === "received" || ds.status === "delivered" || ds.status === "billed" ? "text-emerald-400 bg-emerald-950/50 border border-emerald-800/40" :
                                      ds.status === "issued" || ds.status === "shipped" ? "text-purple-400 bg-purple-950/50 border border-purple-800/40" :
                                      "text-orange-400 bg-orange-950/50 border border-orange-800/40"
                                    }`}>
                                      {ds.status || "open"}
                                    </span>

                                    {/* PO Date */}
                                    {ds.date && (
                                      <span className="text-[10px] text-neutral-400 font-mono">
                                        {new Date(ds.date).toLocaleDateString()}
                                      </span>
                                    )}

                                    {/* Ship To Customer */}
                                    {ds.shipToName && (
                                      <span className="text-[10px] text-neutral-400 flex items-center gap-1" title={ds.shipToName}>
                                        <span className="text-neutral-600">Ship To:</span>
                                        <span className="text-neutral-300 font-medium truncate max-w-[180px]">{ds.shipToName}</span>
                                      </span>
                                    )}

                                    {/* Total Cost */}
                                    <span className="text-xs text-emerald-400 font-bold font-mono">
                                      ${ds.total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                    {ds.shippingCharge ? (
                                      <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded font-mono">
                                        Ship: ${ds.shippingCharge.toFixed(2)}
                                      </span>
                                    ) : null}
                                  </div>

                                  {/* Actions: Review PO, Edit Tracking */}
                                  <div className="flex items-center gap-2">
                                    <a
                                      href={zohoPoUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2.5 py-1 rounded-lg bg-orange-600/20 text-orange-300 border border-orange-700/50 text-[10px] font-bold uppercase hover:bg-orange-600/30 transition-all flex items-center gap-1 shadow-sm"
                                      title="Open and review PO in Zoho Books"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <FiExternalLink size={11} /> Review PO
                                    </a>
                                    <button
                                      onClick={() => {
                                        setEditingDropship(editingDropship === ds.id ? null : ds.id)
                                        setDropshipEdit({ tracking: ds.trackingNumber || '', shippingCharge: String(ds.shippingCharge || '') })
                                      }}
                                      className="p-1.5 rounded-lg text-neutral-400 hover:text-orange-400 hover:bg-white/5 transition-colors"
                                      title="Edit tracking & shipping cost"
                                    >
                                      <FiEdit2 size={13} />
                                    </button>
                                  </div>
                                </div>

                                {/* Line Items in PO */}
                                {ds.lineItems && ds.lineItems.length > 0 ? (
                                  <div className="bg-neutral-900/60 rounded-lg p-2.5 border border-white/5 space-y-1">
                                    <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider flex items-center justify-between">
                                      <span className="flex items-center gap-1">
                                        <FiBox className="text-xs text-orange-400" /> Items in Purchase Order ({poDisplay})
                                      </span>
                                      {ds.referenceNumber && ds.referenceNumber !== soDisplay && (
                                        <span className="text-[9px] text-neutral-500 font-mono">Ref: {ds.referenceNumber}</span>
                                      )}
                                    </div>
                                    <div className="space-y-1">
                                      {ds.lineItems.map((li, liIdx) => {
                                        const rep = li.salesperson || ds.salesperson || order.salesperson
                                        return (
                                          <div key={liIdx} className="flex items-center gap-2 text-xs text-neutral-300 font-medium py-0.5">
                                            <span className="text-neutral-500">•</span>
                                            <span className="text-orange-400 font-mono font-bold">{li.quantity}x</span>
                                            <span className="truncate">{li.name}</span>
                                            {li.sku && <span className="text-[10px] text-neutral-500 font-mono">[{li.sku}]</span>}
                                            {rep && rep !== "Unknown" && (
                                              <span className="text-[9px] text-indigo-300/80 font-mono bg-indigo-950/50 px-1.5 py-0.2 rounded border border-indigo-800/30 flex items-center gap-1">
                                                <FiUser size={8} /> {rep}
                                              </span>
                                            )}
                                            {li.rate > 0 && <span className="text-neutral-400 ml-auto shrink-0 font-mono">${li.rate.toFixed(2)}</span>}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="pl-6">
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation()
                                        try {
                                          const res = await fetch(`/api/shipping/po-details?poZohoId=${ds.zohoId}`)
                                          const data = await res.json()
                                          if (data.success && data.lineItems) {
                                            setOrders(prev => prev.map(o => ({
                                              ...o,
                                              dropshipments: o.dropshipments.map(d => d.id === ds.id ? {
                                                ...d,
                                                lineItems: data.lineItems,
                                                poNumber: data.poNumber || d.poNumber,
                                                salesOrderNumber: data.salesOrderNumber || d.salesOrderNumber,
                                                shipToName: data.shipToName || d.shipToName,
                                                trackingNumber: data.trackingNumber || d.trackingNumber
                                              } : d)
                                            })))
                                            toast.success('PO line items loaded from Zoho')
                                          } else {
                                            toast.error('Could not load PO line items')
                                          }
                                        } catch (err: any) {
                                          toast.error(err.message)
                                        }
                                      }}
                                      className="text-[10px] text-orange-400 hover:text-orange-300 underline flex items-center gap-1"
                                    >
                                      <FiRefreshCw size={10} /> Load PO Items from Zoho
                                    </button>
                                  </div>
                                )}

                                {/* Tracking display */}
                                {ds.trackingNumber && editingDropship !== ds.id && (
                                  <div className="flex items-center gap-2 pl-2">
                                    <span className="text-[10px] text-neutral-500">{ds.carrier || "Tracking"}:</span>
                                    <span className="text-xs text-neutral-300 font-mono">{ds.trackingNumber}</span>
                                    {(() => {
                                      const url = getTrackingUrl(ds.carrier || "", ds.trackingNumber)
                                      return url ? (
                                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 text-xs flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                                          <FiExternalLink size={10} /> Track
                                        </a>
                                      ) : null
                                    })()}
                                  </div>
                                )}

                              {/* Edit form */}
                              {editingDropship === ds.id && (
                                <div className="mt-2 pl-5 flex flex-wrap gap-2 items-end">
                                  <div className="flex-1 min-w-[140px]">
                                    <label className="text-[9px] font-bold uppercase text-neutral-600 block mb-0.5">Tracking #</label>
                                    <input
                                      type="text"
                                      value={dropshipEdit.tracking}
                                      onChange={e => setDropshipEdit(d => ({ ...d, tracking: e.target.value }))}
                                      className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:border-orange-500/50 outline-none font-mono"
                                      placeholder="Enter tracking number"
                                    />
                                  </div>
                                  <div className="w-24">
                                    <label className="text-[9px] font-bold uppercase text-neutral-600 block mb-0.5">Ship Cost</label>
                                    <input
                                      type="number"
                                      value={dropshipEdit.shippingCharge}
                                      onChange={e => setDropshipEdit(d => ({ ...d, shippingCharge: e.target.value }))}
                                      className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:border-orange-500/50 outline-none"
                                      placeholder="$0.00"
                                    />
                                  </div>
                                  <button
                                    onClick={() => saveDropshipEdit(ds.id)}
                                    className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-colors"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingDropship(null)}
                                    className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-xs transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 flex-wrap pt-2 border-t border-white/10/30">
                      <button
                        onClick={() => fetchLineItems(order.zohoId, "package")}
                        disabled={fetchingLineItems === order.zohoId}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-800/50 text-xs font-bold hover:bg-blue-600/30 transition-all disabled:opacity-50"
                      >
                        <FiBox /> {fetchingLineItems === order.zohoId ? "Loading..." : "Create Package"}
                      </button>
                      <button
                        onClick={() => fetchLineItems(order.zohoId, "dropship")}
                        disabled={fetchingLineItems === order.zohoId}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600/20 text-orange-400 border border-orange-800/50 text-xs font-bold hover:bg-orange-600/30 transition-all disabled:opacity-50"
                      >
                        <FiTruck /> Create Dropshipment
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Tracking Modal */}
      {trackingModal && createPortal(
        <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setTrackingModal(null)} />
          <div className="relative glass-panel border border-white/10 w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <FiTruck className="text-purple-400" /> Add Tracking Info
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Carrier</label>
                <select
                  value={trackingModal.carrier}
                  onChange={e => setTrackingModal({ ...trackingModal, carrier: e.target.value })}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"
                >
                  <option value="">Select carrier...</option>
                  {availableCarriers.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Tracking Number</label>
                <input
                  type="text"
                  value={trackingModal.tracking}
                  onChange={e => setTrackingModal({ ...trackingModal, tracking: e.target.value })}
                  placeholder="Enter tracking number..."
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-purple-500/50"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-5 mt-5 border-t border-white/10">
              <button onClick={() => setTrackingModal(null)} className="px-4 py-2 text-neutral-400 hover:text-white font-bold text-sm">
                Cancel
              </button>
              <button
                onClick={handleAddTracking}
                disabled={trackingSubmitting || !trackingModal.carrier || !trackingModal.tracking}
                className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2 rounded-xl font-bold text-sm shadow-lg shadow-purple-900/20 disabled:opacity-50 transition-all"
              >
                {trackingSubmitting ? "Saving..." : "Save Tracking"}
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Package Creation Modal */}
      {packageModal && (
        <CreatePackageModal
          salesOrderId={packageModal.salesOrderId}
          lineItems={packageModal.lineItems}
          onClose={() => setPackageModal(null)}
          onSuccess={(_id: string) => { setPackageModal(null); fetchOrders() }}
        />
      )}

      {/* Dropshipment Modal */}
      {dropshipModal && (
        <CreateDropshipmentModal
          salesOrderId={dropshipModal.salesOrderId}
          lineItems={dropshipModal.lineItems}
          onClose={() => setDropshipModal(null)}
          onSuccess={(_poId: string) => { setDropshipModal(null); fetchOrders() }}
        />
      )}

      {/* Batch Dropship Modal */}
      {batchDropshipModalOpen && (
        <BatchDropshipModal
          salesOrderIds={Array.from(selectedOrderIds)}
          onClose={() => setBatchDropshipModalOpen(false)}
          onSuccess={() => {
            setSelectedOrderIds(new Set())
            fetchOrders()
            fetchCounts()
          }}
        />
      )}

      {/* ── Floating Batch Action Bar ── */}
      {selectedOrderIds.size > 0 && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[400] bg-neutral-950/95 border border-orange-500/50 rounded-2xl px-5 py-3 shadow-2xl backdrop-blur-xl flex items-center gap-4 animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-400 flex items-center justify-center text-xs font-black">
              {selectedOrderIds.size}
            </span>
            <span className="text-sm font-bold text-white whitespace-nowrap">
              {selectedOrderIds.size} {selectedOrderIds.size === 1 ? 'Order' : 'Orders'} Selected
            </span>
          </div>
          <div className="h-5 w-[1px] bg-white/10 hidden sm:block" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBatchDropshipModalOpen(true)}
              className="td-btn td-btn-sm bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black flex items-center gap-1.5 shadow-lg shadow-cyan-950/50 cursor-pointer"
              title="Batch generate and dispatch dropship POs for selected orders"
            >
              <FiTruck size={14} />
              Batch Dropship POs
            </button>
            <button
              onClick={() => setBatchModalOpen(true)}
              className="td-btn td-btn-sm bg-orange-500 hover:bg-orange-400 text-black font-black flex items-center gap-1.5 shadow-lg shadow-orange-950/50 cursor-pointer"
            >
              <FiPrinter size={14} />
              Batch Purchase &amp; Print 4×6
            </button>
            <button
              onClick={() => setSelectedOrderIds(new Set())}
              className="td-btn td-btn-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-white/10 text-xs cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ── Batch Fulfillment Modal ── */}
      {batchModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[550] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e0f12] border border-orange-500/30 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/40">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
                  <FiLayers size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Batch Fulfillment &amp; Auto-Print Queue</h3>
                  <p className="text-xs text-neutral-400">
                    Purchase shipping labels and dispatch 4×6 thermal print jobs in sequence
                  </p>
                </div>
              </div>
              <button
                onClick={() => !batchProcessing && setBatchModalOpen(false)}
                disabled={batchProcessing}
                className="text-neutral-400 hover:text-white disabled:opacity-30 cursor-pointer p-1"
              >
                <FiX size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-black/30 border border-white/5 rounded-xl p-3">
                  <div className="text-[10px] text-neutral-500 font-bold uppercase">Queued Orders</div>
                  <div className="text-lg font-black text-white mt-0.5">{selectedOrderIds.size} Orders</div>
                </div>
                <div className="bg-black/30 border border-white/5 rounded-xl p-3">
                  <div className="text-[10px] text-neutral-500 font-bold uppercase">Print Output</div>
                  <div className="text-lg font-black text-orange-400 mt-0.5">4×6 Thermal</div>
                </div>
                <div className="bg-black/30 border border-white/5 rounded-xl p-3">
                  <div className="text-[10px] text-neutral-500 font-bold uppercase">Zoho Sync</div>
                  <div className="text-lg font-black text-emerald-400 mt-0.5">Auto-Update</div>
                </div>
              </div>

              {/* Progress Bar (when active) */}
              {batchProcessing && (
                <div className="bg-black/40 border border-orange-500/30 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-orange-400 font-bold flex items-center gap-2">
                      <FiRefreshCw className="animate-spin" size={12} />
                      Processing shipment {batchProgress.current} of {batchProgress.total}...
                    </span>
                    <span className="text-neutral-400 font-mono">
                      {Math.round((batchProgress.current / Math.max(batchProgress.total, 1)) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-300"
                      style={{ width: `${(batchProgress.current / Math.max(batchProgress.total, 1)) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Live Activity Logs */}
              {batchProgress.logs.length > 0 && (
                <div className="bg-black/60 border border-white/10 rounded-xl p-3 font-mono text-xs max-h-40 overflow-y-auto space-y-1 text-neutral-300">
                  {batchProgress.logs.map((log, idx) => (
                    <div key={idx} className="leading-relaxed">{log}</div>
                  ))}
                </div>
              )}

              {/* Selected Orders List */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Orders in Queue</div>
                <div className="divide-y divide-white/5 max-h-56 overflow-y-auto bg-black/20 rounded-xl border border-white/5 p-2">
                  {orders.filter(o => selectedOrderIds.has(o.id)).map(ord => (
                    <div key={ord.id} className="py-2 px-2 flex items-center justify-between text-xs">
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold">{ord.soNumber}</span>
                          <span className="text-neutral-400 truncate max-w-[200px]">{ord.customerName}</span>
                        </div>
                        <div className="text-[10px] text-neutral-500 flex items-center gap-2 mt-0.5">
                          <span>{ord.shippingAddress?.city}, {ord.shippingAddress?.state} {ord.shippingAddress?.zip}</span>
                          {ord.salesperson && (
                            <span className="text-amber-400 font-semibold">• Rep: {ord.salesperson}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-neutral-300 shrink-0">
                        {ord.packages?.length || 1} pkg
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between bg-black/40">
              <button
                onClick={() => setBatchModalOpen(false)}
                disabled={batchProcessing}
                className="td-btn td-btn-sm bg-neutral-800 hover:bg-neutral-700 text-white border-white/10 disabled:opacity-40 cursor-pointer"
              >
                {batchProgress.current === batchProgress.total && batchProgress.total > 0 ? "Done & Close" : "Cancel"}
              </button>
              <button
                onClick={runBatchFulfillment}
                disabled={batchProcessing || selectedOrderIds.size === 0}
                className="td-btn td-btn-sm bg-orange-500 hover:bg-orange-400 text-black font-black flex items-center gap-2 disabled:opacity-40 cursor-pointer shadow-lg shadow-orange-950/50"
              >
                {batchProcessing ? (
                  <>
                    <FiRefreshCw className="animate-spin" size={14} />
                    Processing...
                  </>
                ) : (
                  <>
                    <FiPrinter size={14} />
                    Purchase &amp; Print All ({selectedOrderIds.size} Labels)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Carrier Pickup Scheduling Modal ── */}
      {pickupModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[550] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e0f12] border border-purple-500/30 rounded-2xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/40">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <FiCalendar size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Schedule Carrier Pickup</h3>
                  <p className="text-xs text-neutral-400">Request daily driver dispatch for packaged shipments</p>
                </div>
              </div>
              <button
                onClick={() => setPickupModalOpen(false)}
                className="text-neutral-400 hover:text-white cursor-pointer p-1"
              >
                <FiX size={18} />
              </button>
            </div>

            {/* Form */}
            <div className="p-6 space-y-4">
              {pickupResult ? (
                <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <FiCheck size={18} /> Pickup Request Confirmed!
                  </div>
                  <p className="text-xs text-neutral-300">
                    Carrier pickup reference: <span className="font-mono font-bold text-white">{pickupResult.pickup_reference || pickupResult.id || 'CONFIRMED'}</span>
                  </p>
                  <p className="text-xs text-neutral-400">
                    Driver is scheduled for <span className="text-white font-semibold">{pickupDate}</span> during slot <span className="text-white font-semibold">{pickupTimeSlot}</span>.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Select Carrier</label>
                    <select
                      value={pickupCarrier}
                      onChange={e => setPickupCarrier(e.target.value)}
                      className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="FedEx">FedEx Express &amp; Ground</option>
                      <option value="UPS">UPS Parcel</option>
                      <option value="USPS">USPS Priority / Ground Advantage</option>
                      <option value="DHL Express">DHL Express Worldwide</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Pickup Date</label>
                      <input
                        type="date"
                        value={pickupDate}
                        onChange={e => setPickupDate(e.target.value)}
                        className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Ready Time Window</label>
                      <select
                        value={pickupTimeSlot}
                        onChange={e => setPickupTimeSlot(e.target.value)}
                        className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                      >
                        <option value="12:00 - 15:00">12:00 PM – 3:00 PM</option>
                        <option value="14:00 - 17:00">2:00 PM – 5:00 PM (Standard)</option>
                        <option value="15:00 - 18:00">3:00 PM – 6:00 PM (Late Dispatch)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Package Location / Driver Instructions</label>
                    <input
                      type="text"
                      value={pickupNotes}
                      onChange={e => setPickupNotes(e.target.value)}
                      placeholder="e.g. Front reception dock / Bay door 2"
                      className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between bg-black/40">
              <button
                onClick={() => { setPickupModalOpen(false); setPickupResult(null); }}
                className="td-btn td-btn-sm bg-neutral-800 hover:bg-neutral-700 text-white border-white/10 cursor-pointer"
              >
                Close
              </button>
              {!pickupResult && (
                <button
                  onClick={handleScheduleCarrierPickup}
                  disabled={schedulingPickup}
                  className="td-btn td-btn-sm bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center gap-2 cursor-pointer shadow-lg shadow-purple-950/40 disabled:opacity-40"
                >
                  {schedulingPickup ? <FiRefreshCw className="animate-spin" size={13} /> : <FiSend size={13} />}
                  Schedule Pickup
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Ship Now Slide-Out ────────────────────────────────────────── */}
      {shipNowOpen && createPortal(
        <div className="fixed inset-0 z-[500] overflow-hidden" onKeyDown={e => e.key === 'Escape' && !shipNowBuying && setShipNowOpen(false)}>
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => !shipNowBuying && setShipNowOpen(false)}
          />
          {/* Panel */}
          <div className="absolute inset-y-0 right-0 w-full max-w-xl bg-[#0a0b0d] border-l border-white/10 shadow-2xl flex flex-col transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
            {/* Header — pinned */}
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#0a0b0d]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                    <FiTruck className="text-orange-400" size={15} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-black text-white truncate">Ship Now</h2>
                    <p className="text-xs text-neutral-400 truncate">
                      {shipNowOrder?.soNumber} — {shipNowOrder?.customerName}
                    </p>
                  </div>
                </div>
                {/* EasyShip Link Status */}
                {(() => {
                  const esId = shipNowPkg?.easyshipShipmentId || (shipNowPkg?.items as any)?.easyshipShipmentId
                  return esId ? (
                    <p className="text-[10px] text-emerald-400 font-bold mt-1.5 flex items-center gap-1 pl-10">
                      <FiLink size={10} /> Will use existing EasyShip shipment: {esId}
                    </p>
                  ) : (
                    <p className="text-[10px] text-amber-400/70 font-bold mt-1.5 flex items-center gap-1 pl-10">
                      <FiLink size={10} /> Will search EasyShip by SO# before creating new shipment
                    </p>
                  )
                })()}
              </div>
              <button onClick={() => !shipNowBuying && setShipNowOpen(false)} className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/5 transition-colors">
                <FiX size={18} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Shipment Result */}
              {shipNowResult && (
                <div className="space-y-4">
                  {/* Top Confirmation Banner with Prominent Sales Rep */}
                  <div className="bg-gradient-to-r from-emerald-950/70 via-neutral-900 to-amber-950/40 border border-emerald-500/40 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                          <FiCheck size={20} />
                        </div>
                        <div>
                          <div className="text-white font-bold text-base leading-tight">
                            Label Purchased &amp; Billed Successfully!
                          </div>
                          <div className="text-xs text-emerald-400/90 mt-0.5">
                            Zoho Books updated with carrier, tracking &amp; shipping charges
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
                        {/* Prominent Sales Rep Badge */}
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs shadow-sm">
                          <FiUser size={13} className="text-amber-400" />
                          <span>Rep: {shipNowResult.salesperson || 'Unassigned'}</span>
                        </div>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {shipNowResult.purchasedAt || 'Confirmed'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ─── Dedicated Print Status & Action Box (Easyship Status Handled) ─── */}
                  <div className={`rounded-2xl p-4 border transition-all ${
                    (shipNowResult.labelState === 'printed' || markedPrinted)
                      ? 'bg-emerald-950/30 border-emerald-500/30'
                      : 'bg-amber-950/40 border-amber-500/40 shadow-lg shadow-amber-950/30'
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          (shipNowResult.labelState === 'printed' || markedPrinted)
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse'
                        }`}>
                          <FiPrinter size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-bold text-sm">
                              {(shipNowResult.labelState === 'printed' || markedPrinted)
                                ? 'Label Dispatched to Printer'
                                : 'Label Ready — Print Required'}
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              (shipNowResult.labelState === 'printed' || markedPrinted)
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}>
                              Status: {(shipNowResult.labelState === 'printed' || markedPrinted) ? 'Printed' : 'Not Printed'}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-300 mt-1">
                            {(shipNowResult.labelState === 'printed' || markedPrinted)
                              ? '4×6 thermal print job dispatched. Use the reprint action below if you need another copy.'
                              : 'Label has not been printed yet. Click below to print immediately to your 4×6 thermal printer (Zebra / default).'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          onClick={() => {
                            triggerAutoPrintLabel(shipNowResult.labelUrl)
                            setMarkedPrinted(true)
                            toast.success('Print dispatched to thermal printer!')
                          }}
                          className={`td-btn td-btn-sm font-bold cursor-pointer flex items-center gap-1.5 shadow-md ${
                            (shipNowResult.labelState === 'printed' || markedPrinted)
                              ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-white/10'
                              : 'bg-amber-500 hover:bg-amber-400 text-black border-none shadow-amber-950/40'
                          }`}
                        >
                          <FiPrinter size={14} />
                          {(shipNowResult.labelState === 'printed' || markedPrinted) ? 'Reprint 4×6 Label' : 'Print 4×6 Label Now'}
                        </button>
                      </div>
                    </div>
                    {/* Mark as printed toggle */}
                    <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-xs text-neutral-400">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={markedPrinted || shipNowResult.labelState === 'printed'}
                          onChange={e => setMarkedPrinted(e.target.checked)}
                          className="rounded bg-black/40 border-white/20 text-emerald-500 focus:ring-0 cursor-pointer"
                        />
                        <span>Mark shipment as printed in system</span>
                      </label>
                      <span className="text-[11px] text-neutral-500 font-mono">Format: 4×6 Thermal Label</span>
                    </div>
                  </div>

                  {/* Direct Label Link, Tracking & 1-Click Slack/Email Summary Box */}
                  <div className="bg-black/30 border border-white/10 rounded-2xl p-4 space-y-3">
                    <div className="text-xs font-bold text-neutral-300 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-neutral-200">
                        <FiFileText className="text-orange-400" /> Direct 4×6 Shipping Label URL
                      </span>
                      {shipNowResult.easyshipShipmentId && (
                        <span className="text-[10px] text-neutral-400 font-mono">
                          EasyShip ID: <span className="text-neutral-200">{shipNowResult.easyshipShipmentId}</span>
                        </span>
                      )}
                    </div>
                    
                    {/* URL Box with 1-Click Copy */}
                    {shipNowResult.labelUrl && (
                      <div className="flex items-center gap-2 bg-black/60 border border-white/10 rounded-xl px-3 py-2">
                        <a
                          href={shipNowResult.labelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-xs text-orange-400 hover:text-orange-300 font-mono truncate underline decoration-orange-500/40 hover:decoration-orange-400"
                          title={shipNowResult.labelUrl}
                        >
                          {shipNowResult.labelUrl}
                        </a>
                        <button
                          onClick={() => {
                            if (navigator?.clipboard) {
                              navigator.clipboard.writeText(shipNowResult.labelUrl)
                              setCopiedLabelUrl(true)
                              toast.success('Label link copied to clipboard!')
                              setTimeout(() => setCopiedLabelUrl(false), 2500)
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white text-xs flex items-center gap-1.5 transition-colors border border-white/10 shrink-0 font-medium cursor-pointer"
                          title="Copy direct link"
                        >
                          {copiedLabelUrl ? <FiCheck size={12} className="text-emerald-400" /> : <FiCopy size={12} />}
                          <span>{copiedLabelUrl ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    )}

                    {/* Action buttons including Full Slack/Email Summary */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {shipNowResult.labelUrl && (
                        <a
                          href={shipNowResult.labelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="td-btn td-btn-sm bg-neutral-800 hover:bg-neutral-700 text-white border border-white/10 flex items-center gap-1.5"
                        >
                          <FiExternalLink size={13} /> Open Label (PDF)
                        </a>
                      )}
                      {shipNowResult.trackingPageUrl && (
                        <a
                          href={shipNowResult.trackingPageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="td-btn td-btn-sm bg-neutral-800 hover:bg-neutral-700 text-white border border-white/10 flex items-center gap-1.5"
                        >
                          <FiTruck size={13} /> Live Tracking Page
                        </a>
                      )}
                      <button
                        onClick={() => handleCopyShipmentSummary(shipNowResult)}
                        className="td-btn td-btn-sm bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 cursor-pointer font-bold ml-auto"
                        title="Copy full shipment details formatted for team chat or email"
                      >
                        <FiCopy size={13} /> Copy Summary for Slack / Email
                      </button>
                    </div>
                  </div>

                  {/* Comprehensive 6-Card Shipment Information Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    {/* 1. Carrier & Service */}
                    <div className="bg-black/20 border border-white/5 rounded-xl p-3 space-y-1">
                      <div className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Carrier &amp; Service</div>
                      <div className="text-white font-bold">{shipNowResult.courierName || 'Carrier'}</div>
                      <div className="text-xs text-neutral-400">
                        Total Cost: <span className="text-emerald-400 font-bold">${shipNowResult.totalCharge?.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* 2. Tracking Numbers (Master & Child) */}
                    <div className="bg-black/20 border border-white/5 rounded-xl p-3 space-y-1">
                      <div className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Master Tracking #</div>
                      <div className="text-white font-mono font-bold text-xs truncate select-all">{shipNowResult.trackingNumber}</div>
                      {Array.isArray(shipNowResult.childTrackingNumbers) && shipNowResult.childTrackingNumbers.length > 0 ? (
                        <div className="text-[10px] text-orange-400 font-mono">
                          +{shipNowResult.childTrackingNumbers.length} Child Parcels Linked
                        </div>
                      ) : (
                        <div className="text-[11px] text-neutral-400">Single tracking number</div>
                      )}
                    </div>

                    {/* 3. Sales Order & Package */}
                    <div className="bg-black/20 border border-white/5 rounded-xl p-3 space-y-1">
                      <div className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Sales Order &amp; Package</div>
                      <div className="text-white font-semibold">SO: {shipNowResult.soNumber || shipNowResult.orderNumber}</div>
                      <div className="text-xs text-neutral-400 font-mono">{shipNowResult.packageNumber}</div>
                    </div>

                    {/* 4. Sales Rep Attribution */}
                    <div className="bg-black/20 border border-white/5 rounded-xl p-3 space-y-1">
                      <div className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider flex items-center gap-1">
                        <FiUser size={10} className="text-amber-400" /> Sales Representative
                      </div>
                      <div className="text-amber-300 font-bold">{shipNowResult.salesperson || 'Unassigned'}</div>
                      <div className="text-[11px] text-neutral-400">Account Sales Rep</div>
                    </div>

                    {/* 5. Transit Window & Parcel Specs */}
                    <div className="bg-black/20 border border-white/5 rounded-xl p-3 space-y-1">
                      <div className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Transit &amp; Parcels</div>
                      <div className="text-white font-semibold">
                        {shipNowResult.minDeliveryTime && shipNowResult.maxDeliveryTime
                          ? `${shipNowResult.minDeliveryTime}–${shipNowResult.maxDeliveryTime} business days`
                          : 'Standard Delivery'}
                      </div>
                      <div className="text-xs text-neutral-400 font-mono">
                        {shipNowResult.parcelCount || 1} Box • {shipNowResult.weight} lbs • {shipNowResult.dimensions?.length}×{shipNowResult.dimensions?.width}×{shipNowResult.dimensions?.height} in
                      </div>
                    </div>

                    {/* 6. Customer Contact Details */}
                    <div className="bg-black/20 border border-white/5 rounded-xl p-3 space-y-1">
                      <div className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Customer Contact</div>
                      <div className="text-white font-semibold truncate">{shipNowResult.customerName || 'Customer'}</div>
                      <div className="text-xs text-neutral-400 truncate">
                        {shipNowResult.customerPhone || shipNowResult.customerEmail || 'Contact on file'}
                      </div>
                    </div>
                  </div>

                  {/* Multi-Parcel Child Tracking List (if applicable) */}
                  {Array.isArray(shipNowResult.childTrackingNumbers) && shipNowResult.childTrackingNumbers.length > 0 && (
                    <div className="bg-neutral-900/50 border border-orange-500/20 rounded-xl p-3.5 space-y-2">
                      <div className="text-[10px] text-orange-400 uppercase font-bold tracking-wider flex items-center gap-1">
                        <FiLayers size={11} /> Multi-Parcel Master Shipment Tracking Numbers ({shipNowResult.childTrackingNumbers.length + 1} Boxes)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                        <div className="bg-black/40 p-2 rounded-lg border border-white/5 flex items-center justify-between">
                          <span className="text-neutral-400">Master Box 1:</span>
                          <span className="text-white font-bold select-all">{shipNowResult.trackingNumber}</span>
                        </div>
                        {shipNowResult.childTrackingNumbers.map((trk: string, tIdx: number) => (
                          <div key={tIdx} className="bg-black/40 p-2 rounded-lg border border-white/5 flex items-center justify-between">
                            <span className="text-neutral-400">Child Box {tIdx + 2}:</span>
                            <span className="text-white font-bold select-all">{trk}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Financial & Surcharge Breakdown Card */}
                  <div className="bg-black/20 border border-white/5 rounded-xl p-3.5 space-y-2">
                    <div className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <FiDollarSign size={11} className="text-emerald-400" /> Financial &amp; Fee Breakdown
                      </span>
                      <span className="text-emerald-400 font-bold">Billed to Zoho Package</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-black/40 rounded-lg p-2 border border-white/5">
                        <div className="text-[10px] text-neutral-500 uppercase">Total Shipping</div>
                        <div className="text-white font-black text-sm mt-0.5">${shipNowResult.totalCharge?.toFixed(2)}</div>
                      </div>
                      <div className="bg-black/40 rounded-lg p-2 border border-white/5">
                        <div className="text-[10px] text-neutral-500 uppercase">Residential Surcharge</div>
                        <div className={`font-bold text-sm mt-0.5 ${shipNowResult.residentialSurcharge > 0 ? 'text-amber-400' : 'text-neutral-400'}`}>
                          {shipNowResult.residentialSurcharge > 0 ? `+$${shipNowResult.residentialSurcharge.toFixed(2)}` : '$0.00 (Dock)'}
                        </div>
                      </div>
                      <div className="bg-black/40 rounded-lg p-2 border border-white/5">
                        <div className="text-[10px] text-neutral-500 uppercase">Fuel Surcharge</div>
                        <div className="text-neutral-300 font-semibold text-sm mt-0.5">
                          {shipNowResult.fuelSurcharge > 0 ? `+$${shipNowResult.fuelSurcharge.toFixed(2)}` : 'Included'}
                        </div>
                      </div>
                      <div className="bg-black/40 rounded-lg p-2 border border-white/5">
                        <div className="text-[10px] text-neutral-500 uppercase">Insurance / Protection</div>
                        <div className="text-neutral-300 font-semibold text-sm mt-0.5">
                          {shipNowResult.insuranceFee > 0 ? `+$${shipNowResult.insuranceFee.toFixed(2)}` : 'Carrier Base'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recipient & Destination Address */}
                  {shipNowResult.destinationAddress && (
                    <div className="bg-black/20 border border-white/5 rounded-xl p-3.5 space-y-1">
                      <div className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <FiMapPin size={11} className="text-orange-400" /> Destination Address
                        </span>
                        {shipNowResult.residentialSurcharge > 0 ? (
                          <span className="text-[10px] text-amber-300 font-bold bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30">
                            🏠 Residential Delivery Address
                          </span>
                        ) : (
                          <span className="text-[10px] text-blue-300 font-bold bg-blue-950/40 px-2 py-0.5 rounded border border-blue-500/30">
                            🏢 Commercial Facility / Dock
                          </span>
                        )}
                      </div>
                      <div className="text-white font-bold text-sm">{shipNowResult.customerName || 'Customer'}</div>
                      <div className="text-xs text-neutral-300">
                        {shipNowResult.destinationAddress.address && <div>{shipNowResult.destinationAddress.address}</div>}
                        <div>
                          {[shipNowResult.destinationAddress.city, shipNowResult.destinationAddress.state, shipNowResult.destinationAddress.zip].filter(Boolean).join(', ')}
                          {shipNowResult.destinationAddress.country && ` • ${shipNowResult.destinationAddress.country}`}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Package Contents / Items Shipped (with Sales Rep for Every Item) */}
                  {Array.isArray(shipNowResult.items) && shipNowResult.items.length > 0 && (
                    <div className="bg-black/20 border border-white/5 rounded-xl p-3.5 space-y-2">
                      <div className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <FiPackage size={11} className="text-orange-400" /> Package Contents ({shipNowResult.items.length} {shipNowResult.items.length === 1 ? 'item' : 'items'})
                        </span>
                        <span>Item Sales Rep &amp; Quantity</span>
                      </div>
                      <div className="space-y-2 divide-y divide-white/5">
                        {shipNowResult.items.map((it: any, idx: number) => {
                          const itemRep = it.salesperson || shipNowResult.salesperson || 'Unassigned'
                          return (
                            <div key={idx} className="flex items-center justify-between pt-2 text-xs">
                              <div className="min-w-0 pr-3">
                                <div className="text-white font-medium truncate">{it.description || it.name || 'Item'}</div>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {it.sku && <span className="text-[10px] text-neutral-500 font-mono">SKU: {it.sku}</span>}
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/30 text-[9px] font-bold text-amber-300">
                                    <FiUser size={9} /> Rep: {itemRep}
                                  </span>
                                </div>
                              </div>
                              <div className="px-2.5 py-1 rounded bg-white/5 border border-white/10 font-bold text-neutral-200 shrink-0 text-xs">
                                {it.quantity}×
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Bottom Modal Actions */}
                  <div className="pt-3 flex items-center justify-between border-t border-white/10">
                    <button
                      onClick={() => setShipNowOpen(false)}
                      className="td-btn td-btn-sm bg-neutral-800 hover:bg-neutral-700 text-white border-none px-4 cursor-pointer"
                    >
                      Done &amp; Close
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setShipNowOpen(false)
                          setPickupModalOpen(true)
                        }}
                        className="td-btn td-btn-sm bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 flex items-center gap-1.5 font-bold cursor-pointer"
                      >
                        <FiCalendar size={13} /> Schedule Pickup
                      </button>
                      <button
                        onClick={() => {
                          triggerAutoPrintLabel(shipNowResult.labelUrl)
                          setMarkedPrinted(true)
                          toast.success('Reprint sent to 4×6 printer!')
                        }}
                        className="td-btn td-btn-sm bg-emerald-600 hover:bg-emerald-500 text-white border-none flex items-center gap-1.5 font-bold cursor-pointer"
                      >
                        <FiPrinter size={14} /> Reprint Label
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Package & Weight */}
              {!shipNowResult && (
                <>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">Weight (lbs)</label>
                      <input type="number" value={shipNowWeight} onChange={e => { setShipNowWeight(e.target.value); setShipNowBoxPreset(''); }} className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">L (in)</label>
                      <input type="number" value={shipNowDims.length} onChange={e => { setShipNowDims(d => ({...d, length: e.target.value})); setShipNowBoxPreset(''); }} className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">W (in)</label>
                      <input type="number" value={shipNowDims.width} onChange={e => { setShipNowDims(d => ({...d, width: e.target.value})); setShipNowBoxPreset(''); }} className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">H (in)</label>
                      <input type="number" value={shipNowDims.height} onChange={e => { setShipNowDims(d => ({...d, height: e.target.value})); setShipNowBoxPreset(''); }} className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none" />
                    </div>
                  </div>

                  {/* Preset Box Sizes */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1.5">Quick Box Presets</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: '12×9×3', l: '12', w: '9', h: '3', wt: '5' },
                        { label: '14" Blade', l: '15', w: '15', h: '1', wt: '5' },
                        { label: '16" Blade', l: '17', w: '17', h: '1', wt: '6' },
                        { label: '18" Blade', l: '19', w: '19', h: '1', wt: '7' },
                        { label: '20" Blade', l: '21', w: '21', h: '1', wt: '8' },
                        { label: 'Multi 15"', l: '15', w: '15', h: '4', wt: '20' },
                        { label: 'Multi 16"', l: '16', w: '16', h: '4', wt: '25' },
                        { label: 'Multi 17"', l: '17', w: '17', h: '4', wt: '30' },
                        ...customBoxPresets,
                      ].map((preset, pIdx) => {
                        const isActive = shipNowDims.length === preset.l && shipNowDims.width === preset.w && shipNowDims.height === preset.h
                        const isCustom = pIdx >= 8
                        return (
                          <div key={preset.label + pIdx} className="relative group">
                            <button
                              onClick={() => {
                                const newDims = { length: preset.l, width: preset.w, height: preset.h }
                                setShipNowDims(newDims)
                                setShipNowWeight(preset.wt)
                                setShipNowBoxPreset(preset.label)
                                fetchShipNowRates(shipNowOrder, preset.wt, newDims, shipNowPkg, true, preset.label)
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                                isActive
                                  ? 'bg-orange-600 text-white border border-orange-500 shadow-sm'
                                  : 'bg-black/30 text-neutral-400 border border-white/10 hover:border-orange-500/30 hover:text-white'
                              }`}
                            >
                              {preset.label}
                            </button>
                            {isCustom && (
                              <button
                                onClick={(e) => { e.stopPropagation(); removeCustomPreset(pIdx - 8) }}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white text-[8px] items-center justify-center hidden group-hover:flex"
                              >
                                <FiX size={8} />
                              </button>
                            )}
                          </div>
                        )
                      })}
                      {/* Add custom preset button */}
                      <button
                        onClick={() => setAddingPreset(!addingPreset)}
                        className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-black/30 text-neutral-500 border border-dashed border-white/10 hover:border-orange-500/30 hover:text-orange-400 transition-all"
                      >
                        <FiPlus size={10} className="inline" /> Add
                      </button>
                    </div>
                    {/* Add preset form */}
                    {addingPreset && (
                      <div className="mt-2 flex gap-1.5 items-end">
                        <div className="w-20">
                          <label className="text-[8px] text-neutral-600 font-bold block">NAME</label>
                          <input value={newPreset.label} onChange={e => setNewPreset(p => ({...p, label: e.target.value}))} className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white outline-none" placeholder='e.g. "Small"' />
                        </div>
                        <div className="w-12">
                          <label className="text-[8px] text-neutral-600 font-bold block">L</label>
                          <input type="number" value={newPreset.l} onChange={e => setNewPreset(p => ({...p, l: e.target.value}))} className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white outline-none" />
                        </div>
                        <div className="w-12">
                          <label className="text-[8px] text-neutral-600 font-bold block">W</label>
                          <input type="number" value={newPreset.w} onChange={e => setNewPreset(p => ({...p, w: e.target.value}))} className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white outline-none" />
                        </div>
                        <div className="w-12">
                          <label className="text-[8px] text-neutral-600 font-bold block">H</label>
                          <input type="number" value={newPreset.h} onChange={e => setNewPreset(p => ({...p, h: e.target.value}))} className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white outline-none" />
                        </div>
                        <div className="w-12">
                          <label className="text-[8px] text-neutral-600 font-bold block">LBS</label>
                          <input type="number" value={newPreset.wt} onChange={e => setNewPreset(p => ({...p, wt: e.target.value}))} className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white outline-none" placeholder="5" />
                        </div>
                        <button onClick={saveCustomPreset} className="px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-bold">Save</button>
                        <button onClick={() => setAddingPreset(false)} className="px-2 py-1 rounded-lg bg-neutral-800 text-neutral-400 text-[10px]">✕</button>
                      </div>
                    )}
                  </div>

                  {/* Items Being Shipped */}
                  {shipNowPkg?.items && (() => {
                    const pkgItems = financialZohoLineItems(shipNowPkg.items?.lineItems || shipNowPkg.items?.line_items || (Array.isArray(shipNowPkg.items) ? shipNowPkg.items : []))
                    return pkgItems.length > 0 ? (
                      <div className="bg-black/20 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Items Being Shipped</div>
                          {(pkgItems.length > 1 || parseFloat(shipNowWeight) >= 38) && (
                            <button
                              onClick={handleSplitPackage}
                              disabled={splittingPackage}
                              className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
                              title="Split this package into 2 packages in Zoho &amp; system to get cheaper rates"
                            >
                              <FiScissors size={11} /> {splittingPackage ? 'Splitting...' : 'Split Package'}
                            </button>
                          )}
                        </div>
                        <div className="space-y-1">
                          {pkgItems.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              <span className="text-neutral-600">•</span>
                              <span className="text-orange-400 font-semibold">{item.quantity || 1}x</span>
                              <span className="text-neutral-300 truncate">{item.name || item.item_name || item.description || 'Item'}</span>
                              {(item.sku || item.sku_code) && <span className="text-neutral-600 text-[10px] font-mono ml-auto shrink-0">{item.sku || item.sku_code}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null
                  })()}

                  {/* Fallback only if no package items and single package order */}
                  {(!shipNowPkg?.items || !(shipNowPkg.items?.lineItems || shipNowPkg.items?.line_items || []).length) && (
                    shipNowOrder?.packages?.length === 1 && shipNowOrder?.lineItems?.length > 0 ? (
                      <div className="bg-black/20 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Order Items (Single Package)</div>
                          {(shipNowOrder.lineItems.length > 1 || parseFloat(shipNowWeight) >= 38) && (
                            <button
                              onClick={handleSplitPackage}
                              disabled={splittingPackage}
                              className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
                              title="Split this package into 2 packages to get cheaper rates"
                            >
                              <FiScissors size={11} /> {splittingPackage ? 'Splitting...' : 'Split Package'}
                            </button>
                          )}
                        </div>
                        <div className="space-y-1">
                          {shipNowOrder.lineItems.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              <span className="text-neutral-600">•</span>
                              <span className="text-orange-400 font-semibold">{item.quantity || 1}x</span>
                              <span className="text-neutral-300 truncate">{item.name || 'Item'}</span>
                              {item.sku && <span className="text-neutral-600 text-[10px] font-mono ml-auto shrink-0">{item.sku}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-black/20 rounded-xl p-3">
                        <p className="text-xs text-neutral-500 italic">Package contents pending sync from Zoho Books</p>
                      </div>
                    )
                  )}

                  {/* Destination Preview */}
                  <div className="bg-black/20 rounded-xl p-3.5 flex items-start gap-3">
                    <FiMapPin className="text-orange-400 shrink-0 mt-0.5" />
                    <div className="text-sm flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-white font-medium truncate">{shipNowOrder?.customerName}</div>
                        {shipNowOrder?.salesperson && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/15 border border-amber-500/30 text-amber-300 shrink-0">
                            <FiUser size={10} /> {shipNowOrder.salesperson}
                          </span>
                        )}
                      </div>
                      <div className="text-neutral-400 text-xs mt-0.5">
                        {shipNowOrder?.shippingAddress?.address || shipNowOrder?.shippingAddress?.street || 'Address on file'}, {shipNowOrder?.shippingAddress?.city}, {shipNowOrder?.shippingAddress?.state} {shipNowOrder?.shippingAddress?.zip || shipNowOrder?.shippingAddress?.postal_code}
                      </div>

                      {/* Address Analysis & Surcharge Indicator */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {shipNowRates.some((r: any) => r.residentialSurcharge > 0) ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/50 border border-amber-500/30 text-amber-300 flex items-center gap-1">
                            🏠 Residential Address (Surcharge Included)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950/50 border border-blue-500/30 text-blue-300 flex items-center gap-1">
                            🏢 Commercial Delivery Dock
                          </span>
                        )}
                        {addressAnalysis?.isRemoteArea && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950/50 border border-purple-500/30 text-purple-300 flex items-center gap-1">
                            ⚠️ Extended Area Surcharge (+${addressAnalysis.remoteAreaSurcharge})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ─── Package Splitting Optimizer Card (Over 40 lbs / Multi-item) ─── */}
                  {splitRecommendation && (
                    <div className={`p-4 rounded-2xl border transition-all ${
                      splitRecommendation.isCheaper
                        ? 'bg-emerald-950/40 border-emerald-500/40 shadow-lg shadow-emerald-950/20'
                        : 'bg-orange-950/30 border-orange-500/30'
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full ${
                              splitRecommendation.isCheaper
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                            }`}>
                              {splitRecommendation.isCheaper ? '💰 Rate Optimizer Recommendation' : '📦 Multi-Package Option'}
                            </span>
                            {splitRecommendation.isCheaper && (
                              <span className="text-emerald-400 text-xs font-bold">
                                Save ${splitRecommendation.savings?.toFixed(2)} by splitting!
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-200 font-medium">
                            {splitRecommendation.summary}
                          </p>
                          <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                            <div className="bg-black/40 rounded-xl p-2.5 border border-white/5">
                              <div className="text-[10px] text-neutral-500 font-bold uppercase">1 Single Heavy Box ({shipNowWeight} lbs)</div>
                              <div className="text-white font-bold text-sm mt-0.5">${splitRecommendation.singlePrice?.toFixed(2)}</div>
                              <div className="text-[10px] text-neutral-400">Higher carrier weight tier</div>
                            </div>
                            <div className="bg-emerald-500/10 rounded-xl p-2.5 border border-emerald-500/20">
                              <div className="text-[10px] text-emerald-400 font-bold uppercase">2 Split Boxes ({splitRecommendation.box1?.weight} lbs each)</div>
                              <div className="text-emerald-300 font-bold text-sm mt-0.5">${splitRecommendation.splitPrice?.toFixed(2)} total</div>
                              <div className="text-[10px] text-emerald-400/80">via {splitRecommendation.carrierName}</div>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={handleSplitPackage}
                          disabled={splittingPackage}
                          className="td-btn td-btn-sm bg-emerald-600 hover:bg-emerald-500 text-white font-bold shrink-0 self-start sm:self-center shadow-md shadow-emerald-950/40 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {splittingPackage ? <FiRefreshCw className="animate-spin" size={13} /> : <FiScissors size={13} />}
                          Split into 2 Packages
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Rate Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">Select Carrier</h3>
                        {shipNowBoxPreset && (
                          <span className="text-[10px] text-orange-400 font-semibold bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
                            {shipNowBoxPreset} ({shipNowDims.length}"×{shipNowDims.width}"×{shipNowDims.height}", {shipNowWeight} lbs)
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setShipNowRates([])
                          fetchShipNowRates(shipNowOrder, shipNowWeight, shipNowDims, shipNowPkg, true)
                        }}
                        disabled={shipNowLoading}
                        className="td-btn td-btn-sm bg-orange-600 hover:bg-orange-500 text-white font-bold border-none text-[11px] flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50 transition-all active:scale-95"
                        title="Save box dimensions and weight to this package, then recalculate live carrier rates"
                      >
                        <FiRefreshCw className={shipNowLoading ? "animate-spin" : ""} size={11} /> 
                        Save Box &amp; Refresh Rates
                      </button>
                    </div>
                    {shipNowLoading && (
                      <div className="flex items-center gap-2 text-neutral-400 text-sm py-4">
                        <FiRefreshCw className="animate-spin" /> Loading rates...
                      </div>
                    )}
                    {!shipNowLoading && shipNowRates.length === 0 && (
                      <div className="text-neutral-500 text-sm py-4">No rates available. Check the shipping address.</div>
                    )}
                    <div className="space-y-2">
                      {shipNowRates.slice(0, 15).map((rate: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between bg-black/20 border border-white/5 rounded-xl p-3 hover:border-orange-500/30 transition-colors">
                          <div className="flex items-center gap-3">
                            {rate.logoUrl && <img src={rate.logoUrl} alt="" className="w-6 h-6 rounded" />}
                            <div>
                              <div className="text-sm font-medium text-white">{rate.courierName}</div>
                              <div className="text-[10px] text-neutral-500 flex items-center gap-2">
                                <span>
                                  {rate.minDeliveryTime && rate.maxDeliveryTime
                                    ? `${rate.minDeliveryTime}-${rate.maxDeliveryTime} days`
                                    : 'Transit time varies'}
                                </span>
                                {rate.residentialSurcharge > 0 && (
                                  <span className="text-amber-400 font-semibold">• Resi: +${rate.residentialSurcharge.toFixed(2)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-sm font-black text-white">${rate.totalCharge?.toFixed(2)}</div>
                            </div>
                            <button
                              onClick={() => handleBuyLabel(rate)}
                              disabled={shipNowBuying}
                              className="td-btn td-btn-sm bg-orange-600 hover:bg-orange-500 text-white border-none disabled:opacity-50"
                            >
                              {shipNowBuying ? <FiRefreshCw className="animate-spin" size={12} /> : <FiTruck size={12} />}
                              Buy Label
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      , document.body)}
      </div>
    </div>
  )
}
