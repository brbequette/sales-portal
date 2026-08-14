import { useState, useRef, useMemo, useEffect, useCallback } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { usePreferences } from "@/components/PreferencesProvider"

export type OrderLine = {
  id: string
  name: string
  sku: string
  quantity: number
  unitPrice: number
  cost: number
  isPromo: boolean
  giftItem?: boolean
  subjectToVig?: boolean
}

export interface UseOrderBuilderDataProps {
  orderLines?: OrderLine[]
  setOrderLines?: (lines: OrderLine[] | ((prev: OrderLine[]) => OrderLine[])) => void
  catalogProducts?: any[]
  accountPurchases?: any[]
  factFinding?: any
  vigRate?: number
  commissionPct?: number
  accountName?: string
  accountDetail?: any
  accountId?: string
  dealId?: string
  onCancel?: () => void
  onSuccess?: () => void
}

export const APPLICATIONS = [
  "All",
  "Asphalt",
  "Concrete",
  "Reinforced Concrete",
  "Brick / Block / Stone",
  "Ductile Iron",
  "General Purpose",
]

export const SIZES = [
  "All",
  '4.5"', '7"', '9"', '10"', '12"', '14"', '16"', '20"+',
]

export const TYPES = [
  "All",
  "Segmented",
  "Turbo",
  "Continuous Rim",
  "Premium Turbo",
  "Abrasive",
]

export const EQUIPMENT_LIST = [
  "None",
  "Stihl TS400/410/420 (14\")",
  "Stihl TS700/800 (16\")",
  "Husqvarna K760/770/970 (14\")",
  "Husqvarna K1270 (16\")",
  "Makita EK7651H (14\")",
  "Hilti DSH 700/900 (14\")",
  "iQ360 (14\")",
  "iQ228 (7\")",
  "4.5\" Angle Grinder (4.5\")",
  "7\" Angle Grinder (7\")",
  "9\" Angle Grinder (9\")",
]

const APPLICATION_KEYWORDS: Record<string, string[]> = {
  "Asphalt":              ["asphalt", "asp", "pavement", "road"],
  "Concrete":             ["concrete", "conc"],
  "Reinforced Concrete":  ["reinforced", "rebar", "re-enforced", "ductile", "pipe"],
  "Brick / Block / Stone":["brick", "block", "stone", "masonry", "paver"],
  "Ductile Iron":         ["ductile", "iron", "d.i."],
  "General Purpose":      ["general", "gp", "all purpose", "multipurpose", "titan", "medusa", "dark knight", "champion", "wizard"],
}

const TYPE_KEYWORDS: Record<string, string[]> = {
  "Segmented":      ["segment", "sgmt"],
  "Turbo":          ["turbo"],
  "Continuous Rim": ["continuous", "rim", "cont"],
  "Premium Turbo":  ["premium turbo", "prem turbo"],
  "Abrasive":       ["abrasive", "abra", "cup", "wheel"],
}

function extractSize(name: string): string | null {
  const m = name.match(/\b(4\.5|4-1\/2|7|9|10|12|14|16|18|20|24)\b/)
  if (!m) return null
  const n = parseFloat(m[1])
  if (n >= 20) return '20"+'
  return `${n}"`
}

function matchApplication(name: string, category: string): string {
  const hay = (name + " " + category).toLowerCase()
  for (const [app, keywords] of Object.entries(APPLICATION_KEYWORDS)) {
    if (keywords.some(k => hay.includes(k))) return app
  }
  return "General Purpose"
}

function matchType(name: string, category: string): string {
  const hay = (name + " " + category).toLowerCase()
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some(k => hay.includes(k))) return type
  }
  if (hay.includes("blade")) return "Segmented"
  return "Segmented"
}

export function parseDesc(raw: string | null | undefined): Record<string, any> {
  try { return JSON.parse(raw || "{}") } catch { return {} }
}

export function useOrderBuilderData({
  orderLines: externalOrderLines,
  setOrderLines: externalSetOrderLines,
  catalogProducts: externalCatalogProducts,
  accountPurchases: externalAccountPurchases,
  factFinding,
  vigRate = 1.3,
  commissionPct = 50,
  accountName = "",
  accountDetail,
  accountId,
  dealId,
  onCancel,
  onSuccess,
}: UseOrderBuilderDataProps) {
  const { zohoContext: user } = useZoho()
  const { preferences } = usePreferences()
  const [transactionType, setTransactionType] = useState<"SalesOrder" | "Quote">("SalesOrder")
  const isControlled = externalSetOrderLines !== undefined
  const [internalOrderLines, setInternalOrderLines] = useState<OrderLine[]>(externalOrderLines || [])
  const [internalCatalogProducts, setInternalCatalogProducts] = useState<any[]>([])
  const [fetchedPurchases, setFetchedPurchases] = useState<any[]>([])
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const orderLines = isControlled ? (externalOrderLines as OrderLine[]) : internalOrderLines
  const setOrderLines = isControlled ? (externalSetOrderLines as any) : setInternalOrderLines
  const catalogProducts = externalCatalogProducts ?? internalCatalogProducts

  const targetAccountId = accountId || accountDetail?.zohoId || accountDetail?.id || accountDetail?.accountId

  useEffect(() => {
    if (!externalAccountPurchases && targetAccountId) {
      fetch(`/api/get-account-purchases?accountId=${encodeURIComponent(targetAccountId)}`)
        .then(r => r.json())
        .then(d => { setFetchedPurchases(d.purchasedProducts || d.products || []) })
        .catch(e => console.error("Failed to load account purchases for OrderBuilder", e))
    }
  }, [externalAccountPurchases, targetAccountId])

  useEffect(() => {
    if (!externalCatalogProducts) {
      setIsLoadingCatalog(true)
      fetch("/api/get-products")
        .then(r => r.json())
        .then(d => { if (d.success) setInternalCatalogProducts(d.products) })
        .catch(e => console.error("Failed to load catalog", e))
        .finally(() => setIsLoadingCatalog(false))
    }
  }, [externalCatalogProducts])

  // Mock order preview
  const [showMockOrder, setShowMockOrder] = useState(false)

  const handleConfirmOrder = useCallback(async () => {
    if (!accountId) {
      setShowMockOrder(false)
      return
    }
    
    setIsSubmitting(true)
    try {
      const paidLines = orderLines.filter(l => !l.isPromo)
      const orderTotal = paidLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
      
      const itemsFormatted = orderLines.map(
        (i) => `${i.quantity}x ${i.name} (${i.sku}) - $${i.unitPrice.toFixed(2)} ea` + (i.isPromo ? " [PROMO FREE]" : "")
      )

      const lineItems = orderLines.map((i) => ({
        name: i.name,
        sku: i.sku,
        itemId: null,
        rate: i.unitPrice,
        discount: 0,
        quantity: i.quantity,
        description: `SKU: ${i.sku}` + (i.isPromo ? " (PROMO FREE)" : "")
      }))

      const effectiveEmail = preferences?.impersonatedUser ? preferences.impersonatedUser.email : (user?.email || "")

      const res = await fetch("/api/create-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          dealId,
          type: transactionType,
          userEmail: effectiveEmail,
          amount: orderTotal,
          items: itemsFormatted,
          lineItems: lineItems,
          processingNotes: `Order created via Standalone OrderBuilder (${transactionType})`,
        }),
      })

      if (res.ok) {
        alert(`${transactionType === "SalesOrder" ? "Sales Order" : "Quote (Estimate)"} created successfully!`)
        if (onSuccess) onSuccess()
        setShowMockOrder(false)
        if (!externalOrderLines) setInternalOrderLines([])
      } else {
        const data = await res.json()
        alert(data.error || data.message || "Failed to create transaction")
      }
    } catch (e: any) {
      alert("Error: " + e.message)
    } finally {
      setIsSubmitting(false)
    }
  }, [accountId, dealId, transactionType, orderLines, preferences, user, externalOrderLines, onSuccess, setInternalOrderLines])

  // Product search
  const [productSearch, setProductSearch] = useState("")
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const productSearchRef = useRef<HTMLDivElement>(null)

  // Blade lookup
  const [showBladeLookup, setShowBladeLookup] = useState(false)
  const [filterApp, setFilterApp] = useState("All")
  const [filterSize, setFilterSize] = useState("All")
  const [filterType, setFilterType] = useState("All")
  const [filterEquipment, setFilterEquipment] = useState("None")

  const handleEquipmentChange = useCallback((val: string) => {
    setFilterEquipment(val)
    if (val !== "None") {
      const match = val.match(/\((.*?)\)/)
      if (match) {
        setFilterSize(match[1])
      }
    }
  }, [])
  
  // Pending Add Item State
  const [pendingItem, setPendingItem] = useState<{name: string, sku: string, cost: number, defaultPrice: number, giftItem?: boolean, subjectToVig?: boolean} | null>(null)
  const [addPaidQty, setAddPaidQty] = useState(1)
  const [addFreeQty, setAddFreeQty] = useState(0)
  const [addPrice, setAddPrice] = useState(0)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (productSearchRef.current && !productSearchRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // ─── Derived product lists ──────────────────────────────────────────────────

  const activeBlades = useMemo(() => {
    return catalogProducts
      .filter(p => {
        const cat = (p.category || "").toLowerCase()
        const desc = parseDesc(p.description)
        return cat.includes("blade") && desc.status !== "inactive"
      })
      .map(p => {
        const desc = parseDesc(p.description)
        return {
          id: p.id,
          name: p.name as string,
          sku: p.sku as string,
          price: (p.price || 0) as number,
          cost: (desc.cost || 0) as number,
          application: matchApplication(p.name, p.category || ""),
          size: extractSize(p.name),
          type: matchType(p.name, p.category || ""),
          subjectToVig: p.subjectToVig !== false
        }
      })
  }, [catalogProducts])

  const topBladeProducts = useMemo(() => activeBlades.slice(0, 10), [activeBlades])

  const popularGifts = useMemo(() => {
    return (catalogProducts || [])
      .filter(p => {
        const desc = parseDesc(p.description)
        if (desc.status === "inactive") return false
        return !!p.giftItem
      })
      .map(p => {
        const desc = parseDesc(p.description)
        return {
          id: p.id,
          name: p.name as string,
          sku: p.sku as string,
          price: (p.price || 0) as number,
          cost: (desc.cost || 0) as number,
          giftItem: true,
          subjectToVig: false
        }
      })
  }, [catalogProducts])

  const previousPurchasesNoGifts = useMemo(() => {
    const raw = externalAccountPurchases || fetchedPurchases || []
    if (raw.length === 0) return []
    
    const isGiftItem = (name: string, sku?: string) => {
      const targetSku = (sku || '').trim().toUpperCase()
      const found = catalogProducts.find(p => p.sku.toUpperCase().trim() === targetSku)
      if (found) {
        return !!found.giftItem
      }
      return false
    }

    const seen = new Set<string>()
    const result: any[] = []

    for (const item of raw) {
      const itemName = item.name || item.item_name || ''
      const itemSku = item.sku || item.item_id || itemName
      if (!itemName) continue
      if (isGiftItem(itemName, itemSku)) continue

      const key = (itemSku || itemName).toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        const foundProd = catalogProducts.find(p => p.sku.toLowerCase() === key)
        result.push({
          name: itemName,
          sku: itemSku,
          price: item.price || item.rate || item.unitPrice || 0,
          cost: item.cost || foundProd?.cost || 0,
          quantity: item.quantity || item.qty || 1,
          subjectToVig: foundProd?.subjectToVig !== false
        })
      }
    }
    return result
  }, [externalAccountPurchases, fetchedPurchases, catalogProducts])

  const usageMatchedBlades = useMemo(() => {
    const eq = filterEquipment !== "None" ? filterEquipment : (factFinding?.equipment || accountDetail?.equipment || "")
    const app = filterApp !== "All" ? filterApp : (factFinding?.application || factFinding?.primaryApplication || accountDetail?.industry || "")
    
    let targetSize: string | null = null
    if (eq) {
      const m = eq.match(/\((.*?)\)/)
      if (m) targetSize = m[1]
    }

    const matched = activeBlades.filter(b => {
      if (targetSize && b.size && b.size !== targetSize) return false
      if (app && app !== "All" && b.application && b.application !== "General Purpose" && !b.application.toLowerCase().includes(app.toLowerCase())) return false
      return true
    })

    return matched.length > 0 ? matched.slice(0, 12) : activeBlades.slice(0, 12)
  }, [activeBlades, filterEquipment, filterApp, factFinding, accountDetail])

  const filteredBlades = useMemo(() => {
    return activeBlades.filter(b => {
      if (filterApp !== "All" && b.application !== filterApp) return false
      if (filterSize !== "All" && b.size !== filterSize) return false
      if (filterType !== "All" && b.type !== filterType) return false
      return true
    })
  }, [activeBlades, filterApp, filterSize, filterType])

  const tieredBlades = useMemo(() => {
    const sorted = [...filteredBlades].sort((a, b) => a.price - b.price)
    if (sorted.length === 0) return []
    if (sorted.length === 1) return [{ ...sorted[0], tier: "Best" as const }]
    if (sorted.length === 2) return [
      { ...sorted[0], tier: "Good" as const },
      { ...sorted[1], tier: "Best" as const },
    ]
    const third = Math.floor(sorted.length / 3)
    return sorted.map((b, i) => ({
      ...b,
      tier: (i < third ? "Good" : i < third * 2 ? "Better" : "Best") as "Good" | "Better" | "Best",
    }))
  }, [filteredBlades])

  // ─── Financials ─────────────────────────────────────────────────────────────

  const financials = useMemo(() => {
    if (orderLines.length === 0) return null
    const subTotal = orderLines.reduce((s, l) => s + (!l.isPromo ? l.quantity * l.unitPrice : 0), 0)
    
    const isExempt = (l: any) => {
      if (l.subjectToVig === false) return true
      return !!l.giftItem
    }
    
    const deadCostSubjectToVig = orderLines.reduce((s, l) => s + (!isExempt(l) ? l.cost * l.quantity : 0), 0)
    const deadCostNoVig = orderLines.reduce((s, l) => s + (isExempt(l) ? l.cost * l.quantity : 0), 0)
    const deadCostTotal = deadCostSubjectToVig + deadCostNoVig
    const deadCostPlusVig = deadCostSubjectToVig * vigRate + deadCostNoVig
    const deadProfit = subTotal - deadCostTotal
    const profitAfterVig = subTotal - deadCostPlusVig
    const salesCommission = profitAfterVig < 0 ? profitAfterVig * 0.50 : profitAfterVig * (commissionPct / 100)
    const marginPct = subTotal > 0 ? (profitAfterVig / subTotal) * 100 : 0
    return { subTotal, deadCostTotal, deadCostPlusVig, deadProfit, profitAfterVig, salesCommission, marginPct }
  }, [orderLines, vigRate, commissionPct])

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const openAddItemModal = useCallback((p: { name: string; sku: string; price: number; cost: number; giftItem?: boolean; subjectToVig?: boolean }) => {
    const isGift = !!p.giftItem
    setPendingItem({ name: p.name, sku: p.sku, defaultPrice: p.price, cost: p.cost, giftItem: isGift, subjectToVig: p.subjectToVig !== false })
    setAddPaidQty(isGift ? 0 : 1)
    setAddFreeQty(isGift ? 1 : 0)
    setAddPrice(isGift ? 0 : p.price)
    setProductSearch("")
    setShowProductDropdown(false)
  }, [])

  const confirmAddItem = useCallback(() => {
    if (!pendingItem) return
    const newLines: OrderLine[] = []
    
    if (addPaidQty > 0) {
      newLines.push({
        id: Date.now().toString() + '-' + pendingItem.sku + '-paid',
        name: pendingItem.name,
        sku: pendingItem.sku,
        quantity: addPaidQty,
        unitPrice: addPrice,
        cost: pendingItem.cost,
        isPromo: false,
        giftItem: pendingItem.giftItem,
        subjectToVig: pendingItem.subjectToVig,
      })
    }
    
    if (addFreeQty > 0) {
      newLines.push({
        id: Date.now().toString() + '-' + pendingItem.sku + '-free',
        name: pendingItem.name,
        sku: pendingItem.sku,
        quantity: addFreeQty,
        unitPrice: 0,
        cost: pendingItem.cost,
        isPromo: true,
        giftItem: pendingItem.giftItem,
        subjectToVig: pendingItem.subjectToVig,
      })
    }

    if (newLines.length > 0) {
      setOrderLines((prev: OrderLine[]) => [...prev, ...newLines])
    }
    setPendingItem(null)
  }, [pendingItem, addPaidQty, addFreeQty, addPrice, setOrderLines])

  const updateLine = useCallback((id: string, patch: Partial<OrderLine>) =>
    setOrderLines((prev: OrderLine[]) => prev.map(l => l.id === id ? { ...l, ...patch } : l)), [setOrderLines])

  const removeLine = useCallback((id: string) =>
    setOrderLines((prev: OrderLine[]) => prev.filter((l: OrderLine) => l.id !== id)), [setOrderLines])

  const paidLines  = useMemo(() => orderLines.filter(l => !l.isPromo), [orderLines])
  const promoLines = useMemo(() => orderLines.filter(l => l.isPromo), [orderLines])
  const orderTotal = useMemo(() => paidLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0), [paidLines])

  // ─── Filtered search results ────────────────────────────────────────────────

  const searchResults = useMemo(() => {
    if (productSearch.length < 2) return []
    const term = productSearch.toLowerCase()
    return catalogProducts
      .filter(p => {
        const desc = parseDesc(p.description)
        return desc.status !== "inactive" && (
          p.name?.toLowerCase().includes(term) ||
          p.sku?.toLowerCase().includes(term) ||
          p.category?.toLowerCase().includes(term)
        )
      })
      .slice(0, 8)
  }, [productSearch, catalogProducts])

  return {
    transactionType, setTransactionType,
    orderLines,
    isLoadingCatalog,
    catalogProducts,
    isSubmitting,
    productSearch, setProductSearch,
    showProductDropdown, setShowProductDropdown,
    productSearchRef,
    showBladeLookup, setShowBladeLookup,
    filterApp, setFilterApp,
    filterSize, setFilterSize,
    filterType, setFilterType,
    filterEquipment, setFilterEquipment, handleEquipmentChange,
    showMockOrder, setShowMockOrder,
    pendingItem, setPendingItem,
    addPaidQty, setAddPaidQty,
    addFreeQty, setAddFreeQty,
    addPrice, setAddPrice,
    handleConfirmOrder,
    activeBlades,
    topBladeProducts,
    popularGifts,
    previousPurchasesNoGifts,
    usageMatchedBlades,
    filteredBlades,
    tieredBlades,
    financials,
    openAddItemModal,
    confirmAddItem,
    updateLine,
    removeLine,
    paidLines,
    promoLines,
    orderTotal,
    searchResults
  }
}
