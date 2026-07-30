"use client"

/**
 * OrderBuilder.tsx
 *
 * Universal Order Builder -- shared by all POS transaction spots:
 *   - SalesCallCampaignModal (Titan Dialer campaign view)
 *   - AccountDialer (account page dialer)
 *   - CommunicationCenter (account page comm hub)
 *
 * Overhauled with premium dark glassmorphism, responsive tactile controls,
 * custom card glows, and a gorgeous grid dashboard for profit metrics.
 */

import { useState, useRef, useMemo, useEffect } from "react"
import {
  FiSearch, FiX, FiPlus, FiShoppingCart, FiTag,
  FiDollarSign, FiFileText, FiTrendingUp, FiFilter,
  FiPackage, FiChevronDown, FiAlertCircle, FiPercent, FiCheck,
} from "react-icons/fi"
import { useZoho } from "@/components/ZohoProvider"
import { usePreferences } from "@/components/PreferencesProvider"

// ─── Types ───────────────────────────────────────────────────────────────────

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

export interface OrderBuilderProps {
  orderLines?: OrderLine[]
  setOrderLines?: (lines: OrderLine[] | ((prev: OrderLine[]) => OrderLine[])) => void
  catalogProducts?: any[]
  accountPurchases?: any[]
  factFinding?: any
  vigRate?: number
  commissionPct?: number
  accountName?: string
  accountDetail?: any
  accent?: "violet" | "cyan" | "emerald" | "sky"
  accountId?: string
  dealId?: string
  onCancel?: () => void
  onSuccess?: () => void
}

// ─── Blade lookup config ──────────────────────────────────────────────────────

const APPLICATIONS = [
  "All",
  "Asphalt",
  "Concrete",
  "Reinforced Concrete",
  "Brick / Block / Stone",
  "Ductile Iron",
  "General Purpose",
]

const SIZES = [
  "All",
  '4.5"', '7"', '9"', '10"', '12"', '14"', '16"', '20"+',
]

const TYPES = [
  "All",
  "Segmented",
  "Turbo",
  "Continuous Rim",
  "Premium Turbo",
  "Abrasive",
]

const EQUIPMENT_LIST = [
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

function parseDesc(raw: string | null | undefined): Record<string, any> {
  try { return JSON.parse(raw || "{}") } catch { return {} }
}

const TIER_LABELS = ["Good", "Better", "Best"] as const
const TIER_COLORS = {
  Good: { 
    bg: "bg-neutral-900/60 hover:bg-neutral-800/80", 
    border: "border-neutral-800 hover:border-neutral-700", 
    badge: "bg-neutral-800 text-neutral-300 border border-neutral-700", 
    price: "text-neutral-200" 
  },
  Better: { 
    bg: "bg-sky-950/20 hover:bg-sky-950/30",  
    border: "border-sky-900/40 hover:border-sky-500/50 hover:shadow-[0_0_15px_rgba(14,165,233,0.05)]",  
    badge: "bg-sky-500/10 text-sky-400 border border-sky-500/20",     
    price: "text-sky-400" 
  },
  Best: { 
    bg: "bg-amber-950/10 hover:bg-amber-950/20",
    border: "border-amber-900/30 hover:border-amber-500/50 hover:shadow-[0_0_15px_rgba(245,158,11,0.05)]",
    badge: "bg-amber-500/10 text-amber-400 border border-amber-500/20", 
    price: "text-amber-400 font-extrabold" 
  },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function QtyInput({
  value,
  onChange,
  colorClass = "text-white",
  bgClass = "bg-neutral-800",
  btnClass = "bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-neutral-400 hover:text-white",
}: {
  value: number
  onChange: (n: number) => void
  colorClass?: string
  bgClass?: string
  btnClass?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!editing) setDraft(String(value)) }, [value, editing])

  const commit = () => {
    const n = Math.max(0, parseInt(draft, 10) || 0)
    onChange(n)
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className={`w-6 h-6 rounded-md font-bold flex items-center justify-center transition-all cursor-pointer select-none active:scale-95 ${btnClass}`}
      >-</button>
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false) } }}
          className={`w-12 h-6 text-center text-xs font-black rounded-md outline-none border border-violet-500/70 focus:border-violet-500 ${bgClass} ${colorClass}`}
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={() => { setEditing(true); setDraft(String(value)) }}
          className={`w-12 h-6 text-center text-xs font-black rounded-md cursor-text border border-transparent transition-all flex items-center justify-center ${bgClass} ${colorClass} hover:border-white/20 hover:bg-white/10`}
          title="Click to edit"
        >
          {value}
        </button>
      )}
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className={`w-6 h-6 rounded-md font-bold flex items-center justify-center transition-all cursor-pointer select-none active:scale-95 ${btnClass}`}
      >+</button>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OrderBuilder({
  orderLines: externalOrderLines,
  setOrderLines: externalSetOrderLines,
  catalogProducts: externalCatalogProducts,
  accountPurchases: externalAccountPurchases,
  factFinding,
  vigRate = 1.3,
  commissionPct = 50,
  accountName = "",
  accountDetail,
  accent = "violet",
  accountId,
  dealId,
  onCancel,
  onSuccess,
}: OrderBuilderProps) {
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

  const handleConfirmOrder = async () => {
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
  }

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

  const handleEquipmentChange = (val: string) => {
    setFilterEquipment(val)
    if (val !== "None") {
      const match = val.match(/\((.*?)\)/)
      if (match) {
        setFilterSize(match[1])
      }
    }
  }

  // Mock order preview
  const [showMockOrder, setShowMockOrder] = useState(false)
  
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
    const salesCommission = profitAfterVig > 0 ? profitAfterVig * (commissionPct / 100) : 0
    const marginPct = subTotal > 0 ? (profitAfterVig / subTotal) * 100 : 0
    return { subTotal, deadCostTotal, deadCostPlusVig, deadProfit, profitAfterVig, salesCommission, marginPct }
  }, [orderLines, vigRate, commissionPct])

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const openAddItemModal = (p: { name: string; sku: string; price: number; cost: number; giftItem?: boolean; subjectToVig?: boolean }) => {
    const isGift = !!p.giftItem
    setPendingItem({ name: p.name, sku: p.sku, defaultPrice: p.price, cost: p.cost, giftItem: isGift, subjectToVig: p.subjectToVig !== false })
    setAddPaidQty(isGift ? 0 : 1)
    setAddFreeQty(isGift ? 1 : 0)
    setAddPrice(isGift ? 0 : p.price)
    setProductSearch("")
    setShowProductDropdown(false)
  }

  const confirmAddItem = () => {
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
  }

  const updateLine = (id: string, patch: Partial<OrderLine>) =>
    setOrderLines((prev: OrderLine[]) => prev.map(l => l.id === id ? { ...l, ...patch } : l))

  const removeLine = (id: string) =>
    setOrderLines((prev: OrderLine[]) => prev.filter((l: OrderLine) => l.id !== id))

  const paidLines  = orderLines.filter(l => !l.isPromo)
  const promoLines = orderLines.filter(l => l.isPromo)
  const orderTotal = paidLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)

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

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 text-neutral-200">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <span className="text-xs font-black uppercase tracking-wider text-violet-400 flex items-center gap-1.5">
          <FiShoppingCart size={14} className="text-violet-500 animate-pulse" />
          Build Order
        </span>
        {orderLines.length > 0 && (
          <span className="text-[11px] font-black bg-violet-500/10 text-violet-300 border border-violet-500/20 px-2 py-0.5 rounded-full">
            {orderLines.length} item{orderLines.length !== 1 ? "s" : ""} · ${orderTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        )}
      </div>

      {/* ── Blade Lookup Accordion ── */}
      <div className="glass-panel border border-white/10 rounded-2xl overflow-hidden shadow-xl transition-all duration-300">
        <button
          type="button"
          onClick={() => setShowBladeLookup(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.02] hover:bg-white/[0.05] transition-all cursor-pointer"
        >
          <span className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-wider text-neutral-300">
            <FiFilter size={13} className="text-violet-400" />
            Blade Lookup Tiers
          </span>
          <FiChevronDown
            size={16}
            className={`text-neutral-400 transition-transform duration-300 ${showBladeLookup ? "rotate-180 text-violet-400" : ""}`}
          />
        </button>

        {showBladeLookup && (
          <div className="px-4 pb-4 pt-3 bg-black/40 space-y-4 border-t border-white/10 animate-in fade-in duration-200">
            {/* Filter selection grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-500 mb-1.5">Equipment</p>
                <select
                  value={filterEquipment}
                  onChange={e => handleEquipmentChange(e.target.value)}
                  className="w-full bg-[#121318] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500/80 transition-all cursor-pointer"
                >
                  {EQUIPMENT_LIST.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              {([
                ["Application", APPLICATIONS, filterApp, setFilterApp],
                ["Size", SIZES, filterSize, setFilterSize],
                ["Type", TYPES, filterType, setFilterType],
              ] as [string, string[], string, (v: string) => void][]).map(([label, opts, val, setter]) => (
                <div key={label}>
                  <p className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-500 mb-1.5">{label}</p>
                  <select
                    value={val}
                    onChange={e => {
                      setter(e.target.value)
                      if (label === "Size") setFilterEquipment("None")
                    }}
                    className="w-full bg-[#121318] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500/80 transition-all cursor-pointer"
                  >
                    {opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Tier cards */}
            {tieredBlades.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-white/5 rounded-xl text-neutral-500 text-xs italic">
                No blades match those filters. Try selecting "All" for Application or Type.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(["Good", "Better", "Best"] as const).map(tier => {
                  const blades = tieredBlades.filter(b => b.tier === tier)
                  if (blades.length === 0) return null
                  const colors = TIER_COLORS[tier]
                  return (
                    <div key={tier} className="space-y-2 flex flex-col h-full bg-black/20 p-2.5 rounded-xl border border-white/5">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md inline-block w-max tracking-wider ${colors.badge}`}>{tier}</span>
                      <div className="space-y-2 flex-1">
                        {blades.map(b => (
                          <div
                            key={b.sku}
                            className={`flex flex-col justify-between p-3 rounded-xl border transition-all duration-300 ${colors.bg} ${colors.border}`}
                          >
                            <div className="min-w-0 pb-2">
                              <p className="text-xs font-bold text-white leading-tight truncate" title={b.name}>{b.name}</p>
                              <p className="text-[9px] text-neutral-500 mt-0.5 font-mono">{b.sku} · {b.size ?? "?"} · {b.type}</p>
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-white/5 shrink-0">
                              <span className={`text-sm font-black ${colors.price}`}>${b.price.toFixed(2)}</span>
                              <button
                                type="button"
                                onClick={() => openAddItemModal(b)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all cursor-pointer bg-violet-600 hover:bg-violet-500 hover:shadow-[0_0_10px_rgba(139,92,246,0.3)] hover:-translate-y-0.5 active:translate-y-0 text-white"
                              >
                                <FiPlus size={10} /> Add
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Product Search ── */}
      <div ref={productSearchRef} className="relative">
        <div className="flex items-center gap-2.5 bg-[#121318] border border-white/10 rounded-xl px-3.5 py-2.5 focus-within:border-violet-500/80 focus-within:shadow-[0_0_15px_rgba(139,92,246,0.05)] transition-all">
          <FiSearch size={14} className="text-neutral-400 shrink-0" />
          <input
            type="text"
            value={productSearch}
            onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true) }}
            onFocus={() => setShowProductDropdown(true)}
            placeholder="Search all products to add..."
            className="flex-1 bg-transparent text-xs text-white placeholder-neutral-600 outline-none"
          />
          {productSearch && (
            <button type="button" onClick={() => { setProductSearch(""); setShowProductDropdown(false) }} className="text-neutral-400 hover:text-white transition-colors cursor-pointer">
              <FiX size={14} />
            </button>
          )}
        </div>

        {showProductDropdown && searchResults.length > 0 && (
          <div className="absolute z-50 top-full mt-1.5 left-0 right-0 bg-[#0f1013]/95 border border-white/10 rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-white/5 scrollbar-thin">
            {searchResults.map(p => {
              const desc = parseDesc(p.description)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openAddItemModal({ name: p.name, sku: p.sku, price: p.price || 0, cost: desc.cost || 0, subjectToVig: p.subjectToVig !== false, giftItem: !!p.giftItem })}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                      <FiPlus size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate" title={p.name}>{p.name}</p>
                      <p className="text-[10px] text-neutral-500 font-mono mt-0.5">{p.sku} · {p.category}</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-black text-amber-400 shrink-0">${(p.price || 0).toFixed(2)}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Quick Add Rails ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Previous Purchases */}
        {previousPurchasesNoGifts.length > 0 && (
          <div className="space-y-2 glass-panel border border-emerald-500/20 p-3.5 rounded-2xl bg-emerald-950/[0.02]">
            <p className="text-[9px] text-emerald-400 uppercase tracking-widest font-black flex items-center gap-1.5">
              <FiPackage size={11} className="text-emerald-500" />
              Previous Purchases ({previousPurchasesNoGifts.length})
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto scrollbar-thin pr-1">
              {previousPurchasesNoGifts.map((p, idx) => (
                <button
                  key={`${p.sku}-${idx}`}
                  type="button"
                  onClick={() => openAddItemModal({ name: p.name, sku: p.sku, price: p.price, cost: p.cost, subjectToVig: p.subjectToVig })}
                  className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-all cursor-pointer bg-emerald-950/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500 hover:text-black hover:border-emerald-300 hover:-translate-y-0.5 shadow-sm active:translate-y-0"
                  title={`Re-order past item: ${p.name} - $${(p.price || 0).toFixed(2)}`}
                >
                  <span>🛍️ {p.name}</span>
                  {p.price > 0 && <span className="text-[9px] font-mono opacity-80 ml-1.5 border-l border-emerald-500/30 pl-1.5">${(p.price || 0).toFixed(0)}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Blades Matching Usage */}
        {usageMatchedBlades.length > 0 && (
          <div className="space-y-2 glass-panel border border-cyan-500/20 p-3.5 rounded-2xl bg-cyan-950/[0.02]">
            <p className="text-[9px] text-cyan-400 uppercase tracking-widest font-black flex items-center gap-1.5">
              <FiFilter size={11} className="text-cyan-500" />
              Matching Equipment ({usageMatchedBlades.length})
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto scrollbar-thin pr-1">
              {usageMatchedBlades.map(bp => (
                <button
                  key={bp.sku}
                  type="button"
                  onClick={() => openAddItemModal(bp)}
                  className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-all cursor-pointer bg-cyan-950/20 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500 hover:text-black hover:border-cyan-300 hover:-translate-y-0.5 shadow-sm active:translate-y-0 flex items-center gap-1"
                  title={`Add matching blade: ${bp.name}`}
                >
                  <span>⚡ {bp.name}</span>
                  {bp.size && <span className="text-[9px] font-mono text-cyan-200/70 ml-1">({bp.size})</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Top 10 Blades & Popular Gifts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-white/5">
        {/* Top 10 */}
        {topBladeProducts.length > 0 && (
          <div className="space-y-2">
            <p className="text-[9px] text-neutral-500 uppercase tracking-widest font-extrabold">Top Catalog Blades</p>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto scrollbar-thin pr-1">
              {topBladeProducts.map(bp => (
                <button
                  key={bp.sku}
                  type="button"
                  onClick={() => openAddItemModal(bp)}
                  className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-all cursor-pointer bg-[#121318] border-white/10 text-neutral-300 hover:border-violet-500/50 hover:text-violet-300 hover:-translate-y-0.5 active:translate-y-0"
                >
                  ⚡ {bp.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Popular Gifts */}
        {popularGifts.length > 0 && (
          <div className="space-y-2">
            <p className="text-[9px] text-purple-400 uppercase tracking-widest font-extrabold flex items-center gap-1.5">
              🎁 Popular Gifts (No VIG)
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto scrollbar-thin pr-1">
              {popularGifts.map(gift => (
                <button
                  key={gift.sku}
                  type="button"
                  onClick={() => openAddItemModal(gift)}
                  className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-all cursor-pointer bg-purple-950/20 border-purple-500/30 text-purple-300 hover:bg-purple-500 hover:text-black hover:border-purple-300 hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-1 shadow-sm"
                >
                  <span>🎁 {gift.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Pending Add Item Modal/Card ── */}
      {pendingItem && (
        <div className="bg-[#12101b] border border-violet-500/30 rounded-2xl p-4 space-y-4 shadow-xl animate-in slide-in-from-top-4 fade-in duration-300 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none" />
          <div className="flex items-start justify-between relative z-10">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400">Configure Item Details</p>
              <p className="text-sm font-black text-white mt-0.5">{pendingItem.name}</p>
              <p className="text-[10px] text-neutral-500 font-mono">{pendingItem.sku}</p>
            </div>
            <button type="button" onClick={() => setPendingItem(null)} className="p-1 text-neutral-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
              <FiX size={16} />
            </button>
          </div>
          
          <div className="grid grid-cols-3 gap-3 relative z-10">
            <div className="bg-black/40 border border-white/5 rounded-xl p-3 text-center space-y-1.5">
              <p className="text-[9px] font-black uppercase tracking-wider text-amber-500">Paid Qty</p>
              <div className="flex justify-center">
                <QtyInput value={addPaidQty} onChange={setAddPaidQty} colorClass="text-amber-400 border-amber-500/30 bg-[#121318]" />
              </div>
            </div>
            <div className="bg-black/40 border border-white/5 rounded-xl p-3 text-center space-y-1.5">
              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-500">Free Qty</p>
              <div className="flex justify-center">
                <QtyInput value={addFreeQty} onChange={setAddFreeQty} colorClass="text-emerald-400 border-emerald-500/30 bg-[#121318]" />
              </div>
            </div>
            <div className="bg-black/40 border border-white/5 rounded-xl p-3 text-center space-y-2 flex flex-col justify-center items-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-violet-400">Unit Price</p>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 font-bold text-xs">$</span>
                <input
                  type="number"
                  value={addPrice}
                  onChange={e => setAddPrice(parseFloat(e.target.value) || 0)}
                  className="w-20 pl-6 pr-2 py-1 bg-[#121318] border border-white/10 rounded-lg text-xs font-mono font-black text-white text-center focus:border-violet-500 outline-none"
                  step="0.01"
                />
              </div>
            </div>
          </div>
          
          <button
            type="button"
            onClick={confirmAddItem}
            disabled={addPaidQty === 0 && addFreeQty === 0}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 hover:shadow-[0_4px_15px_rgba(139,92,246,0.3)] text-white text-xs font-black tracking-wider uppercase transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] relative z-10"
          >
            Add to Order
          </button>
        </div>
      )}

      {/* ── Active Order Cart List ── */}
      {orderLines.length > 0 && (
        <div className="space-y-4">
          {/* Sold Items */}
          {paidLines.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 border-b border-white/5 pb-1">
                <FiDollarSign size={13} className="text-amber-500" />
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                  Sold Items ({paidLines.length})
                </p>
              </div>

              {/* Grid headers */}
              <div className="grid grid-cols-[1fr_74px_90px_28px] gap-2 px-3 text-[9px] font-black text-neutral-500 uppercase tracking-widest">
                <span>Product Name</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Price overrides</span>
                <span />
              </div>

              <div className="space-y-1.5">
                {paidLines.map(line => (
                  <div
                    key={line.id}
                    className="grid grid-cols-[1fr_74px_90px_28px] gap-2 items-center bg-[#121318]/40 border border-white/5 hover:border-white/10 hover:bg-[#121318]/60 transition-colors rounded-xl px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-white truncate block leading-tight" title={line.name}>{line.name}</span>
                      {line.sku && <span className="text-[9px] text-neutral-500 font-mono block mt-0.5">{line.sku}</span>}
                    </div>

                    <div className="flex justify-center">
                      <QtyInput
                        value={line.quantity}
                        onChange={n => updateLine(line.id, { quantity: n })}
                        colorClass="text-white"
                        bgClass="bg-[#121318]"
                      />
                    </div>

                    <div className="text-right space-y-1">
                      <div className="relative inline-block w-20">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500 font-bold text-[10px] font-mono">$</span>
                        <input
                          type="number"
                          value={line.unitPrice}
                          onChange={e => updateLine(line.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                          className="w-full pl-5 pr-2 py-0.5 bg-[#121318] border border-white/10 rounded-md text-[11px] font-mono font-bold text-white text-right focus:border-violet-500 outline-none"
                          step="0.01"
                        />
                      </div>
                      <span className="text-xs font-black text-amber-400 block pr-1">
                        ${(line.quantity * line.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-400 hover:text-white hover:bg-rose-500/80 transition-all flex items-center justify-center cursor-pointer font-bold text-xs"
                      >×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Promotional / Gift Items */}
          {promoLines.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-1.5 border-b border-white/5 pb-1">
                <FiTag size={13} className="text-emerald-400" />
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                  🎁 Promotional Gifts ({promoLines.length})
                </p>
              </div>

              {/* Grid headers */}
              <div className="grid grid-cols-[1fr_74px_28px] gap-2 px-3 text-[9px] font-black text-neutral-500 uppercase tracking-widest">
                <span>Gift Name</span>
                <span className="text-center">Free Qty</span>
                <span />
              </div>

              <div className="space-y-1.5">
                {promoLines.map(line => (
                  <div
                    key={`promo-${line.id}`}
                    className="grid grid-cols-[1fr_74px_28px] gap-2 items-center bg-emerald-950/[0.05] border border-emerald-500/15 hover:border-emerald-500/30 hover:bg-emerald-950/[0.08] transition-colors rounded-xl px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-emerald-300 truncate block leading-tight" title={line.name}>{line.name}</span>
                      <span className="text-[9px] text-emerald-700/90 font-bold font-mono mt-0.5">PROMOTIONAL FREE · {line.sku}</span>
                    </div>

                    <div className="flex justify-center">
                      <QtyInput
                        value={line.quantity}
                        onChange={n => updateLine(line.id, { quantity: n })}
                        colorClass="text-emerald-300"
                        bgClass="bg-emerald-950/20"
                        btnClass="bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-400 hover:text-white"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-400 hover:text-white hover:bg-rose-500/80 transition-all flex items-center justify-center cursor-pointer font-bold text-xs"
                        title="Remove promo item"
                      >×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {orderLines.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 glass-panel border border-white/5 rounded-2xl text-neutral-500 bg-white/[0.01]">
          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-neutral-400 border border-white/5">
            <FiShoppingCart size={18} />
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-neutral-400">Order Cart is Empty</p>
            <p className="text-[10px] text-neutral-600 mt-1">Use Blade Lookup, search or Quick Add above to add items</p>
          </div>
        </div>
      )}

      {/* ── Dashboard Metrics Grid & Checkout Panel ── */}
      {orderLines.length > 0 && (
        <div className="space-y-4 pt-3 border-t border-white/10">
          
          {/* Dashboard Metrics Grid */}
          {financials && (
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-500/70 flex items-center gap-1.5 px-1">
                <FiTrendingUp size={11} className="text-amber-500 animate-pulse" />
                Live Financials Dashboard
              </p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {/* Margin */}
                <div className="bg-black/30 border border-white/5 rounded-xl p-3 text-center flex flex-col justify-center items-center shadow-inner relative overflow-hidden">
                  <div className="absolute top-1 right-2 text-neutral-600/30"><FiPercent size={24} /></div>
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-500">Margin</span>
                  <span className={`text-base font-black mt-1 ${financials.marginPct >= 30 ? "text-emerald-400" : financials.marginPct >= 15 ? "text-amber-400" : "text-rose-400"}`}>
                    {financials.marginPct.toFixed(1)}%
                  </span>
                </div>

                {/* Dead Cost */}
                <div className="bg-black/30 border border-white/5 rounded-xl p-3 text-center flex flex-col justify-center items-center shadow-inner relative overflow-hidden">
                  <div className="absolute top-1 right-2 text-neutral-600/30"><FiAlertCircle size={24} /></div>
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-500">Dead Cost (COGS)</span>
                  <span className="text-base font-black text-rose-400 mt-1">
                    ${financials.deadCostTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </div>

                {/* Profit after VIG */}
                <div className="bg-violet-500/[0.02] border border-violet-500/15 rounded-xl p-3 text-center flex flex-col justify-center items-center shadow-inner relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-500/[0.02] to-transparent pointer-events-none" />
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-violet-400">Profit (VIG {vigRate}x)</span>
                  <span className={`text-base font-black mt-1 ${financials.profitAfterVig >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    ${financials.profitAfterVig.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Commission */}
                <div className="bg-emerald-500/[0.03] border border-emerald-500/20 rounded-xl p-3 text-center flex flex-col justify-center items-center shadow-[0_0_15px_rgba(16,185,129,0.02)] relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.03] to-transparent pointer-events-none" />
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-400">Rep Payout ({commissionPct}%)</span>
                  <span className="text-base font-black text-emerald-400 mt-1 font-mono tracking-tight glow-emerald">
                    ${financials.salesCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Collapsible details for math context */}
              <div className="bg-[#121318]/50 border border-white/5 rounded-xl p-3 text-[10px] space-y-1 text-neutral-400 leading-relaxed font-mono">
                <div className="flex justify-between">
                  <span>Gross Sales Subtotal:</span>
                  <span className="text-white font-bold">${financials.subTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Direct Dead Cost (No markup):</span>
                  <span>${financials.deadCostTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between border-t border-white/5 pt-1 mt-1 font-sans">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">Estimate Dead Profit (LTV - direct cost)</span>
                  <span className="text-white font-black">${financials.deadProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          )}

          {/* Checkout Preview Button */}
          <button
            type="button"
            onClick={() => setShowMockOrder(true)}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:via-purple-500 hover:to-indigo-500 text-white text-xs font-black uppercase tracking-wider hover:shadow-[0_4px_20px_rgba(139,92,246,0.35)] transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-[0.99] border border-violet-500/20"
          >
            <FiFileText size={14} /> Preview Order / Quote
          </button>
        </div>
      )}

      {/* ── Sales Order Preview Modal ── */}
      {showMockOrder && orderLines.length > 0 && (
        <div
          className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowMockOrder(false)}
        >
          <div
            className="glass-panel border border-neutral-700 bg-[#0c0d12]/95 rounded-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="sticky top-0 bg-[#0f1016]/90 backdrop-blur border-b border-white/10 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h3 className="text-white font-black text-base flex items-center gap-2">
                  <FiFileText className="text-violet-500" />
                  {transactionType === "SalesOrder" ? "Sales Order Preview" : "Quote / Estimate Preview"}
                </h3>
                <p className="text-[10px] text-neutral-400 mt-0.5">
                  {accountName || "Customer"} · {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <button type="button" onClick={() => setShowMockOrder(false)} className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer">
                <FiX size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* Transaction Type Toggle Tabs */}
              <div className="flex bg-neutral-900/80 border border-white/10 rounded-2xl p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setTransactionType("SalesOrder")}
                  className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    transactionType === "SalesOrder"
                      ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20"
                      : "text-neutral-400 hover:text-white hover:bg-white/[0.03]"
                  }`}
                >
                  <FiFileText size={12} />
                  Sales Order
                </button>
                <button
                  type="button"
                  onClick={() => setTransactionType("Quote")}
                  className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    transactionType === "Quote"
                      ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20"
                      : "text-neutral-400 hover:text-white hover:bg-white/[0.03]"
                  }`}
                >
                  <FiTag size={12} />
                  Quote / Estimate
                </button>
              </div>

              {/* Billing/Shipping Address Grid */}
              {(accountName || accountDetail) && (
                <div className="grid grid-cols-2 gap-4 bg-white/[0.01] border border-white/5 p-4 rounded-2xl text-[10px]">
                  <div>
                    <p className="text-neutral-500 uppercase tracking-widest font-black mb-1 border-b border-white/5 pb-0.5">Bill To</p>
                    <p className="text-white font-bold text-xs">{accountName}</p>
                    {accountDetail?.billingStreet && <p className="text-neutral-400 mt-1 leading-relaxed">{accountDetail.billingStreet}</p>}
                  </div>
                  <div>
                    <p className="text-neutral-500 uppercase tracking-widest font-black mb-1 border-b border-white/5 pb-0.5">Ship To</p>
                    <p className="text-white font-bold text-xs">{accountName}</p>
                    {(accountDetail?.shippingStreet || accountDetail?.billingStreet) && (
                      <p className="text-neutral-400 mt-1 leading-relaxed">{accountDetail.shippingStreet || accountDetail.billingStreet}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Sold Items Preview Table */}
              {paidLines.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-400/90 flex items-center gap-1.5">
                    <FiDollarSign size={12} className="text-amber-500" /> Sold Items Summary
                  </p>
                  <div className="border border-white/10 rounded-2xl overflow-hidden shadow-md">
                    <div className="grid grid-cols-[1fr_50px_80px_90px] gap-2 px-4 py-2 bg-neutral-800/40 text-[9px] font-black text-neutral-400 uppercase tracking-wider">
                      <span>Item</span>
                      <span className="text-center">Qty</span>
                      <span className="text-right">Unit Price</span>
                      <span className="text-right">Total Amount</span>
                    </div>
                    <div className="divide-y divide-white/5">
                      {paidLines.map((line, idx) => (
                        <div key={`so-paid-${line.id}`} className={`grid grid-cols-[1fr_50px_80px_90px] gap-2 px-4 py-3 items-center ${idx % 2 === 0 ? "bg-white/[0.01]" : ""}`}>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate" title={line.name}>{line.name}</p>
                            {line.sku && <p className="text-[9px] text-neutral-500 font-mono mt-0.5">{line.sku}</p>}
                          </div>
                          <span className="text-xs font-black text-white text-center">{line.quantity}</span>
                          <span className="text-xs font-mono text-neutral-400 text-right">${line.unitPrice.toFixed(2)}</span>
                          <span className="text-xs font-mono font-black text-white text-right">${(line.quantity * line.unitPrice).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Promotional Items Preview Table */}
              {promoLines.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400/90 flex items-center gap-1.5">
                    <FiTag size={12} className="text-emerald-400" /> 🎁 Promotional Items Summary
                  </p>
                  <div className="border border-emerald-500/15 rounded-2xl overflow-hidden shadow-md">
                    <div className="grid grid-cols-[1fr_60px_80px_90px] gap-2 px-4 py-2 bg-emerald-950/20 text-[9px] font-black text-emerald-400/70 uppercase tracking-wider">
                      <span>Item</span>
                      <span className="text-center">Free Qty</span>
                      <span className="text-right">Unit Price</span>
                      <span className="text-right">Total Amount</span>
                    </div>
                    <div className="divide-y divide-white/5 bg-emerald-950/[0.02]">
                      {promoLines.map((line, idx) => (
                        <div key={`so-promo-${line.id}`} className={`grid grid-cols-[1fr_60px_80px_90px] gap-2 px-4 py-3 items-center ${idx % 2 === 0 ? "bg-emerald-950/[0.04]" : ""}`}>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-emerald-300 truncate" title={line.name}>{line.name}</p>
                            <p className="text-[9px] text-emerald-700/80 font-bold font-mono mt-0.5">PROMOTIONAL FREE</p>
                          </div>
                          <span className="text-xs font-black text-emerald-400 text-center">{line.quantity}</span>
                          <span className="text-xs font-mono text-emerald-700 text-right">$0.00</span>
                          <span className="text-xs font-mono font-black text-emerald-400 text-right">$0.00</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Checkout Financial Calculations Summary */}
              <div className="border-t border-white/10 pt-4 space-y-2">
                <div className="flex justify-between px-1">
                  <span className="text-xs text-neutral-400">Subtotal (Gross Sales)</span>
                  <span className="text-xs font-bold text-white">${paidLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0).toFixed(2)}</span>
                </div>
                {promoLines.length > 0 && (
                  <div className="flex justify-between px-1">
                    <span className="text-xs text-emerald-500">🎁 Promotional Value</span>
                    <span className="text-xs font-bold text-emerald-400">$0.00</span>
                  </div>
                )}
                <div className="flex justify-between px-1">
                  <span className="text-xs text-neutral-400">Total Items Shipping</span>
                  <span className="text-xs font-bold text-white">{orderLines.reduce((s, l) => s + l.quantity, 0)} units</span>
                </div>
                <div className="flex justify-between px-1 pt-2.5 border-t border-white/10">
                  <span className="text-xs font-black text-white">ORDER TOTAL</span>
                  <span className="text-base font-black text-amber-400 tracking-tight">${orderTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* Profit breakdown for internal review */}
              {financials && (
                <div className="border-t border-amber-500/20 pt-4 space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-1.5 mb-1.5">
                    <FiTrendingUp size={11} className="text-amber-500" /> Internal Commissions & Profits
                  </p>
                  <div className="bg-[#121318]/70 border border-white/5 rounded-2xl p-4 space-y-2 font-mono text-xs">
                    {[
                      ["Direct Dead Cost (All Items)", `-$${financials.deadCostTotal.toFixed(2)}`, "text-rose-400"],
                      ["Direct Dead Profit", `$${financials.deadProfit.toFixed(2)}`, financials.deadProfit >= 0 ? "text-emerald-400" : "text-rose-400"],
                      [`Total Cost + Rep VIG (${vigRate}×)`, `-$${financials.deadCostPlusVig.toFixed(2)}`, "text-rose-400"],
                    ].map(([label, val, color]) => (
                      <div key={label as string} className="flex justify-between text-[11px]">
                        <span className="text-neutral-500">{label}</span>
                        <span className={`font-bold ${color}`}>{val}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t border-white/5 font-sans">
                      <span className="text-xs font-bold text-amber-300">Profit after VIG</span>
                      <span className={`text-xs font-black ${financials.profitAfterVig >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        ${financials.profitAfterVig.toFixed(2)}
                        <span className={`text-[10px] ml-1.5 font-bold ${financials.marginPct >= 30 ? "text-emerald-500" : financials.marginPct >= 15 ? "text-amber-500" : "text-rose-500"}`}>
                          ({financials.marginPct.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-white/5 font-sans">
                      <span className="text-xs font-bold text-green-300">Sales Payout ({commissionPct}%)</span>
                      <span className="text-xs font-black text-green-400">${financials.salesCommission.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-[#0f1016]/90 backdrop-blur border-t border-white/10 px-6 py-4 flex gap-3 rounded-b-2xl z-10">
              <button
                type="button"
                onClick={() => setShowMockOrder(false)}
                className="flex-1 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white text-xs font-bold transition-all cursor-pointer"
              >
                Back to Edit
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmOrder}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:via-purple-500 hover:to-indigo-500 hover:shadow-[0_4px_15px_rgba(139,92,246,0.3)] text-white text-xs font-black transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 active:scale-[0.99]"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing Transaction...
                  </>
                ) : (
                  transactionType === "SalesOrder" ? "Confirm & Push Order" : "Confirm & Push Quote"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
