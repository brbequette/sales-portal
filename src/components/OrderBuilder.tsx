"use client"


/**
 * OrderBuilder.tsx
 *
 * Universal Order Builder -- shared by all POS transaction spots:
 *   - SalesCallCampaignModal (Titan Dialer campaign view)
 *   - AccountDialer (account page dialer)
 *   - CommunicationCenter (account page comm hub)
 *
 * Features:
 *   ✅ Blade Lookup -- filter by Application, Size, Type â†' Good/Better/Best cards
 *   ✅ Product search (full catalog)
 *   ✅ Quick-Add top 10 blades
 *   ✅ Sold Items section (paidQty > 0) -- editable qty input + +/- buttons
 *   ✅ Promotional Items section (freeQty > 0) -- separated, green, gift items
 *   ✅ Editable unit price per line
 *   ✅ Live financials (Dead Cost, Profit, VIG, Commission, Margin)
 *   ✅ Sales Order preview modal
 */

import { useState, useRef, useMemo, useEffect } from "react"
import {
  FiSearch, FiX, FiPlus, FiShoppingCart, FiTag,
  FiDollarSign, FiFileText, FiTrendingUp, FiFilter,
  FiPackage, FiChevronDown,
} from "react-icons/fi"

// â"€â"€â"€ Types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export type OrderLine = {
  id: string
  name: string
  sku: string
  quantity: number
  unitPrice: number
  cost: number
  isPromo: boolean
}

export interface OrderBuilderProps {
  orderLines?: OrderLine[]
  setOrderLines?: (lines: OrderLine[] | ((prev: OrderLine[]) => OrderLine[])) => void
  catalogProducts?: any[]
  vigRate?: number
  commissionPct?: number
  /** Optional: customer name shown in mock Sales Order */
  accountName?: string
  /** Optional: full account/address object for Sales Order */
  accountDetail?: any
  /** Accent colour class prefix (e.g. "violet", "cyan") -- defaults to "violet" */
  accent?: "violet" | "cyan" | "emerald" | "sky"
  accountId?: string
  dealId?: string
  onCancel?: () => void
  onSuccess?: () => void
}

// â"€â"€â"€ Blade lookup config â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

/** Keywords used to match product names to Application categories */
const APPLICATION_KEYWORDS: Record<string, string[]> = {
  "Asphalt":              ["asphalt", "asp", "pavement", "road"],
  "Concrete":             ["concrete", "conc"],
  "Reinforced Concrete":  ["reinforced", "rebar", "re-enforced", "ductile", "pipe"],
  "Brick / Block / Stone":["brick", "block", "stone", "masonry", "paver"],
  "Ductile Iron":         ["ductile", "iron", "d.i."],
  "General Purpose":      ["general", "gp", "all purpose", "multipurpose", "titan", "medusa", "dark knight", "champion", "wizard"],
}

/** Keywords to match Type */
const TYPE_KEYWORDS: Record<string, string[]> = {
  "Segmented":      ["segment", "sgmt"],
  "Turbo":          ["turbo"],
  "Continuous Rim": ["continuous", "rim", "cont"],
  "Premium Turbo":  ["premium turbo", "prem turbo"],
  "Abrasive":       ["abrasive", "abra", "cup", "wheel"],
}

/** Extract inch size from product name (e.g. "MEDUSA 14" â†' "14\"") */
function extractSize(name: string): string | null {
  const m = name.match(/\b(4\.5|4-1\/2|7|9|10|12|14|16|18|20|24)\b/)
  if (!m) return null
  const n = parseFloat(m[1])
  if (n >= 20) return '20"+'
  return `${n}"`
}

/** Match product name/category to an application */
function matchApplication(name: string, category: string): string {
  const hay = (name + " " + category).toLowerCase()
  for (const [app, keywords] of Object.entries(APPLICATION_KEYWORDS)) {
    if (keywords.some(k => hay.includes(k))) return app
  }
  return "General Purpose"
}

/** Match product name to a blade type */
function matchType(name: string, category: string): string {
  const hay = (name + " " + category).toLowerCase()
  // Check longest/most specific first
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some(k => hay.includes(k))) return type
  }
  if (hay.includes("blade")) return "Segmented" // default for plain blades
  return "Segmented"
}

// â"€â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function parseDesc(raw: string | null | undefined): Record<string, any> {
  try { return JSON.parse(raw || "{}") } catch { return {} }
}

const TIER_LABELS = ["Good", "Better", "Best"] as const
const TIER_COLORS = {
  Good:   { bg: "bg-neutral-800", border: "border-neutral-600", badge: "bg-neutral-700 text-neutral-300", price: "text-neutral-300" },
  Better: { bg: "bg-sky-950/40",  border: "border-sky-700/50",  badge: "bg-sky-800/60 text-sky-300",     price: "text-sky-300" },
  Best:   { bg: "bg-amber-950/40",border: "border-amber-600/50",badge: "bg-amber-700/60 text-amber-300", price: "text-amber-300" },
}

// â"€â"€â"€ Sub-components â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function QtyInput({
  value,
  onChange,
  colorClass = "text-white",
  bgClass = "bg-neutral-800",
  btnClass = "bg-neutral-800 hover:bg-neutral-700 text-neutral-400",
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
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer ${btnClass}`}
      >-</button>
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false) } }}
          className={`w-10 h-5 text-center text-[11px] font-black rounded outline-none border border-violet-500 ${bgClass} ${colorClass}`}
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={() => { setEditing(true); setDraft(String(value)) }}
          className={`w-10 h-5 text-center text-[11px] font-black rounded cursor-text ${bgClass} ${colorClass} hover:border hover:border-violet-500/50 transition-all`}
          title="Click to edit"
        >
          {value}
        </button>
      )}
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer ${btnClass}`}
      >+</button>
    </div>
  )
}

// â"€â"€â"€ Main Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export function OrderBuilder({
  orderLines: externalOrderLines,
  setOrderLines: externalSetOrderLines,
  catalogProducts: externalCatalogProducts,
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
  const isControlled = externalSetOrderLines !== undefined
  const [internalOrderLines, setInternalOrderLines] = useState<OrderLine[]>(externalOrderLines || [])
  const [internalCatalogProducts, setInternalCatalogProducts] = useState<any[]>([])
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const orderLines = isControlled ? (externalOrderLines as OrderLine[]) : internalOrderLines
  const setOrderLines = isControlled ? (externalSetOrderLines as any) : setInternalOrderLines
  const catalogProducts = externalCatalogProducts ?? internalCatalogProducts

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
        itemId: null,
        rate: i.unitPrice,
        discount: 0,
        quantity: i.quantity,
        description: `SKU: ${i.sku}` + (i.isPromo ? " (PROMO FREE)" : "")
      }))

      const res = await fetch("/api/create-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          dealId,
          type: "SalesOrder",
          amount: orderTotal,
          items: itemsFormatted,
          lineItems: lineItems,
          processingNotes: "Order created via Standalone OrderBuilder",
        }),
      })

      if (res.ok) {
        alert("SalesOrder created successfully!")
        if (onSuccess) onSuccess()
        setShowMockOrder(false)
        if (!externalOrderLines) setInternalOrderLines([])
      } else {
        const data = await res.json()
        alert(data.error || data.message || "Failed to create order")
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
  const [pendingItem, setPendingItem] = useState<{name: string, sku: string, cost: number, defaultPrice: number} | null>(null)
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

  // â"€â"€ Derived product lists â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
        }
      })
  }, [catalogProducts])

  const topBladeProducts = useMemo(() => activeBlades.slice(0, 10), [activeBlades])

  /** Blades filtered by the lookup dropdowns */
  const filteredBlades = useMemo(() => {
    return activeBlades.filter(b => {
      if (filterApp !== "All" && b.application !== filterApp) return false
      if (filterSize !== "All" && b.size !== filterSize) return false
      if (filterType !== "All" && b.type !== filterType) return false
      return true
    })
  }, [activeBlades, filterApp, filterSize, filterType])

  /**
   * Assign Good/Better/Best tiers by price (ascending = Good â†' Best).
   * If only 1 or 2 results, label them accordingly.
   */
  const tieredBlades = useMemo(() => {
    const sorted = [...filteredBlades].sort((a, b) => a.price - b.price)
    if (sorted.length === 0) return []
    if (sorted.length === 1) return [{ ...sorted[0], tier: "Best" as const }]
    if (sorted.length === 2) return [
      { ...sorted[0], tier: "Good" as const },
      { ...sorted[1], tier: "Best" as const },
    ]
    // 3+ items: divide into thirds
    const third = Math.floor(sorted.length / 3)
    return sorted.map((b, i) => ({
      ...b,
      tier: (i < third ? "Good" : i < third * 2 ? "Better" : "Best") as "Good" | "Better" | "Best",
    }))
  }, [filteredBlades])

  // â"€â"€ Financials â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const financials = useMemo(() => {
    if (orderLines.length === 0) return null
    const subTotal = orderLines.reduce((s, l) => s + (!l.isPromo ? l.quantity * l.unitPrice : 0), 0)
    const deadCostSubjectToVig = orderLines.reduce((s, l) => s + (!l.isPromo ? l.cost * l.quantity : 0), 0)
    const deadCostNoVig = orderLines.reduce((s, l) => s + (l.isPromo ? l.cost * l.quantity : 0), 0)
    const deadCostTotal = deadCostSubjectToVig + deadCostNoVig
    const deadCostPlusVig = deadCostSubjectToVig * vigRate + deadCostNoVig
    const deadProfit = subTotal - deadCostTotal
    const profitAfterVig = subTotal - deadCostPlusVig
    const salesCommission = profitAfterVig > 0 ? profitAfterVig * (commissionPct / 100) : 0
    const marginPct = subTotal > 0 ? (profitAfterVig / subTotal) * 100 : 0
    return { subTotal, deadCostTotal, deadCostPlusVig, deadProfit, profitAfterVig, salesCommission, marginPct }
  }, [orderLines, vigRate, commissionPct])

  // â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const openAddItemModal = (p: { name: string; sku: string; price: number; cost: number }) => {
    setPendingItem({ name: p.name, sku: p.sku, defaultPrice: p.price, cost: p.cost })
    setAddPaidQty(1)
    setAddFreeQty(0)
    setAddPrice(p.price)
    setProductSearch("")
    setShowProductDropdown(false)
  }

  const confirmAddItem = () => {
    if (!pendingItem) return
    const newLines: OrderLine[] = []
    
    // Create paid line if qty > 0
    if (addPaidQty > 0) {
      newLines.push({
        id: Date.now().toString() + pendingItem.sku + '-paid',
        name: pendingItem.name,
        sku: pendingItem.sku,
        quantity: addPaidQty,
        unitPrice: addPrice,
        cost: pendingItem.cost,
        isPromo: false
      })
    }
    
    // Create free line if qty > 0
    if (addFreeQty > 0) {
      newLines.push({
        id: Date.now().toString() + pendingItem.sku + '-free',
        name: pendingItem.name,
        sku: pendingItem.sku,
        quantity: addFreeQty,
        unitPrice: 0,
        cost: pendingItem.cost,
        isPromo: true
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

  // â"€â"€ Filtered search results â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  return (
    <div className="space-y-3">

      {/* â"€â"€ Header â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400 flex items-center gap-1.5">
          <FiShoppingCart size={11} /> Build Order
        </span>
        {orderLines.length > 0 && (
          <span className="text-[10px] font-black text-violet-300">
            {orderLines.length} item{orderLines.length !== 1 ? "s" : ""} . ${orderTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        )}
      </div>

      {/* â"€â"€ Blade Lookup â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div className="border border-white/10 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowBladeLookup(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 glass-panel hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/80 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            <FiFilter size={11} />
            Blade Lookup -- Equipment . Application . Size . Type
          </span>
          <FiChevronDown
            size={12}
            className={`text-neutral-500 transition-transform duration-200 ${showBladeLookup ? "rotate-180" : ""}`}
          />
        </button>

        {showBladeLookup && (
          <div className="px-3 pb-3 pt-2 glass-panel/60 space-y-3 border-t border-white/10">
            {/* Filter dropdowns */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-neutral-600 mb-1">Equipment</p>
                <select
                  value={filterEquipment}
                  onChange={e => handleEquipmentChange(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-violet-500 cursor-pointer"
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
                  <p className="text-[8px] font-bold uppercase tracking-wider text-neutral-600 mb-1">{label}</p>
                  <select
                    value={val}
                    onChange={e => {
                      setter(e.target.value)
                      if (label === "Size") setFilterEquipment("None")
                    }}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-violet-500 cursor-pointer"
                  >
                    {opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Tier cards */}
            {tieredBlades.length === 0 ? (
              <p className="text-[10px] text-neutral-600 italic text-center py-2">
                No blades match those filters. Try "All" for Application or Type.
              </p>
            ) : (
              <div className="space-y-1.5">
                {(["Good", "Better", "Best"] as const).map(tier => {
                  const blades = tieredBlades.filter(b => b.tier === tier)
                  if (blades.length === 0) return null
                  const colors = TIER_COLORS[tier]
                  return (
                    <div key={tier}>
                      <p className="text-[8px] font-bold uppercase tracking-wider text-neutral-500 mb-1">{tier}</p>
                      <div className="space-y-1">
                        {blades.map(b => {
                          const already = orderLines.some(l => l.sku === b.sku)
                          return (
                            <div
                              key={b.sku}
                              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${colors.bg} ${colors.border} transition-all`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${colors.badge} shrink-0`}>{tier}</span>
                                <div className="min-w-0">
                                  <p className="text-[11px] font-bold text-white truncate">{b.name}</p>
                                  <p className="text-[8px] text-neutral-500">{b.sku} . {b.size ?? "?"} . {b.type}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[11px] font-black ${colors.price}`}>${b.price.toFixed(2)}</span>
                                <button
                                  type="button"
                                  onClick={() => openAddItemModal(b)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black transition-all cursor-pointer bg-violet-600 hover:bg-violet-500 text-white"
                                >
                                  <FiPlus size={9} /> Add
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* â"€â"€ Product Search â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div ref={productSearchRef} className="relative">
        <div className="flex items-center gap-2 glass-panel border border-neutral-700 rounded-lg px-3 py-2 focus-within:border-violet-500 transition-colors">
          <FiSearch size={12} className="text-neutral-500 shrink-0" />
          <input
            type="text"
            value={productSearch}
            onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true) }}
            onFocus={() => setShowProductDropdown(true)}
            placeholder="Search all products to add..."
            className="flex-1 bg-transparent text-xs text-white placeholder-neutral-600 outline-none"
          />
          {productSearch && (
            <button type="button" onClick={() => { setProductSearch(""); setShowProductDropdown(false) }} className="text-neutral-500 hover:text-white cursor-pointer">
              <FiX size={12} />
            </button>
          )}
        </div>

        {showProductDropdown && searchResults.length > 0 && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 glass-panel border border-neutral-700 rounded-xl shadow-2xl max-h-52 overflow-y-auto">
            {searchResults.map(p => {
              const desc = parseDesc(p.description)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openAddItemModal({ name: p.name, sku: p.sku, price: p.price || 0, cost: desc.cost || 0 })}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 transition-colors border-b border-white/10/50 last:border-0 cursor-pointer"
                >
                  <FiPlus size={12} className="text-violet-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-white truncate">{p.name}</p>
                    <p className="text-[9px] text-neutral-500">{p.sku} . {p.category}</p>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-amber-400 shrink-0">${(p.price || 0).toFixed(2)}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* â"€â"€ Quick Add -- Top Blades â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      {topBladeProducts.length > 0 && (
        <div>
          <p className="text-[9px] text-neutral-600 uppercase tracking-wider font-bold mb-1.5">Quick Add -- Top Blades</p>
          <div className="flex flex-wrap gap-1.5">
            {topBladeProducts.map(bp => {
              return (
                <button
                  key={bp.sku}
                  type="button"
                  onClick={() => openAddItemModal(bp)}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer glass-panel border-neutral-700 text-neutral-400 hover:border-violet-500/50 hover:text-violet-300"
                >
                  ⚡ {bp.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* â"€â"€ Add Item Pending Modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      {pendingItem && (
        <div className="bg-violet-950/40 border border-violet-500/40 rounded-xl p-3 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400">Add Item</p>
              <p className="text-sm font-bold text-white truncate">{pendingItem.name}</p>
              <p className="text-[9px] text-neutral-400">{pendingItem.sku}</p>
            </div>
            <button type="button" onClick={() => setPendingItem(null)} className="text-neutral-500 hover:text-white">
              <FiX size={14} />
            </button>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            <div className="glass-panel/60 border border-white/10 rounded p-2 text-center space-y-1">
              <p className="text-[8px] font-bold uppercase tracking-wider text-amber-500">Paid Qty</p>
              <div className="flex justify-center">
                <QtyInput value={addPaidQty} onChange={setAddPaidQty} colorClass="text-amber-400 border-amber-500/30 focus:border-amber-500" bgClass="bg-black/20" />
              </div>
            </div>
            <div className="glass-panel/60 border border-white/10 rounded p-2 text-center space-y-1">
              <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-500">Free Qty</p>
              <div className="flex justify-center">
                <QtyInput value={addFreeQty} onChange={setAddFreeQty} colorClass="text-emerald-400 border-emerald-500/30 focus:border-emerald-500" bgClass="bg-black/20" />
              </div>
            </div>
            <div className="glass-panel/60 border border-white/10 rounded p-2 text-center space-y-1">
              <p className="text-[8px] font-bold uppercase tracking-wider text-violet-400">Unit Price</p>
              <input
                type="number"
                value={addPrice}
                onChange={e => setAddPrice(parseFloat(e.target.value) || 0)}
                className="w-16 mx-auto bg-black/20 border border-neutral-700 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-white text-center focus:border-violet-500 outline-none"
                step="0.01"
              />
            </div>
          </div>
          
          <button
            type="button"
            onClick={confirmAddItem}
            disabled={addPaidQty === 0 && addFreeQty === 0}
            className="w-full py-2 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-black tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add to Order
          </button>
        </div>
      )}

      {/* â"€â"€ Sold Items â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      {paidLines.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <FiDollarSign size={11} className="text-amber-400" />
            <p className="text-[9px] font-bold uppercase tracking-wider text-amber-400">
              Sold Items ({paidLines.length})
            </p>
          </div>

          {/* Header */}
          <div className="grid grid-cols-[1fr_64px_70px_24px] gap-1.5 px-2 text-[8px] font-bold text-neutral-600 uppercase tracking-wider">
            <span>Item</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Price / Line $</span>
            <span />
          </div>

          {paidLines.map(line => (
            <div
              key={line.id}
              className="grid grid-cols-[1fr_64px_70px_24px] gap-1.5 items-center glass-panel/50 border border-white/10/50 rounded-lg px-2 py-1.5"
            >
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-white truncate block">{line.name}</span>
                {line.sku && <span className="text-[8px] text-neutral-600 block">{line.sku}</span>}
              </div>

              <div className="flex justify-center">
                <QtyInput
                  value={line.quantity}
                  onChange={n => updateLine(line.id, { quantity: n })}
                  colorClass="text-white"
                  bgClass="bg-neutral-800"
                  btnClass="bg-neutral-800 hover:bg-neutral-700 text-neutral-400"
                />
              </div>

              <div className="text-right space-y-0.5">
                <input
                  type="number"
                  value={line.unitPrice}
                  onChange={e => updateLine(line.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold text-white text-right focus:border-violet-500 outline-none"
                  step="0.01"
                />
                <span className="text-[10px] font-black text-amber-400 block">
                  ${(line.quantity * line.unitPrice).toFixed(2)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => removeLine(line.id)}
                className="w-5 h-5 rounded bg-red-900/20 text-red-400 text-[10px] font-bold flex items-center justify-center hover:bg-red-900/40 cursor-pointer"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* â"€â"€ Promotional / Gift Items â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      {promoLines.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <FiTag size={11} className="text-emerald-400" />
            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-400">
              🎁 Promotional Items ({promoLines.length})
            </p>
          </div>

          {/* Header */}
          <div className="grid grid-cols-[1fr_64px_24px] gap-1.5 px-2 text-[8px] font-bold text-emerald-800 uppercase tracking-wider">
            <span>Item</span>
            <span className="text-center">Free Qty</span>
            <span />
          </div>

          {promoLines.map(line => (
            <div
              key={`promo-${line.id}`}
              className="grid grid-cols-[1fr_64px_24px] gap-1.5 items-center bg-emerald-950/20 border border-emerald-900/40 rounded-lg px-2 py-1.5"
            >
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-emerald-300 truncate block">{line.name}</span>
                <span className="text-[8px] text-emerald-700 font-bold">PROMOTIONAL -- FREE . {line.sku}</span>
              </div>

              <div className="flex justify-center">
                <QtyInput
                  value={line.quantity}
                  onChange={n => updateLine(line.id, { quantity: n })}
                  colorClass="text-emerald-300"
                  bgClass="bg-emerald-950/40"
                  btnClass="bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400"
                />
              </div>

              <button
                type="button"
                onClick={() => removeLine(line.id)}
                className="w-5 h-5 rounded bg-red-900/20 text-red-400 text-[10px] font-bold flex items-center justify-center hover:bg-red-900/40 cursor-pointer"
                title="Remove promotional item"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* â"€â"€ Empty State â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      {orderLines.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-neutral-600">
          <FiShoppingCart size={22} />
          <p className="text-[10px] italic">Use Blade Lookup, search, or quick-add to start building the order</p>
        </div>
      )}

      {/* â"€â"€ Order Summary â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      {orderLines.length > 0 && (
        <div className="border-t border-violet-500/20 pt-2 space-y-1">
          <div className="flex justify-between px-1">
            <span className="text-[10px] text-neutral-400">Sold Items</span>
            <span className="text-[11px] font-bold text-white">
              {paidLines.reduce((s, l) => s + l.quantity, 0)} items
            </span>
          </div>
          {promoLines.length > 0 && (
            <div className="flex justify-between px-1">
              <span className="text-[10px] text-emerald-500">🎁 Promotional</span>
              <span className="text-[11px] font-bold text-emerald-400">
                {promoLines.reduce((s, l) => s + l.quantity, 0)} free
              </span>
            </div>
          )}
          <div className="flex justify-between px-1 pt-1 border-t border-white/10">
            <span className="text-xs font-bold text-violet-300">Order Total</span>
            <span className="text-sm font-black text-amber-400">
              ${orderTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {/* â"€â"€ Financials â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      {financials && (
        <div className="border-t border-amber-500/20 pt-2 space-y-1">
          <p className="text-[8px] font-bold uppercase tracking-wider text-amber-500/60 px-1 mb-1">💰 Profit Estimates</p>
          {[
            ["Dead Cost", `-$${financials.deadCostTotal.toFixed(2)}`, "text-red-400"],
            ["Dead Profit", `$${financials.deadProfit.toFixed(2)}`, financials.deadProfit >= 0 ? "text-emerald-400" : "text-red-400"],
            [`VIG (${vigRate}×)`, `-$${financials.deadCostPlusVig.toFixed(2)}`, "text-red-400"],
          ].map(([label, val, color]) => (
            <div key={label as string} className="flex justify-between px-1">
              <span className="text-[10px] text-neutral-500">{label}</span>
              <span className={`text-[10px] font-bold ${color}`}>{val}</span>
            </div>
          ))}
          <div className="flex justify-between px-1 pt-1 border-t border-white/10">
            <span className="text-[10px] font-bold text-amber-300">Profit after VIG</span>
            <span className={`text-[11px] font-black ${financials.profitAfterVig >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              ${financials.profitAfterVig.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between px-1">
            <span className="text-[10px] text-neutral-500">Commission ({commissionPct}%)</span>
            <span className="text-[11px] font-black text-green-400">${financials.salesCommission.toFixed(2)}</span>
          </div>
          <div className="flex justify-between px-1">
            <span className="text-[9px] text-neutral-600">Margin</span>
            <span className={`text-[9px] font-bold ${financials.marginPct >= 30 ? "text-emerald-500" : financials.marginPct >= 15 ? "text-amber-500" : "text-red-500"}`}>
              {financials.marginPct.toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* â"€â"€ Preview Button â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      {orderLines.length > 0 && (
        <button
          type="button"
          onClick={() => setShowMockOrder(true)}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-black uppercase tracking-wider hover:from-violet-500 hover:to-purple-500 transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <FiFileText size={14} /> Preview Sales Order
        </button>
      )}

      {/* â"€â"€ Sales Order Preview Modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      {showMockOrder && orderLines.length > 0 && (
        <div
          className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4"
          onClick={() => setShowMockOrder(false)}
        >
          <div
            className="glass-panel border border-neutral-700 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="sticky top-0 glass-panel border-b border-white/10 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h3 className="text-white font-black text-base">Sales Order Preview</h3>
                <p className="text-[10px] text-neutral-500 mt-0.5">
                  {accountName || "Customer"} . {new Date().toLocaleDateString()}
                </p>
              </div>
              <button type="button" onClick={() => setShowMockOrder(false)} className="text-neutral-500 hover:text-white cursor-pointer">
                <FiX size={18} />
              </button>
            </div>

            <div className="px-6 py-4 space-y-5">
              {/* Customer info */}
              {(accountName || accountDetail) && (
                <div className="grid grid-cols-2 gap-3 text-[10px]">
                  <div>
                    <p className="text-neutral-500 uppercase tracking-wider font-bold mb-0.5">Bill To</p>
                    <p className="text-white font-bold">{accountName}</p>
                    {accountDetail?.billingStreet && <p className="text-neutral-400">{accountDetail.billingStreet}</p>}
                  </div>
                  <div>
                    <p className="text-neutral-500 uppercase tracking-wider font-bold mb-0.5">Ship To</p>
                    <p className="text-white font-bold">{accountName}</p>
                    {(accountDetail?.shippingStreet || accountDetail?.billingStreet) && (
                      <p className="text-neutral-400">{accountDetail.shippingStreet || accountDetail.billingStreet}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Sold Items table */}
              {paidLines.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 mb-2 flex items-center gap-1.5">
                    <FiDollarSign size={10} /> Sold Items
                  </p>
                  <div className="border border-white/10 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[1fr_50px_70px_80px] gap-2 px-3 py-1.5 bg-neutral-800/50 text-[8px] font-bold text-neutral-500 uppercase">
                      <span>Item</span><span className="text-center">Qty</span><span className="text-right">Unit</span><span className="text-right">Amount</span>
                    </div>
                    {paidLines.map((line, i) => (
                      <div key={`so-paid-${line.id}`} className={`grid grid-cols-[1fr_50px_70px_80px] gap-2 px-3 py-2 ${i % 2 === 0 ? "glass-panel/50" : ""}`}>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-white truncate">{line.name}</p>
                          {line.sku && <p className="text-[8px] text-neutral-600">{line.sku}</p>}
                        </div>
                        <span className="text-[11px] font-black text-white text-center">{line.quantity}</span>
                        <span className="text-[10px] font-mono text-neutral-400 text-right">${line.unitPrice.toFixed(2)}</span>
                        <span className="text-[11px] font-black text-white text-right">${(line.quantity * line.unitPrice).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Promotional Items table */}
              {promoLines.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-500 mb-2 flex items-center gap-1.5">
                    <FiTag size={10} /> 🎁 Promotional Items
                  </p>
                  <div className="border border-emerald-900/50 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[1fr_50px_70px_80px] gap-2 px-3 py-1.5 bg-emerald-950/30 text-[8px] font-bold text-emerald-700 uppercase">
                      <span>Item</span><span className="text-center">Free Qty</span><span className="text-right">Unit</span><span className="text-right">Amount</span>
                    </div>
                    {promoLines.map((line, i) => (
                      <div key={`so-promo-${line.id}`} className={`grid grid-cols-[1fr_50px_70px_80px] gap-2 px-3 py-2 ${i % 2 === 0 ? "bg-emerald-950/10" : ""}`}>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-emerald-300 truncate">{line.name}</p>
                          <p className="text-[8px] text-emerald-700 font-bold">PROMOTIONAL -- FREE</p>
                        </div>
                        <span className="text-[11px] font-black text-emerald-400 text-center">{line.quantity}</span>
                        <span className="text-[10px] font-mono text-emerald-700 text-right">$0.00</span>
                        <span className="text-[11px] font-black text-emerald-400 text-right">$0.00</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Order totals */}
              <div className="border-t border-white/10 pt-3 space-y-1.5">
                <div className="flex justify-between px-1">
                  <span className="text-[10px] text-neutral-500">Subtotal (Paid)</span>
                  <span className="text-xs font-bold text-white">${paidLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0).toFixed(2)}</span>
                </div>
                {promoLines.length > 0 && (
                  <div className="flex justify-between px-1">
                    <span className="text-[10px] text-emerald-500">🎁 Promotional Value</span>
                    <span className="text-xs font-bold text-emerald-400">$0.00</span>
                  </div>
                )}
                <div className="flex justify-between px-1">
                  <span className="text-[10px] text-neutral-500">Total Items Shipping</span>
                  <span className="text-xs font-bold text-white">{orderLines.reduce((s, l) => s + l.quantity, 0)} items</span>
                </div>
                <div className="flex justify-between px-1 pt-2 border-t border-white/10">
                  <span className="text-sm font-black text-white">ORDER TOTAL</span>
                  <span className="text-lg font-black text-amber-400">${orderTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Profit breakdown */}
              {financials && (
                <div className="border-t border-amber-500/30 pt-3 space-y-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5 mb-1">
                    <FiTrendingUp size={10} /> Profit Breakdown
                  </p>
                  <div className="bg-neutral-800/50 rounded-lg p-3 space-y-1.5">
                    {[
                      ["Dead Cost (All Items)", `-$${financials.deadCostTotal.toFixed(2)}`, "text-red-400"],
                      ["Dead Profit", `$${financials.deadProfit.toFixed(2)}`, financials.deadProfit >= 0 ? "text-emerald-400" : "text-red-400"],
                      [`Cost + VIG (${vigRate}× paid, 1× free)`, `-$${financials.deadCostPlusVig.toFixed(2)}`, "text-red-400"],
                    ].map(([label, val, color]) => (
                      <div key={label as string} className="flex justify-between">
                        <span className="text-[10px] text-neutral-500">{label}</span>
                        <span className={`text-[10px] font-bold ${color}`}>{val}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-1.5 border-t border-neutral-700">
                      <span className="text-xs font-bold text-amber-300">Profit after VIG</span>
                      <span className={`text-sm font-black ${financials.profitAfterVig >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        ${financials.profitAfterVig.toFixed(2)}
                        <span className={`text-[9px] ml-1 ${financials.marginPct >= 30 ? "text-emerald-500" : financials.marginPct >= 15 ? "text-amber-500" : "text-red-500"}`}>
                          ({financials.marginPct.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                    <div className="flex justify-between pt-1.5 border-t border-neutral-700">
                      <span className="text-xs font-bold text-green-300">Commission ({commissionPct}%)</span>
                      <span className="text-sm font-black text-green-400">${financials.salesCommission.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 glass-panel border-t border-white/10 px-6 py-3 flex gap-2 rounded-b-2xl">
              <button type="button" onClick={() => setShowMockOrder(false)} className="flex-1 py-2 rounded-lg bg-neutral-800 text-neutral-400 text-xs font-bold hover:bg-neutral-700 transition-colors cursor-pointer">
                Edit Order
              </button>
              <button type="button" onClick={() => setShowMockOrder(false)} className="flex-1 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-black hover:from-violet-500 hover:to-purple-500 transition-all cursor-pointer">
                Confirm Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


