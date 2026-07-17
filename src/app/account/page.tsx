"use client"

import { formatPhoneNumber } from "@/lib/formatters"
import { useSearchParams, useRouter } from "next/navigation"
import { Suspense, useState, useEffect } from "react"
import {
  FiFileText, FiDatabase, FiPhone, FiMessageSquare,
  FiShoppingCart, FiAlertTriangle, FiGrid, FiList,
  FiCheckSquare, FiZap, FiBarChart2, FiPackage,
  FiChevronDown, FiChevronUp, FiUsers, FiMapPin,
  FiTool, FiTrendingUp, FiClipboard, FiDollarSign, FiMail,
} from "react-icons/fi"
import { useZoho } from "@/components/ZohoProvider"
import { AccountHistory } from "@/components/AccountHistory"
import { AccountDialer } from "@/components/AccountDialer"
import { InvoiceDetailsModal } from "@/components/InvoiceDetailsModal"
import { DocumentFlipbook } from "@/components/DocumentFlipbook"
import { AccountAnalytics } from "@/components/AccountAnalytics"
import { DealsHistory } from "@/components/DealsHistory"
import { InlinePointOfSale, type InlineCartItem } from "@/components/PointOfSale"
import Link from "next/link"
import { QualityPicker } from "@/components/QualityPicker"
import { ContactsView } from "@/components/ContactsView"
import { AccountProductsPurchased } from "@/components/AccountProductsPurchased"
import { TaskEditor } from "@/components/TaskEditor"
import { AccountEditModal } from "@/components/AccountEditModal"

type ActiveTab = "comms" | "overview" | "quicksale"

function useLocalTime(timeZone: string | undefined | null) {
  const [time, setTime] = useState<string>("...")
  useEffect(() => {
    if (!timeZone) { setTime("N/A"); return }
    const update = () => {
      try {
        setTime(new Date().toLocaleTimeString("en-US", {
          timeZone,
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }))
      } catch {
        setTime("-")
      }
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [timeZone])
  return time
}

// Left Rail

function AccountLeftRail({
  account,
  onTabSwitch,
  onReorder,
}: {
  account: any
  onTabSwitch: (tab: ActiveTab) => void
  onReorder: (cart: InlineCartItem[]) => void
}) {
  const primaryContact = account.contacts?.find((c: any) => c.isPrimary) || account.contacts?.[0]
  const phone = primaryContact?.phone || primaryContact?.mobilePhone || account.booksContact?.phone || ""
  const cleanPhone = phone.replace(/[^0-9+]/g, "")
  const contactName = primaryContact
    ? `${primaryContact.firstName || ""} ${primaryContact.lastName || ""}`.trim()
    : ""
  const email = primaryContact?.email || account.booksContact?.email || ""

  const invoices = account.invoices || []
  const overdue = invoices.filter((i: any) => i.status === "Overdue" || i.status?.toLowerCase() === "overdue")
  const overdueTotal = overdue.reduce((s: number, i: any) => s + (parseFloat(i.amount) || 0), 0)
  const notes = account.booksContact?.notes || account.notes?.[0]?.content || ""

  const handleDial = () => {
    if (cleanPhone) {
      window.dispatchEvent(new CustomEvent("inAppDial", { detail: { phone: cleanPhone } }))
      onTabSwitch("comms")
    }
  }
  const handleSms = () => {
    window.dispatchEvent(new CustomEvent("inAppSms"))
    onTabSwitch("comms")
  }

  const bladeRows = [
    { label: "Sizes",     value: account.bladeSizes },
    { label: "Materials", value: account.materialsCut },
    { label: "Supplier",  value: account.currentSupplier },
    { label: "Avg Cost",  value: account.averageBladeCost },
    { label: "Crews",     value: account.crewCount },
    { label: "Per Order", value: account.bladesPerOrder },
  ]

  return (
    <aside className="w-56 xl:w-60 shrink-0 flex flex-col bg-neutral-900/60 border-r border-neutral-800 overflow-y-auto scrollbar-thin">

      {/* Primary Contact */}
      <div className="p-3 border-b border-neutral-800">
        <div className="text-[9px] text-neutral-500 uppercase tracking-widest font-bold mb-2">Primary Contact</div>
        {contactName
          ? <div className="font-bold text-white text-sm mb-1 truncate">{contactName}</div>
          : <div className="text-neutral-600 text-xs italic mb-1">No contact on file</div>
        }
        {phone && (
          <a
            href={`tel:${cleanPhone}`}
            className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs font-mono font-bold mb-1 truncate transition-colors"
          >
            <FiPhone size={10} /> {formatPhoneNumber(phone)}
          </a>
        )}
        {email && <div className="text-[10px] text-neutral-500 truncate mb-2">{email}</div>}
        <div className="flex gap-1.5 mt-2">
          <button
            onClick={handleDial}
            disabled={!cleanPhone}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FiPhone size={10} /> Call
          </button>
          <button
            onClick={handleSms}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white text-[10px] font-bold rounded-lg transition-colors"
          >
            <FiMessageSquare size={10} /> SMS
          </button>
        </div>
      </div>

      {/* Overdue Badge */}
      {overdueTotal > 0 && (
        <button
          onClick={() => onTabSwitch("overview")}
          className="mx-3 mt-3 flex items-center gap-2 bg-red-900/30 border border-red-500/40 rounded-lg px-3 py-2 text-left hover:bg-red-900/50 transition-colors w-[calc(100%-1.5rem)]"
        >
          <FiAlertTriangle className="text-red-400 shrink-0" size={13} />
          <div>
            <div className="text-[9px] text-red-400 font-bold uppercase tracking-wide">Overdue</div>
            <div className="text-red-300 font-bold text-xs">
              ${overdueTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        </button>
      )}

      {/* Blade Profile */}
      <div className="p-3 border-b border-neutral-800">
        <div className="text-[9px] text-neutral-500 uppercase tracking-widest font-bold mb-2">Blade Profile</div>
        <div className="space-y-1.5">
          {bladeRows.map(({ label, value }) => (
            <div key={label} className="flex justify-between items-baseline gap-2">
              <span className="text-[9px] text-neutral-600 uppercase tracking-wide shrink-0">{label}</span>
              <span className="text-[10px] text-neutral-300 font-semibold text-right truncate">
                {value || "-"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Products */}
      {account.topProducts && account.topProducts.length > 0 && (
        <div className="p-3 border-b border-neutral-800">
          <div className="text-[9px] text-neutral-500 uppercase tracking-widest font-bold mb-2">Top Products</div>
          <div className="space-y-2">
            {account.topProducts.slice(0, 3).map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-300 font-semibold truncate">{p.name}</div>
                  <div className="text-[9px] text-neutral-600">x{p.quantity || "?"}</div>
                </div>
                <button
                  onClick={() => {
                    const item: InlineCartItem = {
                      product: {
                        id: p.id || p.zohoId || String(i),
                        name: p.name,
                        sku: p.sku || "",
                        price: p.price || 0,
                        description: p.description || "",
                      },
                      quantity: 1,
                      customPrice: p.price || 0,
                      customMsrp: p.price || 0,
                    }
                    onReorder([item])
                    onTabSwitch("quicksale")
                  }}
                  className="text-[9px] bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-400 px-1.5 py-0.5 rounded font-bold transition-colors whitespace-nowrap"
                >
                  Reorder
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {notes && (
        <div className="p-3 border-b border-neutral-800">
          <div className="text-[9px] text-neutral-500 uppercase tracking-widest font-bold mb-1.5">Notes</div>
          <p className="text-[10px] text-neutral-400 leading-relaxed line-clamp-4 italic">{notes}</p>
        </div>
      )}

      {/* Quick Sale CTA */}
      <div className="p-3 mt-auto">
        <button
          onClick={() => onTabSwitch("quicksale")}
          className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors"
        >
          <FiShoppingCart size={12} /> Quick Sale
        </button>
      </div>
    </aside>
  )
}

// OverviewPanel — full accordion dashboard for the Overview tab
function AccordionSection({
  title, icon, badge, defaultOpen = true, children,
}: {
  title: string
  icon: React.ReactNode
  badge?: string | number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-neutral-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-neutral-900 hover:bg-neutral-800/80 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-neutral-400">{icon}</span>
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">{title}</span>
          {badge !== undefined && badge !== null && String(badge) !== "0" && (
            <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-bold">{badge}</span>
          )}
        </div>
        <span className="text-neutral-500">
          {open ? <FiChevronUp size={12} /> : <FiChevronDown size={12} />}
        </span>
      </button>
      {open && <div className="bg-neutral-900/40 border-t border-neutral-800">{children}</div>}
    </div>
  )
}

function OverviewPanel({
  account, invoices, deals, quotes, salesOrders, notes,
  onViewInvoice, onViewSalesDoc, onDrillDown, onNoteAdded, accountId, zohoId, tasks, onTaskSave,
}: {
  account: any
  invoices: any[]
  deals: any[]
  quotes: any[]
  salesOrders: any[]
  notes: any[]
  onViewInvoice: (zohoId: string) => void
  onViewSalesDoc: (type: "SalesOrder" | "Quote", doc: any) => void
  onDrillDown: (title: string, invs: any[]) => void
  onNoteAdded: (note: any) => void
  accountId: string
  zohoId: string
  tasks: any[]
  onTaskSave: () => void
}) {
  const [historyMode, setHistoryMode] = useState<"data" | "pdf">("data")
  const primaryContact = account.contacts?.find((c: any) => c.isPrimary) || account.contacts?.[0]
  const phone = primaryContact?.phone || primaryContact?.mobilePhone || account.booksContact?.phone || ""
  const cleanPhone = phone.replace(/[^0-9+]/g, "")
  const totalRevenue = invoices.reduce((s: number, i: any) => s + parseFloat(i.amount || 0), 0)
  const paidInvoices = invoices.filter((i: any) => i.status === "Paid")
  const overdueInvoices = invoices.filter((i: any) => i.status === "Overdue")
  const overdueTotal = overdueInvoices.reduce((s: number, i: any) => s + parseFloat(i.amount || 0), 0)
  const recentInvoices = [...invoices].sort((a, b) => new Date(b.issueDate || 0).getTime() - new Date(a.issueDate || 0).getTime()).slice(0, 5)

  const label = (v: string) => (
    <span className="text-[9px] text-neutral-500 block uppercase tracking-widest font-semibold mb-0.5">{v}</span>
  )
  const val = (v: any, fallback = "-") => (
    <span className="text-xs font-bold text-neutral-200">{v || <span className="text-neutral-600 italic font-normal">{fallback}</span>}</span>
  )

  return (
    <div className="flex flex-col gap-2 p-2">

      {/* KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "LTV", value: `$${totalRevenue >= 1000000 ? `${(totalRevenue/1000000).toFixed(1)}M` : totalRevenue >= 1000 ? `${(totalRevenue/1000).toFixed(1)}k` : totalRevenue.toFixed(0)}`, color: "text-emerald-400" },
          { label: "Invoices", value: invoices.length, color: "text-blue-400" },
          { label: "Overdue", value: overdueTotal > 0 ? `$${overdueTotal.toLocaleString(undefined,{maximumFractionDigits:0})}` : "None", color: overdueTotal > 0 ? "text-red-400" : "text-neutral-500" },
          { label: "Paid", value: paidInvoices.length, color: "text-emerald-400" },
        ].map(k => (
          <div key={k.label} className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
            <div className="text-[9px] text-neutral-500 uppercase tracking-widest font-semibold">{k.label}</div>
            <div className={`text-sm font-extrabold ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Contact & Addresses */}
      <AccordionSection title="Contact & Addresses" icon={<FiMapPin size={12} />} defaultOpen>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3">
          {/* Primary Contact */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3">
            <div className="text-[9px] text-blue-400 uppercase tracking-widest font-bold mb-2">Primary Contact</div>
            {primaryContact ? (
              <>
                <div className="text-xs font-bold text-white mb-1">
                  {`${primaryContact.firstName || ""} ${primaryContact.lastName || ""}`.trim() || "No name"}
                </div>
                {phone && (
                  <a href={`tel:${cleanPhone}`} className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 font-mono font-bold mb-1">
                    <FiPhone size={9} />{phone}
                  </a>
                )}
                {primaryContact.email && (
                  <a href={`mailto:${primaryContact.email}`} className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-neutral-200 truncate">
                    <FiMail size={9} />{primaryContact.email}
                  </a>
                )}
              </>
            ) : (
              <div className="text-[10px] text-neutral-600 italic">No contact on file</div>
            )}
          </div>
          {/* Billing */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3">
            <div className="text-[9px] text-amber-400 uppercase tracking-widest font-bold mb-2">Billing Address</div>
            {(account.billingStreet || account.booksContact?.billing_address?.address) ? (
              <div className="text-[11px] text-neutral-300 leading-relaxed">
                <div>{account.billingStreet || account.booksContact?.billing_address?.address}</div>
                <div>{account.billingCity || account.booksContact?.billing_address?.city}, {account.billingState || account.booksContact?.billing_address?.state} {account.billingZip || account.booksContact?.billing_address?.zip}</div>
                <div className="text-neutral-600 text-[9px] uppercase font-bold mt-0.5">{account.billingCountry || "U.S.A"}</div>
              </div>
            ) : <div className="text-[10px] text-neutral-600 italic">Not on file</div>}
          </div>
          {/* Shipping */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3">
            <div className="text-[9px] text-emerald-400 uppercase tracking-widest font-bold mb-2">Shipping Address</div>
            {(account.shippingStreet || account.booksContact?.shipping_address?.address) ? (
              <div className="text-[11px] text-neutral-300 leading-relaxed">
                <div>{account.shippingStreet || account.booksContact?.shipping_address?.address}</div>
                <div>{account.shippingCity || account.booksContact?.shipping_address?.city}, {account.shippingState || account.booksContact?.shipping_address?.state} {account.shippingZip || account.booksContact?.shipping_address?.zip}</div>
                <div className="text-neutral-600 text-[9px] uppercase font-bold mt-0.5">{account.shippingCountry || "U.S.A"}</div>
              </div>
            ) : <div className="text-[10px] text-neutral-600 italic">Not on file</div>}
          </div>
        </div>
      </AccordionSection>

      {/* Business Profile */}
      <AccordionSection title="Business Profile" icon={<FiTool size={12} />} defaultOpen>
        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { l: "Blade Sizes",      v: account.bladeSizes },
            { l: "Materials Cut",    v: account.materialsCut },
            { l: "Current Supplier", v: account.currentSupplier },
            { l: "Avg Blade Cost",   v: account.averageBladeCost },
            { l: "Crew Count",       v: account.crewCount },
            { l: "Blades/Order",     v: account.bladesPerOrder },
            { l: "Improvement",      v: account.improvementPriority },
            { l: "Industry",         v: account.industry },
            { l: "Tags",             v: account.tags },
            { l: "Website",          v: account.booksContact?.website },
          ].map(({ l, v }) => (
            <div key={l}>{label(l)}{val(v)}</div>
          ))}
        </div>
        {account.booksContact?.notes && (
          <div className="px-3 pb-3">
            <div className="bg-neutral-950/40 border border-neutral-800 rounded-lg p-2.5">
              {label("Notes")}
              <p className="text-[11px] text-neutral-300 leading-relaxed italic whitespace-pre-line">{account.booksContact.notes}</p>
            </div>
          </div>
        )}
      </AccordionSection>

      {/* All Contacts */}
      <AccordionSection title="All Contacts" icon={<FiUsers size={12} />} badge={(account.contacts || []).length} defaultOpen={false}>
        <div className="p-3 max-h-[500px] overflow-y-auto">
          <ContactsView
            contacts={account.contacts || []}
            notes={notes}
            accountId={accountId}
            onNoteAdded={onNoteAdded}
          />
        </div>
      </AccordionSection>

      {/* Analytics */}
      <AccordionSection title="Analytics" icon={<FiTrendingUp size={12} />} defaultOpen>
        <div className="p-3">
          <AccountAnalytics
            invoices={invoices}
            deals={deals}
            quotes={quotes}
            salesOrders={salesOrders}
            onDrillDown={onDrillDown}
          />
        </div>
      </AccordionSection>

      {/* Recent Invoices */}
      <AccordionSection title="Recent Invoices" icon={<FiDollarSign size={12} />} badge={invoices.length} defaultOpen={false}>
        <div className="divide-y divide-neutral-800">
          {recentInvoices.length === 0 ? (
            <div className="p-4 text-center text-neutral-600 text-xs italic">No invoices found</div>
          ) : recentInvoices.map((inv: any, idx: number) => (
            <button
              key={idx}
              onClick={() => onViewInvoice(inv.zohoId)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-neutral-800/60 transition-colors text-left"
            >
              <div>
                <div className="text-xs font-bold text-white">
                  {(inv.items as any)?.invoiceNumber || (inv.items as any)?.invoice_number || inv.zohoId || "INV"}
                </div>
                <div className="text-[10px] text-neutral-500">
                  {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString(undefined, { timeZone: "UTC" }) : "-"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-blue-400">${parseFloat(inv.amount || 0).toLocaleString()}</div>
                <div className={`text-[9px] font-bold uppercase ${
                  inv.status === "Paid" ? "text-emerald-400" : inv.status === "Overdue" ? "text-red-400" : "text-neutral-400"
                }`}>{inv.status}</div>
              </div>
            </button>
          ))}
        </div>
      </AccordionSection>

      {/* Deals */}
      <AccordionSection title="Deals" icon={<FiClipboard size={12} />} badge={deals.length} defaultOpen={false}>
        <div className="p-3">
          <DealsHistory deals={deals} />
        </div>
      </AccordionSection>

      {/* Transaction History */}
      <AccordionSection title="Transaction History" icon={<FiList size={12} />} badge={invoices.length} defaultOpen={false}>
        <div className="p-2">
          <div className="flex justify-end mb-2">
            <div className="flex bg-neutral-950 p-0.5 rounded-lg border border-neutral-800">
              <button
                onClick={() => setHistoryMode("data")}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-1 ${
                  historyMode === "data" ? "bg-emerald-500 text-white" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <FiBarChart2 size={10} /> Data
              </button>
              <button
                onClick={() => setHistoryMode("pdf")}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-1 ${
                  historyMode === "pdf" ? "bg-emerald-500 text-white" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <FiFileText size={10} /> Flipbook
              </button>
            </div>
          </div>
          {historyMode === "data" ? (
            <AccountHistory
              accountId={accountId}
              invoices={invoices}
              salesOrders={salesOrders}
              quotes={quotes}
              notes={notes}
              onViewInvoice={onViewInvoice}
              onViewSalesDoc={onViewSalesDoc}
            />
          ) : (
            <DocumentFlipbook
              invoices={invoices}
              quotes={quotes}
              salesOrders={salesOrders}
              onViewInvoice={onViewInvoice}
              onViewSalesDoc={onViewSalesDoc}
            />
          )}
        </div>
      </AccordionSection>

      {/* Products Purchased */}
      <AccordionSection title="Products Purchased" icon={<FiPackage size={12} />} defaultOpen={false}>
        <div className="p-3">
          <AccountProductsPurchased accountId={zohoId} />
        </div>
      </AccordionSection>

      {/* Tasks */}
      <AccordionSection title="Tasks" icon={<FiCheckSquare size={12} />} badge={tasks.length} defaultOpen={false}>
        <div className="p-3">
          {tasks.length === 0 ? (
            <div className="text-center py-6 text-neutral-600 text-xs italic">No tasks for this account</div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task: any) => (
                <TaskEditor key={task.id} task={task} onSave={onTaskSave} />
              ))}
            </div>
          )}
        </div>
      </AccordionSection>

    </div>
  )
}

// AccountHubContent

function AccountHubContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const id = searchParams.get("id") || ""
  const { isInitialized } = useZoho()
  const [account, setAccount] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview")
  const [drillTitle, setDrillTitle] = useState("")
  const [drillInvoices, setDrillInvoices] = useState<any[] | null>(null)
  const [viewingInvoice, setViewingInvoice] = useState<any | null>(null)
  const [viewingSalesDoc, setViewingSalesDoc] = useState<{ type: "SalesOrder" | "Quote"; doc: any } | null>(null)
  const [historyViewMode, setHistoryViewMode] = useState<"data" | "pdf">("data")
  const [isEditingAccount, setIsEditingAccount] = useState(false)
  const [reorderCart, setReorderCart] = useState<InlineCartItem[]>([])
  const [leftRailOpen, setLeftRailOpen] = useState(true)

  const localTime = useLocalTime(account?.timeZone)

  const fetchAccountData = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch(`/api/get-account-details?id=${encodeURIComponent(id)}`)
      const data = await res.json()
      if (data.success) setAccount(data.account)
      else setError(data.error || data.message || "Failed to load account")
    } catch (e: any) {
      if (showLoading) setError(e.message || "Failed to load account")
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    const handleInAppComm = () => { setActiveTab("comms") }
    window.addEventListener("inAppDial", handleInAppComm)
    window.addEventListener("inAppSms", handleInAppComm)
    return () => {
      window.removeEventListener("inAppDial", handleInAppComm)
      window.removeEventListener("inAppSms", handleInAppComm)
    }
  }, [])

  useEffect(() => {
    if (!isInitialized) return
    const cleanId = id?.trim()
    if (!cleanId || cleanId.startsWith("{") || cleanId === "undefined" || cleanId === "null") {
      router.push("/"); return
    }
    fetchAccountData()
  }, [isInitialized, id])

  if (loading || !isInitialized) return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-neutral-950 text-white">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-neutral-400 text-sm">Loading account...</p>
      </div>
    </div>
  )

  if (!account) return (
    <div className="p-8 text-neutral-300">
      {error
        ? (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
            <p className="text-red-400 font-semibold">Error loading account</p>
            <p className="text-red-400/80 text-sm mt-1">{error}</p>
            <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300 mt-3 inline-block">Back to Dashboard</Link>
          </div>
        )
        : <p>Account not found.</p>
      }
    </div>
  )

  const invoices = account.invoices || []
  const totalRevenue = invoices.reduce((s: number, i: any) => s + parseFloat(i.amount || 0), 0)
  const daysSinceLastPurchase = account.lastPurchaseAt
    ? Math.floor((Date.now() - new Date(account.lastPurchaseAt).getTime()) / 86400000)
    : null

  const tabs: { id: ActiveTab; Icon: React.ElementType; label: string }[] = [
    { id: "overview",  Icon: FiBarChart2,   label: "Overview" },
    { id: "comms",     Icon: FiPhone,       label: "Comm Center" },
    { id: "quicksale", Icon: FiShoppingCart, label: "Quick Sale" },
  ]

  const isFluidTab = activeTab === "comms" || activeTab === "quicksale"

  return (
    <div className="flex flex-col bg-neutral-950 text-white font-sans" style={{ height: "100%" }}>

      {isEditingAccount && (
        <AccountEditModal
          account={account}
          onClose={() => setIsEditingAccount(false)}
          onSaved={() => { setIsEditingAccount(false); fetchAccountData(false) }}
        />
      )}

      {/* Header */}
      <header className="flex-none bg-neutral-900 border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3">

          {/* Left: back + account name */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.back()}
              className="text-neutral-400 hover:text-white text-sm shrink-0 cursor-pointer"
            >
              &larr; Back
            </button>
            <div className="h-5 w-px bg-neutral-700 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold truncate">{account.name}</h1>
                <button
                  onClick={() => setIsEditingAccount(true)}
                  className="text-[9px] bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 px-1.5 py-0.5 rounded transition-colors uppercase tracking-wider font-bold shrink-0"
                >
                  Edit
                </button>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <QualityPicker
                  zohoId={account.zohoId}
                  accountId={account.id}
                  currentQuality={account.quality || "NEVER_STATUSED"}
                  onUpdated={(q) => setAccount((a: any) => ({ ...a, quality: q }))}
                />
                {account.industry && (
                  <span className="text-[10px] text-neutral-500 hidden sm:inline">{account.industry}</span>
                )}
              </div>
            </div>
          </div>

          {/* Right: KPIs + actions */}
          <div className="flex items-center gap-2">
            <div className="hidden md:flex flex-col items-end pr-1">
              <span className="text-[9px] text-neutral-500 uppercase tracking-wide">Local Time</span>
              <span className="text-xs font-bold text-emerald-300">{localTime}</span>
            </div>
            <div className="hidden lg:flex items-center gap-4 text-right px-3 border-x border-neutral-800">
              <div>
                <div className="text-[9px] text-neutral-500 uppercase tracking-wide">LTV</div>
                <div className="text-xs font-bold text-emerald-400">
                  ${(totalRevenue / 1000).toFixed(1)}k
                </div>
              </div>
              <div>
                <div className="text-[9px] text-neutral-500 uppercase tracking-wide">Days Since</div>
                <div className={`text-xs font-bold ${daysSinceLastPurchase && daysSinceLastPurchase > 365 ? "text-red-400" : "text-purple-400"}`}>
                  {daysSinceLastPurchase ?? "-"}
                </div>
              </div>
            </div>
            <button
              onClick={() => router.push(`/tasks/new?accountId=${account.zohoId}&accountName=${encodeURIComponent(account.name)}`)}
              className="shrink-0 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white px-3 py-1.5 text-xs rounded-full font-bold transition-colors border border-neutral-700"
            >
              + Task
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch("/api/create-books-contact", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ accountId: account.zohoId }),
                  })
                  const data = await res.json()
                  alert(data.success ? (data.message || "Added to Zoho Books!") : "Error: " + data.error)
                } catch (e: any) {
                  alert("Error: " + e.message)
                }
              }}
              className="hidden sm:flex shrink-0 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white px-3 py-1.5 text-xs rounded-full font-bold transition-colors border border-neutral-700"
            >
              + Books
            </button>
            {/* Mobile rail toggle */}
            <button
              onClick={() => setLeftRailOpen(!leftRailOpen)}
              className="lg:hidden shrink-0 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-2 py-1.5 text-xs rounded-lg font-bold transition-colors border border-neutral-700"
              title="Toggle account intel"
            >
              <FiGrid size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="flex-none bg-neutral-900 border-b border-neutral-800 overflow-x-auto scrollbar-none">
        <div className="flex px-4 min-w-max gap-0.5">
          {tabs.map(({ id: tabId, Icon, label }) => (
            <button
              key={tabId}
              onClick={() => setActiveTab(tabId)}
              className={`py-3 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all whitespace-nowrap ${
                activeTab === tabId
                  ? "text-emerald-400 border-emerald-500 bg-neutral-800/40"
                  : "text-neutral-500 border-transparent hover:text-neutral-300 hover:bg-neutral-800/20"
              }`}
            >
              <Icon size={12} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2-Column Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* Left Rail — always visible on desktop, toggled on mobile */}
        {leftRailOpen && (
          <>
            {/* Desktop */}
            <div className="hidden lg:flex flex-col shrink-0">
              <AccountLeftRail
                account={account}
                onTabSwitch={(tab) => setActiveTab(tab)}
                onReorder={(cart) => { setReorderCart(cart); setActiveTab("quicksale") }}
              />
            </div>
            {/* Mobile */}
            <div className="flex lg:hidden flex-col shrink-0">
              <AccountLeftRail
                account={account}
                onTabSwitch={(tab) => { setActiveTab(tab); setLeftRailOpen(false) }}
                onReorder={(cart) => { setReorderCart(cart); setActiveTab("quicksale"); setLeftRailOpen(false) }}
              />
            </div>
          </>
        )}

        {/* Main content area */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-y-auto scrollbar-thin">

          {/* COMM CENTER */}
          {activeTab === "comms" && (
            <div className="flex-1 min-h-0 flex flex-col">
              <AccountDialer
                accountId={id}
                account={account}
                contacts={account.contacts || []}
              />
            </div>
          )}

          {/* QUICK SALE */}
          {activeTab === "quicksale" && (
            <InlinePointOfSale
              accountId={id}
              account={account}
              initialCart={reorderCart}
              onSuccess={() => { setReorderCart([]); fetchAccountData(false) }}
            />
          )}

          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <OverviewPanel
              account={account}
              invoices={account.invoices || []}
              deals={account.deals || []}
              quotes={account.quotes || []}
              salesOrders={account.salesOrders || []}
              notes={account.notes || []}
              onViewInvoice={(zohoId) => {
                const inv = account.invoices?.find((i: any) => i.zohoId === zohoId)
                setViewingInvoice(inv || { zohoId, id: zohoId })
              }}
              onViewSalesDoc={(type, doc) => setViewingSalesDoc({ type, doc })}
              onDrillDown={(title, invs) => { setDrillTitle(title); setDrillInvoices(invs) }}
              onNoteAdded={(newNote: any) =>
                setAccount((prev: any) => prev ? { ...prev, notes: [newNote, ...(prev.notes || [])] } : prev)
              }
              accountId={account.id}
              zohoId={account.zohoId}
              tasks={account.tasks || []}
              onTaskSave={() => fetchAccountData(false)}
            />
          )}

        </div>
      </div>

      {/* Drill-down modal */}
      {drillInvoices && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setDrillInvoices(null)}
        >
          <div
            className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
              <h3 className="font-bold text-white flex items-center gap-2">
                {drillTitle}
                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                  {drillInvoices.length}
                </span>
              </h3>
              <button onClick={() => setDrillInvoices(null)} className="text-neutral-500 hover:text-white text-xl">
                &times;
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-2 scrollbar-thin">
              {drillInvoices.length === 0
                ? <div className="text-center py-8 text-neutral-500 italic">No invoices match this statistic.</div>
                : drillInvoices.map((inv, idx) => {
                    const invoiceNum = (inv.items && typeof inv.items === "object" && "invoiceNumber" in inv.items)
                      ? (inv.items as any).invoiceNumber
                      : inv.zohoId || "INV"
                    return (
                      <div
                        key={idx}
                        onClick={() => { setViewingInvoice(inv); setDrillInvoices(null) }}
                        className="bg-neutral-800/50 p-3 rounded border border-neutral-800 flex justify-between items-center cursor-pointer hover:bg-neutral-800 transition-colors"
                      >
                        <div>
                          <div className="text-sm font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <FiFileText className="text-amber-500 shrink-0" size={12} />
                            #{invoiceNum}
                          </div>
                          <div className="text-xs text-neutral-400 mt-1 border-l-2 border-neutral-700 pl-2">
                            {inv.issueDate
                              ? new Date(inv.issueDate).toLocaleDateString(undefined, { timeZone: "UTC" })
                              : "-"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-blue-400">
                            ${parseFloat(inv.amount || 0).toLocaleString()}
                          </div>
                          <div className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded inline-block mt-1 ${
                            inv.status === "Paid" ? "bg-emerald-900/40 text-emerald-400"
                            : inv.status === "Overdue" ? "bg-red-900/40 text-red-400"
                            : "bg-neutral-800 text-neutral-300"
                          }`}>
                            {inv.status || "-"}
                          </div>
                        </div>
                      </div>
                    )
                  })
              }
            </div>
          </div>
        </div>
      )}

      {viewingInvoice && (
        <InvoiceDetailsModal invoice={viewingInvoice} onClose={() => setViewingInvoice(null)} />
      )}
      {viewingSalesDoc && (
        <InvoiceDetailsModal
          invoice={viewingSalesDoc.doc}
          type={viewingSalesDoc.type}
          onClose={() => setViewingSalesDoc(null)}
        />
      )}

    </div>
  )
}

export default function AccountHub() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[100dvh] bg-neutral-950 text-white">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AccountHubContent />
    </Suspense>
  )
}
