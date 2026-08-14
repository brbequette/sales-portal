"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { FiTruck, FiBox, FiPackage, FiCheck, FiSearch, FiMapPin, FiExternalLink, FiChevronDown, FiChevronUp, FiRefreshCw, FiDownloadCloud, FiDollarSign, FiX, FiEdit2, FiPlus, FiTrash2, FiPrinter, FiShield, FiXCircle, FiFileText, FiLink } from "react-icons/fi"
import { CreatePackageModal } from "@/components/CreatePackageModal"
import { CreateDropshipmentModal } from "@/components/CreateDropshipmentModal"
import { toast } from 'react-hot-toast';
import { PeriodSelector, isInPeriod, type PeriodValue } from "@/components/PeriodSelector"

type ShipStatus = "all" | "needs_packaging" | "packaged" | "shipped" | "delivered"

interface ShippingOrder {
  id: string
  zohoId: string
  soNumber: string
  customerName: string
  accountId: string
  orderDate: string
  amount: number
  status: string
  shipStatus: ShipStatus
  shippingAddress: any
  lineItemCount: number
  lineItemNames: string[]
  lineItems?: { name: string; sku: string; quantity: number }[]
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
}

interface DropshipInfo {
  id: string
  zohoId: string
  vendorName: string
  shipToName?: string
  referenceNumber?: string
  date: string
  total: number
  status: string
  trackingNumber: string
  shippingCharge?: number
  lineItems?: Array<{ name: string; sku: string; quantity: number; rate: number }>
}

const STATUS_TABS: { key: ShipStatus; label: string; icon: any; color: string; bg: string }[] = [
  { key: "all", label: "All Orders", icon: FiTruck, color: "text-neutral-300", bg: "bg-neutral-800" },
  { key: "needs_packaging", label: "Needs Packaging", icon: FiBox, color: "text-amber-400", bg: "bg-amber-950/50" },
  { key: "packaged", label: "Packaged", icon: FiPackage, color: "text-blue-400", bg: "bg-blue-950/50" },
  { key: "shipped", label: "Shipped", icon: FiTruck, color: "text-purple-400", bg: "bg-purple-950/50" },
  { key: "delivered", label: "Delivered", icon: FiCheck, color: "text-emerald-400", bg: "bg-emerald-950/50" },
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

  // Package creation state
  const [packageModal, setPackageModal] = useState<{ salesOrderId: string; lineItems: any[] } | null>(null)
  const [dropshipModal, setDropshipModal] = useState<{ salesOrderId: string; lineItems: any[] } | null>(null)
  const [fetchingLineItems, setFetchingLineItems] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

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
      const res = await fetch("/api/shipping", {
        method: "PUT",
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

  const handleExpandOrder = async (orderId: string) => {
    const isExpanded = expandedOrder === orderId
    if (isExpanded) {
      setExpandedOrder(null)
      return
    }

    setExpandedOrder(orderId)

    const order = orders.find(o => o.id === orderId)
    if (order && (!order.lineItems || order.lineItems.length === 0)) {
      await handleSyncSalesOrderDetail(order.zohoId)
    }

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
                      ? { ...d, lineItems: data.lineItems, trackingNumber: data.trackingNumber || d.trackingNumber, shippingCharge: data.shippingCharge || d.shippingCharge }
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
          tables: ["packages", "purchaseOrders", "salesOrders", "invoices", "vendors", "payments", "products"],
          force: true
        })
      })

      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          const counts = Object.entries(data.results || {})
            .map(([table, info]: [string, any]) => `${table}: ${info.synced}`)
            .join(", ")
          setSyncResult(`✅ Sync complete — ${counts}`)
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
      const res = await fetch("/api/shipping", {
        method: "PUT",
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
      const res = await fetch("/api/shipping", {
        method: "PUT",
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

  // Client-side period filter on orderDate
  const filteredOrders = useMemo(() => {
    if (shipPeriod === 'all') return orders
    return orders.filter(o => isInPeriod((o as any).orderDate || (o as any).order_date || (o as any).date, shipPeriod, shipCustomStart, shipCustomEnd))
  }, [orders, shipPeriod, shipCustomStart, shipCustomEnd])

  // Compilation of items that are packaged but need shipped
  const getPackagedButNeedShippedItemsCompilation = () => {
    const compilation: Record<string, { sku: string; name: string; quantity: number }> = {}
    filteredOrders.forEach(order => {
      if (order.shipStatus === "packaged" && Array.isArray(order.lineItems)) {
        order.lineItems.forEach(item => {
          const sku = item.sku || item.name || "Unknown SKU"
          if (!compilation[sku]) {
            compilation[sku] = {
              sku,
              name: item.name || item.sku || "Unknown Item",
              quantity: 0
            }
          }
          compilation[sku].quantity += item.quantity || 0
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
  const [customBoxPresets, setCustomBoxPresets] = useState<Array<{ label: string; l: string; w: string; h: string; wt: string }>>(() => {
    if (typeof window !== 'undefined') {
      try { return JSON.parse(localStorage.getItem('customBoxPresets') || '[]') } catch { return [] }
    }
    return []
  })

  const saveCustomPreset = () => {
    if (!newPreset.label || !newPreset.l || !newPreset.w || !newPreset.h) return
    const updated = [...customBoxPresets, { ...newPreset, wt: newPreset.wt || '5' }]
    setCustomBoxPresets(updated)
    localStorage.setItem('customBoxPresets', JSON.stringify(updated))
    setNewPreset({ label: '', l: '', w: '', h: '', wt: '' })
    setAddingPreset(false)
  }

  const removeCustomPreset = (idx: number) => {
    const updated = customBoxPresets.filter((_, i) => i !== idx)
    setCustomBoxPresets(updated)
    localStorage.setItem('customBoxPresets', JSON.stringify(updated))
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

  const fetchShipNowRates = async (order: any, weight: string, dims: { length: string; width: string; height: string }) => {
    setShipNowLoading(true)
    setShipNowRates([])
    const parsedWeight = parseFloat(weight);
    const parsedLength = parseFloat(dims.length);
    const parsedWidth = parseFloat(dims.width);
    const parsedHeight = parseFloat(dims.height);
    
    if (isNaN(parsedWeight) || isNaN(parsedLength) || isNaN(parsedWidth) || isNaN(parsedHeight)) {
      toast.error('Weight and dimensions are required');
      setShipNowLoading(false);
      return;
    }

    try {
      const destAddr = order.shippingAddress || {}
      const res = await fetch('/api/shipping/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zip: destAddr.zip || destAddr.postal_code || '',
          city: destAddr.city || '',
          state: destAddr.state || '',
          country: destAddr.country || destAddr.country_alpha2 || 'US',
          weight: parsedWeight,
          length: parsedLength,
          width: parsedWidth,
          height: parsedHeight,
          declaredValue: 0.10,
        })
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        toast.error(`Rate error: ${data.error || `HTTP ${res.status}`}`)
        return
      }
      if (data.rates && data.rates.length > 0) {
        const sorted = [...data.rates].sort((a: any, b: any) => (a.totalCharge || 999) - (b.totalCharge || 999))
        setShipNowRates(sorted)
      } else {
        toast.error('No rates returned — check shipping address fields')
      }
    } catch (e: any) {
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
    setShipNowOpen(true)

    // Fetch rates with the current weight/dims state values
    await fetchShipNowRates(order, shipNowWeight, shipNowDims)
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
      const res = await fetch('/api/shipping/ship-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: shipNowPkg.id,
          packageZohoId: shipNowPkg.zohoId,
          salesOrderZohoId: shipNowOrder.zohoId,
          easyshipShipmentId: shipNowPkg.items?.easyshipShipmentId || shipNowPkg.easyshipShipmentId || null,
          courierServiceId: rate.courierServiceId || rate.courierName,
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
          items: (() => {
            // Build items matching EasyShip format
            const pkgItemsList = shipNowPkg.items?.line_items || shipNowPkg.items?.items || []
            if (Array.isArray(pkgItemsList) && pkgItemsList.length > 0) {
              return pkgItemsList.map((li: any) => ({
                description: li.name || li.item_name || li.description || 'Item',
                sku: li.sku || li.sku_code || '',
                quantity: parseInt(li.quantity) || 1,
                declaredValue: 0.10,  // Match EasyShip customs value
                weight: parsedWeight / (pkgItemsList.length || 1),
              }))
            }
            // Fallback: use order line items
            return shipNowOrder.lineItems?.map((li: any) => ({
              description: li.name || 'Order item',
              sku: li.sku || '',
              quantity: li.quantity || 1,
              declaredValue: 0.10,
              weight: parsedWeight / (shipNowOrder.lineItems?.length || 1),
            })) || [{ description: 'Order item', quantity: 1, declaredValue: 0.10, weight: parsedWeight }]
          })(),
          soNumber: shipNowOrder.soNumber,
          packageNumber: shipNowPkg.packageNumber || '',
        })
      })
      const data = await res.json()
      if (data.success) {
        setShipNowResult(data)
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
            {sortDir === "asc" ? " up  Asc" : " down  Desc"}
          </button>
        </div>
      </div>
      
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

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
            {compilationList.map((item, idx) => (
              <div key={idx} className="bg-neutral-900/40 border border-white/5 rounded-xl p-3 flex items-center justify-between hover:border-indigo-500/30 transition-all duration-300">
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-black text-white font-mono truncate" title={item.sku}>{item.sku}</p>
                  <p className="text-[10px] text-neutral-500 truncate" title={item.name}>{item.name}</p>
                </div>
                <span className="flex-shrink-0 min-w-[28px] h-7 rounded-lg bg-indigo-600/15 text-indigo-400 font-black text-xs flex items-center justify-center border border-indigo-500/20 px-2">
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
                  {/* Status Badge */}
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${currentColor}`}>
                    {statusLabel}
                  </span>

                  {/* SO Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/get-invoice-pdf?id=${order.zohoId}&type=SalesOrder`}
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
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] text-neutral-600">
                        {order.orderDate ? new Date(order.orderDate).toLocaleDateString() : "--"}
                      </span>
                      <span className="text-[10px] text-neutral-600">
                        {order.lineItemCount} item{order.lineItemCount !== 1 ? "s" : ""}
                      </span>
                      {order.salesperson && (
                        <span className="text-[10px] text-neutral-600">{order.salesperson}</span>
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

                  {/* Dropshipments count */}
                  {order.dropshipments?.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-orange-400 bg-orange-950/30 px-2 py-1 rounded-lg">
                      <FiTruck className="text-[10px]" /> {order.dropshipments.length} DS
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
                              <div key={i} className="flex items-center justify-between text-sm hover:bg-white/5 p-1 rounded transition-colors">
                                <span className="text-neutral-300 font-medium truncate pr-2" title={li.name}>
                                  {li.sku ? `[${li.sku}] ` : ""}{li.name}
                                </span>
                                <span className="flex-shrink-0 bg-neutral-800 text-neutral-300 font-bold px-2 py-0.5 rounded text-xs min-w-[20px] text-center">
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
                                    href={`/api/get-invoice-pdf?id=${order.zohoId}&type=SalesOrder`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-indigo-400 font-mono bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/50 font-bold hover:text-orange-400 hover:underline transition-colors cursor-pointer"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    SO #{pkg.salesOrderNumber || order.soNumber}
                                  </a>
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
                                    const pkgItems = pkg.items?.lineItems || pkg.items?.line_items || (Array.isArray(pkg.items) ? pkg.items : null)
                                    if (pkgItems && pkgItems.length > 0) {
                                      return (
                                        <div className="space-y-0.5">
                                          {pkgItems.map((li: any, idx: number) => {
                                            const name = li.name || li.itemName || li.item_name || ""
                                            const qty = li.quantity || li.quantity_packed || ""
                                            return (
                                              <p key={idx} className="text-xs text-neutral-300 font-medium truncate">
                                                • {qty ? `${qty}x ` : ""}{name}
                                              </p>
                                            )
                                          })}
                                        </div>
                                      )
                                    }
                                    
                                    if (order.lineItems && order.lineItems.length > 0) {
                                      return (
                                        <div className="space-y-0.5">
                                          {order.lineItems.map((li: any, idx: number) => (
                                            <p key={idx} className="text-xs text-neutral-300 font-medium truncate">
                                              • {li.quantity}x {li.name}
                                            </p>
                                          ))}
                                        </div>
                                      )
                                    }

                                    return (
                                      <p className="text-xs text-neutral-500 italic">Order items pending sync</p>
                                    )
                                  })()}
                                </div>

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
                                  const hasEasyship = !!pkgItems.easyshipShipmentId
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

                                      {/* View Label — when label exists */}
                                      {hasLabel && (
                                        <a
                                          href={pkgItems.labelUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={e => e.stopPropagation()}
                                          className="px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-800/50 text-[10px] font-bold uppercase hover:bg-blue-600/30 transition-all flex items-center gap-1"
                                        >
                                          <FiFileText size={11} /> View Label
                                        </a>
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

                                      {/* Refresh Status — when easyship shipment exists */}
                                      {hasEasyship && !isDelivered && (
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation()
                                            try {
                                              const res = await fetch('/api/shipping/refresh-status', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ easyshipShipmentId: pkgItems.easyshipShipmentId, packageId: pkg.id })
                                              })
                                              const data = await res.json()
                                              if (data.success) {
                                                toast.success(`Status: ${data.shipmentState || 'updated'} | Label: ${data.labelState || 'n/a'}`)
                                                fetchOrders(); fetchCounts()
                                              } else {
                                                toast.error('Refresh failed: ' + (data.error || 'Unknown'))
                                              }
                                            } catch (err: any) { toast.error(err.message) }
                                          }}
                                          className="px-3 py-1.5 rounded-lg bg-cyan-600/20 text-cyan-400 border border-cyan-800/50 text-[10px] font-bold uppercase hover:bg-cyan-600/30 transition-all flex items-center gap-1"
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
                        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Dropshipments</div>
                        <div className="space-y-2">
                          {order.dropshipments.map(ds => (
                            <div key={ds.id} className="bg-orange-950/20 border border-orange-800/30 rounded-xl p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <FiTruck className="text-orange-400 text-xs" />
                                  <span className="text-sm font-bold text-white">{ds.vendorName || "Vendor"}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                    ds.status === "received" || ds.status === "billed" ? "text-emerald-400 bg-emerald-950/50" :
                                    ds.status === "issued" ? "text-purple-400 bg-purple-950/50" :
                                    "text-orange-400 bg-orange-950/50"
                                  }`}>
                                    {ds.status || "draft"}
                                  </span>
                                  <span className="text-[10px] text-neutral-500 font-mono">${ds.total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                  {ds.shippingCharge ? <span className="text-[10px] text-neutral-500">Ship: ${ds.shippingCharge.toFixed(2)}</span> : null}
                                </div>
                                <button
                                  onClick={() => {
                                    setEditingDropship(editingDropship === ds.id ? null : ds.id)
                                    setDropshipEdit({ tracking: ds.trackingNumber || '', shippingCharge: String(ds.shippingCharge || '') })
                                  }}
                                  className="text-[10px] text-neutral-500 hover:text-orange-400 transition-colors"
                                >
                                  <FiEdit2 size={12} />
                                </button>
                              </div>

                              {/* Line Items */}
                              {ds.lineItems && ds.lineItems.length > 0 && (
                                <div className="mt-2 pl-5 space-y-0.5">
                                  {ds.lineItems.map((li, liIdx) => (
                                    <div key={liIdx} className="flex items-center gap-2 text-xs text-neutral-400">
                                      <span className="text-neutral-600">•</span>
                                      <span className="text-neutral-300">{li.quantity}x</span>
                                      <span className="truncate">{li.name}</span>
                                      {li.rate > 0 && <span className="text-neutral-600 ml-auto shrink-0">${li.rate.toFixed(2)}</span>}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Tracking display */}
                              {ds.trackingNumber && editingDropship !== ds.id && (
                                <div className="flex items-center gap-2 mt-2 pl-5">
                                  <span className="text-[10px] text-neutral-500">Tracking:</span>
                                  <span className="text-xs text-neutral-300 font-mono">{ds.trackingNumber}</span>
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
                          ))}
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
      {trackingModal && (
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
        </div>
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
      {/* ── Ship Now Modal ──────────────────────────────────────────────── */}
      {shipNowOpen && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !shipNowBuying && setShipNowOpen(false)}>
          <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h2 className="text-lg font-black text-white">Ship Now</h2>
                <p className="text-xs text-neutral-400">
                  {shipNowOrder?.soNumber} — {shipNowOrder?.customerName}
                </p>
                {/* EasyShip Link Status */}
                {(() => {
                  const esId = shipNowPkg?.easyshipShipmentId || (shipNowPkg?.items as any)?.easyshipShipmentId
                  return esId ? (
                    <p className="text-[10px] text-emerald-400 font-bold mt-1 flex items-center gap-1">
                      <FiLink size={10} /> Will use existing EasyShip shipment: {esId}
                    </p>
                  ) : (
                    <p className="text-[10px] text-amber-400/70 font-bold mt-1 flex items-center gap-1">
                      <FiLink size={10} /> Will search EasyShip by SO# before creating new shipment
                    </p>
                  )
                })()}
              </div>
              <button onClick={() => !shipNowBuying && setShipNowOpen(false)} className="text-neutral-500 hover:text-white">
                <FiX size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Shipment Result */}
              {shipNowResult && (
                <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <FiCheck /> Label Purchased Successfully!
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase font-bold">Carrier</div>
                      <div className="text-white font-medium">{shipNowResult.courierName}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase font-bold">Tracking #</div>
                      <div className="text-white font-medium font-mono">{shipNowResult.trackingNumber}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase font-bold">Cost</div>
                      <div className="text-white font-medium">${shipNowResult.totalCharge?.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase font-bold">Status</div>
                      <div className="text-emerald-400 font-medium">Shipped ✓ (Zoho Updated)</div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    {shipNowResult.labelUrl && (
                      <a href={shipNowResult.labelUrl} target="_blank" rel="noopener noreferrer" className="td-btn td-btn-sm bg-blue-600 hover:bg-blue-500 text-white border-none">
                        <FiDownloadCloud size={14} /> Download Label
                      </a>
                    )}
                    {shipNowResult.trackingPageUrl && (
                      <a href={shipNowResult.trackingPageUrl} target="_blank" rel="noopener noreferrer" className="td-btn td-btn-sm bg-neutral-700 hover:bg-neutral-600 text-white border-none">
                        <FiExternalLink size={14} /> Track Package
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Package & Weight */}
              {!shipNowResult && (
                <>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">Weight (lbs)</label>
                      <input type="number" value={shipNowWeight} onChange={e => setShipNowWeight(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">L (in)</label>
                      <input type="number" value={shipNowDims.length} onChange={e => setShipNowDims(d => ({...d, length: e.target.value}))} className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">W (in)</label>
                      <input type="number" value={shipNowDims.width} onChange={e => setShipNowDims(d => ({...d, width: e.target.value}))} className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">H (in)</label>
                      <input type="number" value={shipNowDims.height} onChange={e => setShipNowDims(d => ({...d, height: e.target.value}))} className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none" />
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
                                setShipNowDims({ length: preset.l, width: preset.w, height: preset.h })
                                setShipNowWeight(preset.wt)
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                                isActive
                                  ? 'bg-orange-600 text-white border border-orange-500'
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
                    const pkgItems = shipNowPkg.items?.lineItems || shipNowPkg.items?.line_items || (Array.isArray(shipNowPkg.items) ? shipNowPkg.items : [])
                    return pkgItems.length > 0 ? (
                      <div className="bg-black/20 rounded-xl p-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">Items Being Shipped</div>
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

                  {/* Also show order-level line items if no package items */}
                  {(!shipNowPkg?.items || !(shipNowPkg.items?.lineItems || shipNowPkg.items?.line_items || []).length) && shipNowOrder?.lineItems?.length > 0 && (
                    <div className="bg-black/20 rounded-xl p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">Order Items</div>
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
                  )}

                  {/* Destination Preview */}
                  <div className="bg-black/20 rounded-xl p-3 flex items-start gap-3">
                    <FiMapPin className="text-orange-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <div className="text-white font-medium">{shipNowOrder?.customerName}</div>
                      <div className="text-neutral-400 text-xs">
                        {shipNowOrder?.shippingAddress?.address || shipNowOrder?.shippingAddress?.street || 'Address on file'}, {shipNowOrder?.shippingAddress?.city}, {shipNowOrder?.shippingAddress?.state} {shipNowOrder?.shippingAddress?.zip || shipNowOrder?.shippingAddress?.postal_code}
                      </div>
                    </div>
                  </div>

                  {/* Rate Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-white">Select Carrier</h3>
                      <button
                        onClick={() => {
                          setShipNowRates([])
                          fetchShipNowRates(shipNowOrder, shipNowWeight, shipNowDims)
                        }}
                        className="td-btn td-btn-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-white/10 text-[10px]"
                      >
                        <FiRefreshCw size={10} /> Refresh Rates
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
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {shipNowRates.slice(0, 15).map((rate: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between bg-black/20 border border-white/5 rounded-xl p-3 hover:border-orange-500/30 transition-colors">
                          <div className="flex items-center gap-3">
                            {rate.logoUrl && <img src={rate.logoUrl} alt="" className="w-6 h-6 rounded" />}
                            <div>
                              <div className="text-sm font-medium text-white">{rate.courierName}</div>
                              <div className="text-[10px] text-neutral-500">
                                {rate.minDeliveryTime && rate.maxDeliveryTime
                                  ? `${rate.minDeliveryTime}-${rate.maxDeliveryTime} days`
                                  : 'Transit time varies'}
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
      )}
      </div>
    </div>
  )
}
