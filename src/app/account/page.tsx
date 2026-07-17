"use client"

import { formatPhoneNumber } from "@/lib/formatters"
import { useSearchParams, useRouter } from "next/navigation"
import { Suspense, useState, useEffect } from "react"
import { FiFileText, FiDatabase, FiPhone, FiMessageSquare, FiShoppingCart, FiAlertTriangle } from "react-icons/fi"
import { useZoho } from "@/components/ZohoProvider"
import { AccountHistory } from "@/components/AccountHistory"
import { SalesAssistant } from "@/components/SalesAssistant"
import { CommunicationCenter } from "@/components/CommunicationCenter"
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

type ActiveTab = "comms" | "overview" | "history" | "purchased" | "tasks" | "quicksale"

function useLocalTime(timeZone: string | undefined | null) {
  const [time, setTime] = useState<string>("...")
  useEffect(() => {
    if (!timeZone) { setTime("N/A"); return }
    const update = () => {
      try { setTime(new Date().toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" })) }
      catch { setTime("â€”") }
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [timeZone])
  return time
}

// â”€â”€ Left Rail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  const contactName = primaryContact ? `${primaryContact.firstName || ""} ${primaryContact.lastName || ""}`.trim() : ""
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

  return (
    <aside className="w-60 xl:w-64 shrink-0 flex flex-col bg-neutral-900/60 border-r border-neutral-800 overflow-y-auto scrollbar-thin">
      {/* Contact Card */}
      <div className="p-4 border-b border-neutral-800">
        <div className="text-[9px] text-neutral-500 uppercase tracking-widest font-bold mb-2">Primary Contact</div>
        {contactName
          ? <div className="font-bold text-white text-sm mb-1 truncate">{contactName}</div>
          : <div className="text-neutral-600 text-xs italic mb-1">No contact on file</div>
        }
        {phone && (
          <a href={`tel:${cleanPhone}`} className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs font-mono font-bold mb-1 truncate transition-colors">
            ðŸ“ž {formatPhoneNumber(phone)}
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
          onClick={() => onTabSwitch("history")}
          className="mx-4 mt-4 flex items-center gap-2 bg-red-900/30 border border-red-500/40 rounded-lg px-3 py-2 text-left hover:bg-red-900/50 transition-colors"
          style={{ width: "calc(100% - 2rem)" }}
        >
          <FiAlertTriangle className="text-red-400 shrink-0" size={13} />
          <div>
            <div className="text-[9px] text-red-400 font-bold uppercase tracking-wide">Overdue Balance</div>
            <div className="text-red-300 font-bold text-xs">${overdueTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
        </button>
      )}

      {/* Blade Profile */}
      <div className="p-4 border-b border-neutral-800">
        <div className="text-[9px] text-neutral-500 uppercase tracking-widest font-bold mb-2">Blade Profile</div>
        <div className="space-y-1.5">
          {[
            { label: "Sizes", value: account.bladeSizes },
            { label: "Materials", value: account.materialsCut },
            { label: "Supplier", value: account.currentSupplier },
            { label: "Avg Cost", value: account.averageBladeCost },
            { label: "Crews", value: account.crewCount },
            { label: "Per Order", value: account.bladesPerOrder },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-baseline gap-2">
              <span className="text-[9px] text-neutral-600 uppercase tracking-wide shrink-0">{label}</span>
              <span className="text-[10px] text-neutral-300 font-semibold text-right truncate">{value || "â€”"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Products + Reorder */}
      {account.topProducts && account.topProducts.length > 0 && (
        <div className="p-4 border-b border-neutral-800">
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
                      product: { id: p.id || p.zohoId || String(i), name: p.name, sku: p.sku || "", price: p.price || 0, description: p.description || "" },
                      quantity: 1, customPrice: p.price || 0, customMsrp: p.price || 0,
                    }
                    onReorder([item])
                    onTabSwitch("quicksale")
                  }}
                  className="text-[9px] bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-400 px-1.5 py-0.5 rounded font-bold transition-colors whitespace-nowrap"
                >Reorder</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes excerpt */}
      {notes && (
        <div className="p-4 border-b border-neutral-800">
          <div className="text-[9px] text-neutral-500 uppercase tracking-widest font-bold mb-1.5">Notes</div>
          <p className="text-[10px] text-neutral-400 leading-relaxed line-clamp-4 italic">{notes}</p>
        </div>
      )}

      {/* Quick Sale CTA */}
      <div className="p-4 mt-auto">
        <button
          onClick={() => onTabSwitch("quicksale")}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-blue-500/10"
        >
          <FiShoppingCart size={12} /> Quick Sale
        </button>
      </div>
    </aside>
  )
}

// â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AccountHubContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const id = searchParams.get("id") || ""
  const { isInitialized } = useZoho()
  const [account, setAccount] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>("comms")
  const [drillTitle, setDrillTitle] = useState("")
  const [drillInvoices, setDrillInvoices] = useState<any[] | null>(null)
  const [viewingInvoice, setViewingInvoice] = useState<any | null>(null)
  const [viewingSalesDoc, setViewingSalesDoc] = useState<{ type: "SalesOrder" | "Quote"; doc: any } | null>(null)
  const [historyViewMode, setHistoryViewMode] = useState<"data" | "pdf">("data")
  const [aiViewMode, setAiViewMode] = useState<"assistant" | "comms">("comms")
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
    const handleInAppComm = () => { setActiveTab("comms"); setAiViewMode("comms") }
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
        ? <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
            <p className="text-red-400 font-semibold">Error loading account</p>
            <p className="text-red-400/80 text-sm mt-1">{error}</p>
            <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300 mt-3 inline-block">Back to Dashboard</Link>
          </div>
        : <p>Account not found.</p>
      }
    </div>
  )

  const invoices = account.invoices || []
  const totalRevenue = invoices.reduce((s: number, i: any) => s + parseFloat(i.amount || 0), 0)
  const daysSinceLastPurchase = account.lastPurchaseAt
    ? Math.floor((Date.now() - new Date(account.lastPurchaseAt).getTime()) / 86400000)
    : null

  const tabs = [
    { id: "comms"     as ActiveTab, icon: "ðŸ“ž", label: "Comm Center" },
    { id: "quicksale" as ActiveTab, icon: "ðŸ›’", label: "Quick Sale" },
    { id: "overview"  as ActiveTab, icon: "ðŸ“Š", label: "Overview" },
    { id: "history"   as ActiveTab, icon: "ðŸ§¾", label: "Transactions" },
    { id: "purchased" as ActiveTab, icon: "ðŸ’Ž", label: "Products" },
    { id: "tasks"     as ActiveTab, icon: "âœ“",  label: "Tasks" },
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
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => router.back()} className="text-neutral-400 hover:text-white text-sm shrink-0 cursor-pointer">â† Back</button>
            <div className="h-5 w-px bg-neutral-700 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold truncate">{account.name}</h1>
                <button onClick={() => setIsEditingAccount(true)} className="text-[9px] bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 px-1.5 py-0.5 rounded transition-colors uppercase tracking-wider font-bold shrink-0">Edit</button>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <QualityPicker
                  zohoId={account.zohoId}
                  accountId={account.id}
                  currentQuality={account.quality || "NEVER_STATUSED"}
                  onUpdated={(q) => setAccount((a: any) => ({ ...a, quality: q }))}
                />
                {account.industry && <span className="text-[10px] text-neutral-500 hidden sm:inline">{account.industry}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex flex-col items-end pr-1">
              <span className="text-[9px] text-neutral-500 uppercase tracking-wide">Local Time</span>
              <span className="text-xs font-bold text-emerald-300">{localTime}</span>
            </div>
            <div className="hidden lg:flex items-center gap-4 text-right px-3 border-x border-neutral-800">
              <div>
                <div className="text-[9px] text-neutral-500 uppercase tracking-wide">LTV</div>
                <div className="text-xs font-bold text-emerald-400">${(totalRevenue / 1000).toFixed(1)}k</div>
              </div>
              <div>
                <div className="text-[9px] text-neutral-500 uppercase tracking-wide">Days Since</div>
                <div className={`text-xs font-bold ${daysSinceLastPurchase && daysSinceLastPurchase > 365 ? "text-red-400" : "text-purple-400"}`}>
                  {daysSinceLastPurchase ?? "â€”"}
                </div>
              </div>
            </div>
            <button
              onClick={() => router.push(`/tasks/new?accountId=${account.zohoId}&accountName=${encodeURIComponent(account.name)}`)}
              className="shrink-0 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white px-3 py-1.5 text-xs rounded-full font-bold transition-colors border border-neutral-700"
            >+ Task</button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch("/api/create-books-contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: account.zohoId }) })
                  const data = await res.json()
                  alert(data.success ? (data.message || "Added to Zoho Books!") : "Error: " + data.error)
                } catch (e: any) { alert("Error: " + e.message) }
              }}
              className="hidden sm:flex shrink-0 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white px-3 py-1.5 text-xs rounded-full font-bold transition-colors border border-neutral-700"
            >+ Books</button>
            <button
              onClick={() => setLeftRailOpen(!leftRailOpen)}
              className="lg:hidden shrink-0 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-2 py-1.5 text-xs rounded-lg font-bold transition-colors border border-neutral-700"
            >&#9776;</button>
          </div>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="flex-none bg-neutral-900 border-b border-neutral-800 overflow-x-auto scrollbar-none">
        <div className="flex px-4 min-w-max gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "text-emerald-400 border-emerald-500 bg-neutral-800/40"
                  : "text-neutral-500 border-transparent hover:text-neutral-300 hover:bg-neutral-800/20"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2-Column Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* Left Rail */}
        {leftRailOpen && (
          <div className="hidden lg:flex flex-col shrink-0">
            <AccountLeftRail
              account={account}
              onTabSwitch={(tab) => setActiveTab(tab)}
              onReorder={(cart) => { setReorderCart(cart); setActiveTab("quicksale") }}
            />
          </div>
        )}
        {/* Mobile left rail overlay */}
        {leftRailOpen && (
          <div className="flex lg:hidden flex-col shrink-0">
            <AccountLeftRail
              account={account}
              onTabSwitch={(tab) => { setActiveTab(tab); setLeftRailOpen(false) }}
              onReorder={(cart) => { setReorderCart(cart); setActiveTab("quicksale"); setLeftRailOpen(false) }}
            />
          </div>
        )}

        {/* Main Content */}
        <div className={`flex-1 min-w-0 flex flex-col min-h-0 ${isFluidTab ? "" : "overflow-y-auto scrollbar-thin"}`}>

          {/* COMM CENTER */}
          {activeTab === "comms" && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-none flex items-center justify-end px-4 py-2 bg-neutral-900/60 border-b border-neutral-800">
                <div className="flex bg-neutral-950 p-0.5 rounded-lg border border-neutral-800">
                  <button
                    onClick={() => setAiViewMode("comms")}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${aiViewMode === "comms" ? "bg-emerald-500 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
                  >Comm Center ðŸ“ž</button>
                  <button
                    onClick={() => setAiViewMode("assistant")}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${aiViewMode === "assistant" ? "bg-emerald-500 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
                  >AI Copilot âš¡</button>
                </div>
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                {aiViewMode === "assistant"
                  ? <SalesAssistant accountId={id} accountData={{ ...account, invoices, daysSinceLastPurchase, totalRevenue }} />
                  : <CommunicationCenter accountId={id} account={{ ...account, invoices }} contacts={account.contacts} />
                }
              </div>
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
            <div className="p-4 sm:p-6 space-y-8 max-w-5xl mx-auto w-full">
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-5 shadow-xl space-y-5">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3 gap-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider shrink-0">
                    <FiDatabase className="text-blue-500" /> Account Profile
                  </h3>
                  {(account.booksContact?.phone || account.contacts?.[0]?.phone) && (
                    <a href={"tel:" + (account.booksContact?.phone || account.contacts?.[0]?.phone).replace(/[^0-9+]/g, "")} className="text-xs text-blue-400 hover:text-blue-300 font-mono font-bold flex items-center gap-1.5 truncate min-w-0">
                      ðŸ“ž {formatPhoneNumber(account.booksContact?.phone || account.contacts?.[0]?.phone)}
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Billing */}
                  <div className="address-card">
                    <h4 className="text-blue-400">Billing Address</h4>
                    <div className="text-xs text-neutral-300 leading-relaxed">
                      {(account.billingStreet || account.booksContact?.billing_address?.address) ? (
                        <>
                          <p>{account.billingStreet || account.booksContact?.billing_address?.address}</p>
                          <p>{account.billingCity || account.booksContact?.billing_address?.city || ""}, {account.billingState || account.booksContact?.billing_address?.state || ""} {account.billingZip || account.booksContact?.billing_address?.zip || ""}</p>
                          <p className="text-neutral-500 text-[10px] uppercase font-bold mt-1 tracking-wider">{account.billingCountry || "U.S.A"}</p>
                        </>
                      ) : <p className="text-neutral-500 italic text-[11px]">No billing address configured</p>}
                    </div>
                  </div>
                  {/* Shipping */}
                  <div className="address-card">
                    <h4 className="text-amber-400">Shipping Address</h4>
                    <div className="text-xs text-neutral-300 leading-relaxed">
                      {(account.shippingStreet || account.booksContact?.shipping_address?.address) ? (
                        <>
                          <p>{account.shippingStreet || account.booksContact?.shipping_address?.address}</p>
                          <p>{account.shippingCity || account.booksContact?.shipping_address?.city || ""}, {account.shippingState || account.booksContact?.shipping_address?.state || ""} {account.shippingZip || account.booksContact?.shipping_address?.zip || ""}</p>
                          <p className="text-neutral-500 text-[10px] uppercase font-bold mt-1 tracking-wider">{account.shippingCountry || "U.S.A"}</p>
                        </>
                      ) : <p className="text-neutral-500 italic text-[11px]">No shipping address configured</p>}
                    </div>
                  </div>
                  {/* Company */}
                  <div className="address-card">
                    <h4 className="text-emerald-400">Company Info</h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold">Phone</span>
                        {(account.booksContact?.phone || account.contacts?.[0]?.phone)
                          ? <a href={"tel:" + (account.booksContact?.phone || account.contacts[0].phone).replace(/[^0-9+]/g, "")} className="text-blue-400 hover:underline font-bold font-mono truncate block">{formatPhoneNumber(account.booksContact?.phone || account.contacts[0].phone)}</a>
                          : <span className="text-neutral-200 font-bold block">â€”</span>}
                      </div>
                      <div>
                        <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold">Website</span>
                        {account.booksContact?.website
                          ? <a href={account.booksContact.website.startsWith("http") ? account.booksContact.website : `https://${account.booksContact.website}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline truncate block font-bold font-mono">{account.booksContact.website}</a>
                          : <span className="text-neutral-400 font-bold">â€”</span>}
                      </div>
                      <div>
                        <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold">Industry</span>
                        <span className="text-neutral-200 font-bold truncate block">{account.industry || "â€”"}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold">Tags</span>
                        <span className="text-neutral-200 font-bold truncate block">{account.tags || "General"}</span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Business Profile */}
                <div className="bg-neutral-950/30 p-4 border border-neutral-800/80 rounded-xl">
                  <h4 className="text-[10px] font-bold text-orange-400 uppercase tracking-wider mb-3">Business Profile</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
                    {[
                      { label: "Blade Sizes", val: account.bladeSizes },
                      { label: "Materials Cut", val: account.materialsCut },
                      { label: "Current Supplier", val: account.currentSupplier },
                      { label: "Avg Blade Cost", val: account.averageBladeCost },
                      { label: "Crew Count", val: account.crewCount },
                      { label: "Blades/Order", val: account.bladesPerOrder },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold">{label}</span>
                        <span className="text-neutral-200 font-bold">{val || <span className="text-neutral-600 italic font-normal">Not recorded</span>}</span>
                      </div>
                    ))}
                    <div className="col-span-2">
                      <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold">Improvement Priority</span>
                      <span className="text-neutral-200 font-bold">{account.improvementPriority || <span className="text-neutral-600 italic font-normal">Not recorded</span>}</span>
                    </div>
                  </div>
                </div>
                {account.booksContact?.notes && (
                  <div className="bg-neutral-950/20 p-4 border border-neutral-800/80 rounded-xl">
                    <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold mb-1">Account Notes</span>
                    <p className="text-xs text-neutral-300 leading-relaxed italic whitespace-pre-line">{account.booksContact.notes}</p>
                  </div>
                )}
              </div>
              <AccountAnalytics
                invoices={account.invoices}
                deals={account.deals}
                quotes={account.quotes}
                salesOrders={account.salesOrders}
                onDrillDown={(title, invs) => { setDrillTitle(title); setDrillInvoices(invs) }}
              />
              <div className="border-t border-neutral-800/50 pt-8">
                <ContactsView
                  contacts={account.contacts || []}
                  notes={account.notes || []}
                  accountId={account.id}
                  onNoteAdded={(newNote: any) => setAccount((prev: any) => prev ? { ...prev, notes: [newNote, ...(prev.notes || [])] } : prev)}
                />
              </div>
              <div className="border-t border-neutral-800/50 pt-8">
                <DealsHistory deals={account.deals} />
              </div>
            </div>
          )}

          {/* TRANSACTIONS */}
          {activeTab === "history" && (
            <div className="p-4 sm:p-6 max-w-5xl mx-auto w-full">
              <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 sm:p-6 shadow-xl flex flex-col min-h-[500px] space-y-4">
                <div className="flex justify-end">
                  <div className="flex bg-neutral-950 p-0.5 rounded-lg border border-neutral-800">
                    <button onClick={() => setHistoryViewMode("data")} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${historyViewMode === "data" ? "bg-emerald-500 text-white" : "text-neutral-400 hover:text-neutral-200"}`}>Data ðŸ“Š</button>
                    <button onClick={() => setHistoryViewMode("pdf")} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${historyViewMode === "pdf" ? "bg-emerald-500 text-white" : "text-neutral-400 hover:text-neutral-200"}`}>Flipbook ðŸ“‚</button>
                  </div>
                </div>
                {historyViewMode === "data"
                  ? <AccountHistory
                      accountId={id}
                      invoices={account.invoices || []}
                      salesOrders={account.salesOrders || []}
                      quotes={account.quotes || []}
                      notes={account.notes || []}
                      onViewInvoice={(zohoId) => { const inv = account.invoices?.find((i: any) => i.zohoId === zohoId); setViewingInvoice(inv || { zohoId, id: zohoId }) }}
                      onViewSalesDoc={(type, doc) => setViewingSalesDoc({ type, doc })}
                    />
                  : <DocumentFlipbook
                      invoices={account.invoices}
                      quotes={account.quotes}
                      salesOrders={account.salesOrders}
                      onViewInvoice={(zohoId) => { const inv = account.invoices?.find((i: any) => i.zohoId === zohoId); setViewingInvoice(inv || { zohoId, id: zohoId }) }}
                      onViewSalesDoc={(type, doc) => setViewingSalesDoc({ type, doc })}
                    />
                }
              </div>
            </div>
          )}

          {activeTab === "purchased" && (
            <div className="p-4 sm:p-6 max-w-5xl mx-auto w-full">
              <AccountProductsPurchased accountId={account.zohoId} />
            </div>
          )}

          {activeTab === "tasks" && (
            <div className="p-4 sm:p-6 max-w-5xl mx-auto w-full">
              <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 sm:p-6 shadow-xl">
                <h2 className="text-xl font-semibold mb-4 text-emerald-500">Account Tasks</h2>
                {(!account.tasks || account.tasks.length === 0)
                  ? <div className="text-center py-8 text-neutral-500">No tasks found for this account.</div>
                  : <div className="space-y-3">{account.tasks.map((task: any) => <TaskEditor key={task.id} task={task} onSave={() => fetchAccountData(false)} />)}</div>
                }
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drill-down modal */}
      {drillInvoices && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setDrillInvoices(null)}>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
              <h3 className="font-bold text-white flex items-center gap-2">
                {drillTitle} <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">{drillInvoices.length}</span>
              </h3>
              <button onClick={() => setDrillInvoices(null)} className="text-neutral-500 hover:text-white text-xl">&times;</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-2 scrollbar-thin">
              {drillInvoices.length === 0
                ? <div className="text-center py-8 text-neutral-500 italic">No invoices match this statistic.</div>
                : drillInvoices.map((inv, idx) => {
                    const invoiceNum = (inv.items && typeof inv.items === "object" && "invoiceNumber" in inv.items) ? (inv.items as any).invoiceNumber : inv.zohoId?.slice(-6) || "INV"
                    return (
                      <div key={idx} onClick={() => { setViewingInvoice(inv); setDrillInvoices(null) }} className="bg-neutral-800/50 p-3 rounded border border-neutral-800 flex justify-between items-center cursor-pointer hover:bg-neutral-800 transition-colors">
                        <div>
                          <div className="text-sm font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <FiFileText className="text-amber-500 shrink-0" size={12} />#{invoiceNum}
                          </div>
                          <div className="text-xs text-neutral-400 mt-1 border-l-2 border-neutral-700 pl-2">
                            {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString(undefined, { timeZone: "UTC" }) : "â€”"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-blue-400">${parseFloat(inv.amount || 0).toLocaleString()}</div>
                          <div className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded inline-block mt-1 ${inv.status === "Paid" ? "bg-emerald-900/40 text-emerald-400" : inv.status === "Overdue" ? "bg-red-900/40 text-red-400" : "bg-neutral-800 text-neutral-300"}`}>{inv.status || "â€”"}</div>
                        </div>
                      </div>
                    )
                  })
              }
            </div>
          </div>
        </div>
      )}

      {viewingInvoice && <InvoiceDetailsModal invoice={viewingInvoice} onClose={() => setViewingInvoice(null)} />}
      {viewingSalesDoc && <InvoiceDetailsModal invoice={viewingSalesDoc.doc} type={viewingSalesDoc.type} onClose={() => setViewingSalesDoc(null)} />}
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
