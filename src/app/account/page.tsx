"use client"

import { formatPhoneNumber } from "@/lib/formatters"


import { useSearchParams, useRouter } from "next/navigation"
import { Suspense, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { FiFileText, FiX, FiDatabase, FiDownload, FiMaximize2 } from "react-icons/fi"
import { useZoho } from "@/components/ZohoProvider"
import { AccountHistory } from "@/components/AccountHistory"
import { SalesAssistant } from "@/components/SalesAssistant"
import { CommunicationCenter } from "@/components/CommunicationCenter"
import { InvoiceDetailsModal } from "@/components/InvoiceDetailsModal"
import { DocumentFlipbook } from "@/components/DocumentFlipbook"
import { AccountAnalytics } from "@/components/AccountAnalytics"
import { DealsHistory } from "@/components/DealsHistory"
import { PointOfSale } from "@/components/PointOfSale"
import Link from "next/link"

import { QualityPicker } from "@/components/QualityPicker"
import { ContactsView } from "@/components/ContactsView"
import { AccountProductsPurchased } from "@/components/AccountProductsPurchased"
import { TaskEditor } from "@/components/TaskEditor"
import { AccountEditModal } from "@/components/AccountEditModal"

type ActiveTab = "overview" | "history" | "purchased" | "tasks" | "ai"

function useLocalTime(timeZone: string | undefined | null) {
  const [time, setTime] = useState<string>("...")
  
  useEffect(() => {
    if (!timeZone) {
      setTime("N/A")
      return
    }
    const updateTime = () => {
      try {
        setTime(new Date().toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }))
      } catch (e) {
        setTime("Invalid TZ")
      }
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [timeZone])
  
  return time
}

function AccountHubContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const id = searchParams.get("id") || ""
  const { isInitialized } = useZoho()
  const [account, setAccount] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPos, setShowPos] = useState(searchParams.get("pos") === "true")
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview")
  const [drillTitle, setDrillTitle] = useState("")
  const [drillInvoices, setDrillInvoices] = useState<any[] | null>(null)
  const [viewingInvoice, setViewingInvoice] = useState<any | null>(null)
  const [fullInvoiceDetails, setFullInvoiceDetails] = useState<any | null>(null)
  const [isLoadingInvoiceDetails, setIsLoadingInvoiceDetails] = useState(false)
  const [viewingSalesDoc, setViewingSalesDoc] = useState<{ type: 'SalesOrder' | 'Quote', doc: any } | null>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [historyViewMode, setHistoryViewMode] = useState<"data" | "pdf">("data")
  const [aiViewMode, setAiViewMode] = useState<"assistant" | "comms">("comms")
  const [isEditingAccount, setIsEditingAccount] = useState(false)
  
  const localTime = useLocalTime(account?.timeZone)

  const fetchAccountData = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch(`/api/get-account-details?id=${encodeURIComponent(id)}`)
      const data = await res.json()
      if (data.success) setAccount(data.account)
      else {
        setError(data.error || data.message || 'Failed to load account')
        if (data.debug) setDebugInfo(data.debug)
      }
    } catch (e: any) {
      console.error(e)
      if (showLoading) setError(e.message || 'Failed to load account')
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  const handleDeleteTransaction = async (type: string, id: string) => {
    if (!confirm(`Are you sure you want to delete this ${type}? This action cannot be undone in the hub.`)) return
    
    try {
      const res = await fetch("/api/delete-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id })
      })
      const data = await res.json()
      if (data.success) {
        setViewingSalesDoc(null)
        fetchAccountData(false)
      } else {
        alert(data.error || "Failed to delete transaction")
      }
    } catch (e: any) {
      alert("Network error: " + e.message)
    }
  }

  useEffect(() => {
    const handleInAppComm = (e: Event) => {
      setActiveTab("ai")
      setAiViewMode("comms")
    }
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
    const isPlaceholder = !cleanId || cleanId.startsWith("{") || cleanId === "undefined" || cleanId === "null"
    
    if (isPlaceholder) {
      router.push("/")
      return
    }
    
    fetchAccountData()
  }, [isInitialized, id, router])

  if (loading || !isInitialized) return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-neutral-950 text-white">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-neutral-400 text-sm">Loading account...</p>
      </div>
    </div>
  )
  if (!account) return (
    <div className="p-8 text-neutral-300">
      {error ? (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-400 font-semibold">Error loading account</p>
          <p className="text-red-400/80 text-sm mt-1">{error}</p>
          {debugInfo && (
            <pre className="text-xs text-yellow-300/70 mt-3 bg-black/30 rounded p-2 overflow-auto max-h-40">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          )}
          <p className="text-xs text-neutral-500 mt-2">URL id param: <code className="text-yellow-400">{id}</code></p>
          <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300 mt-3 inline-block">← Back to Dashboard</Link>
        </div>
      ) : (
        <p>Account not found.</p>
      )}
    </div>
  )

  const invoices = account.invoices || []
  const totalRevenue = invoices.reduce((sum: number, inv: any) => sum + parseFloat(inv.amount || 0), 0)
  const totalProfit = invoices.reduce((sum: number, inv: any) => sum + parseFloat(inv.items?.profit || 0), 0)
  const avgOrderValue = invoices.length ? (totalRevenue / invoices.length) : 0
  const daysSinceLastPurchase = account.lastPurchaseAt
    ? Math.floor((Date.now() - new Date(account.lastPurchaseAt).getTime()) / 86400000)
    : null

  const kpis = [
    { label: "Local Time", value: localTime, color: "text-emerald-300" },
    { label: "LTV", value: `$${(totalRevenue / 1000).toFixed(0)}k`, color: "text-emerald-400" },
    { label: "Total Profit", value: `$${(totalProfit / 1000).toFixed(1)}k`, color: "text-sky-400" },
    { label: "Avg Order", value: `$${avgOrderValue.toFixed(0)}`, color: "text-blue-400" },
    { label: "Days Since", value: daysSinceLastPurchase ?? "—", color: daysSinceLastPurchase && daysSinceLastPurchase > 365 ? "text-red-400" : "text-purple-400" },
    { label: "Quotes", value: account.quotes?.length || 0, color: "text-white" },
    { label: "Deals", value: account.deals?.length || 0, color: "text-amber-400" },
  ]

  return (
    <div className="flex flex-col bg-neutral-950 text-white font-sans" style={{ height: "100%" }}>
      {isEditingAccount && (
        <AccountEditModal 
          account={account} 
          onClose={() => setIsEditingAccount(false)} 
          onSaved={() => {
            setIsEditingAccount(false)
            fetchAccountData(false)
          }} 
        />
      )}

      {/* ── Header ── */}
      <header className="flex-none bg-neutral-900 border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => router.back()} className="text-neutral-400 hover:text-white text-sm shrink-0 cursor-pointer">← Back</button>
            <div className="h-5 w-px bg-neutral-700 shrink-0"></div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold truncate">{account.name}</h1>
                <button onClick={() => setIsEditingAccount(true)} className="text-[9px] bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 px-1.5 py-0.5 rounded transition-colors uppercase tracking-wider font-bold">Edit</button>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <QualityPicker
                  zohoId={account.zohoId}
                  accountId={account.id}
                  currentQuality={account.quality || "NEVER_STATUSED"}
                  onUpdated={(newQuality) => setAccount((a: any) => ({ ...a, quality: newQuality }))}
                />
                {account.industry && <span className="text-[10px] text-neutral-500 hidden sm:inline">{account.industry}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/tasks/new?accountId=${account.zohoId}&accountName=${encodeURIComponent(account.name)}`)}
              className="shrink-0 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white px-3 py-1.5 text-xs sm:text-sm rounded-full font-bold transition-colors border border-neutral-700 flex items-center gap-1.5"
              title="Create a task linked to this account"
            >
              <span>+ Task</span>
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/create-books-contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accountId: account.zohoId })
                  })
                  const data = await res.json()
                  if (data.success) {
                    alert(data.message || 'Successfully added to Zoho Books!')
                  } else {
                    alert('Error: ' + data.error)
                  }
                } catch (e: any) {
                  alert('Error: ' + e.message)
                }
              }}
              className="shrink-0 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white px-3 py-1.5 text-xs sm:text-sm rounded-full font-bold transition-colors border border-neutral-700 flex items-center gap-1.5"
              title="Push this account to Zoho Books as a Customer"
            >
              <span>+ Books</span>
            </button>
            <button
              onClick={() => setShowPos(true)}
              className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 text-xs sm:text-sm rounded-full font-bold transition-colors"
            >
              POS
            </button>
          </div>
        </div>
      </header>

      {/* ── KPI Strip ── */}
      <div className="flex-none bg-black/40 border-b border-neutral-800 px-4 py-2 overflow-x-auto scroll-fade-x scrollbar-none">
        <div className="flex gap-5 min-w-max">
          {kpis.map(k => (
            <div key={k.label}>
              <div className="text-[9px] text-neutral-500 uppercase font-semibold tracking-wider">{k.label}</div>
              <div className={`text-sm font-bold ${k.color}`}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab Selector Navigation Bar (Unified for Desktop and Mobile) ── */}
      <div className="flex-none bg-neutral-900 border-b border-neutral-800 overflow-x-auto scrollbar-none">
        <div className="flex px-4 min-w-max gap-1">
          {([
            { id: "overview", label: "Overview", icon: "📊" },
            { id: "history", label: "Transactions & Docs", icon: "🧾" },
            { id: "purchased", label: "Products Purchased", icon: "💎" },
            { id: "tasks", label: "Tasks", icon: "✓" },
            { id: "ai", label: "AI & Comm Center", icon: "⚡" },
          ] as { id: ActiveTab, label: string, icon: string }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
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

      {/* ── Main Content Area ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin">
        <div className="max-w-5xl mx-auto h-full flex flex-col space-y-6">

          {activeTab === "overview" && (
            <div className="flex flex-col space-y-8">
              {/* ── Account Profile & Addresses — Always Visible ── */}
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-5 shadow-xl space-y-5 animate-slide-up">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3 gap-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider shrink-0">
                    <FiDatabase className="text-blue-500" />
                    <span>Account Profile & Addresses</span>
                  </h3>
                  {(account.booksContact?.phone || account.contacts?.[0]?.phone) && (
                    <a href={"tel:" + (account.booksContact?.phone || account.contacts?.[0]?.phone).replace(/[^0-9+]/g, '')}
                      className="text-xs text-blue-400 hover:text-blue-300 font-mono font-bold flex items-center gap-1.5 truncate min-w-0"
                      title="Click to dial account main line"
                    >
                      📞 Dial Main: {formatPhoneNumber(account.booksContact?.phone || account.contacts?.[0]?.phone)}
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Billing Address — DB fields as primary, Books as fallback */}
                  <div className="address-card">
                    <h4 className="text-blue-400">Billing Address</h4>
                    <div className="text-xs text-neutral-300 leading-relaxed">
                      {(account.billingStreet || account.booksContact?.billing_address?.address) ? (
                        <>
                          <p className="street">{account.billingStreet || account.booksContact?.billing_address?.address}</p>
                          <p>{account.billingCity || account.booksContact?.billing_address?.city || ''}, {account.billingState || account.booksContact?.billing_address?.state || ''} {account.billingZip || account.booksContact?.billing_address?.zip || ''}</p>
                          <p className="text-neutral-500 text-[10px] uppercase font-bold mt-1 tracking-wider">{account.billingCountry || account.booksContact?.billing_address?.country || 'U.S.A'}</p>
                        </>
                      ) : (
                        <p className="text-neutral-500 italic text-[11px]">No billing address configured</p>
                      )}
                    </div>
                  </div>

                  {/* Shipping Address — DB fields as primary, Books as fallback */}
                  <div className="address-card">
                    <h4 className="text-amber-400">Shipping Address</h4>
                    <div className="text-xs text-neutral-300 leading-relaxed">
                      {(account.shippingStreet || account.booksContact?.shipping_address?.address) ? (
                        <>
                          <p className="street">{account.shippingStreet || account.booksContact?.shipping_address?.address}</p>
                          <p>{account.shippingCity || account.booksContact?.shipping_address?.city || ''}, {account.shippingState || account.booksContact?.shipping_address?.state || ''} {account.shippingZip || account.booksContact?.shipping_address?.zip || ''}</p>
                          <p className="text-neutral-500 text-[10px] uppercase font-bold mt-1 tracking-wider">{account.shippingCountry || account.booksContact?.shipping_address?.country || 'U.S.A'}</p>
                        </>
                      ) : (
                        <p className="text-neutral-500 italic text-[11px]">No shipping address configured</p>
                      )}
                    </div>
                  </div>

                  {/* Company Details */}
                  <div className="address-card">
                    <h4 className="text-emerald-400">Company Profile</h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold">Phone</span>
                        {(account.booksContact?.phone || account.contacts?.[0]?.phone) ? (
                          <a href={"tel:" + (account.booksContact?.phone || account.contacts[0].phone).replace(/[^0-9+]/g, '')}
                            className="text-blue-400 hover:underline font-bold font-mono truncate block text-left"
                          >
                            {formatPhoneNumber(account.booksContact?.phone || account.contacts[0].phone)}
                          </a>
                        ) : (
                          <span className="text-neutral-200 font-bold block">—</span>
                        )}
                      </div>
                      <div>
                        <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold">Website</span>
                        {account.booksContact?.website ? (
                          <a 
                            href={account.booksContact.website.startsWith('http') ? account.booksContact.website : `https://${account.booksContact.website}`} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-blue-400 hover:underline truncate block font-bold font-mono"
                          >
                            {account.booksContact.website}
                          </a>
                        ) : (
                          <span className="text-neutral-400 font-bold">—</span>
                        )}
                      </div>
                      <div>
                        <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold">Industry</span>
                        <span className="text-neutral-200 font-bold truncate block">{account.industry || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold">Tags / Segment</span>
                        <span className="text-neutral-200 font-bold truncate block">{account.tags || 'General'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Business Profile (Blade/Equipment Details) ── */}
                <div className="bg-neutral-950/30 p-4 border border-neutral-800/80 rounded-xl">
                  <h4 className="text-[10px] font-bold text-orange-400 uppercase tracking-wider mb-3">Business Profile</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold">Blade Sizes</span>
                      <span className="text-neutral-200 font-bold">{account.bladeSizes || <span className="text-neutral-600 italic font-normal">Not recorded</span>}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold">Materials Cut</span>
                      <span className="text-neutral-200 font-bold">{account.materialsCut || <span className="text-neutral-600 italic font-normal">Not recorded</span>}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold">Current Supplier</span>
                      <span className="text-neutral-200 font-bold">{account.currentSupplier || <span className="text-neutral-600 italic font-normal">Not recorded</span>}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold">Avg Blade Cost</span>
                      <span className="text-neutral-200 font-bold">{account.averageBladeCost ? <span className="text-emerald-400 font-bold">{account.averageBladeCost}</span> : <span className="text-neutral-600 italic font-normal">Not recorded</span>}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold">Crew Count</span>
                      <span className="text-neutral-200 font-bold">{account.crewCount || <span className="text-neutral-600 italic font-normal">Not recorded</span>}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-neutral-500 block uppercase tracking-wider font-semibold">Blades/Order</span>
                      <span className="text-neutral-200 font-bold">{account.bladesPerOrder || <span className="text-neutral-600 italic font-normal">Not recorded</span>}</span>
                    </div>
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

              <div className="w-full">
                <AccountAnalytics
                  invoices={account.invoices}
                  deals={account.deals}
                  quotes={account.quotes}
                  salesOrders={account.salesOrders}
                  onDrillDown={(title, invs) => {
                    setDrillTitle(title)
                    setDrillInvoices(invs)
                  }}
                />
              </div>
              
              <div className="w-full border-t border-neutral-800/50 pt-8">
                <ContactsView 
                  contacts={account.contacts || []}
                  notes={account.notes || []}
                  accountId={account.id}
                  onNoteAdded={(newNote: any) => {
                    setAccount((prev: any) => {
                      if (!prev) return prev
                      return {
                        ...prev,
                        notes: [newNote, ...(prev.notes || [])]
                      }
                    })
                  }}
                />
              </div>

              <div className="w-full border-t border-neutral-800/50 pt-8">
                <DealsHistory deals={account.deals} />
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 sm:p-6 shadow-xl flex-1 flex flex-col min-h-[500px] space-y-4">
              <div className="flex justify-end mb-2">
                <div className="flex bg-neutral-950 p-0.5 rounded-lg border border-neutral-800 shrink-0">
                  <button
                    onClick={() => setHistoryViewMode("data")}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                      historyViewMode === "data"
                        ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/10"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    Data View 📊
                  </button>
                  <button
                    onClick={() => setHistoryViewMode("pdf")}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                      historyViewMode === "pdf"
                        ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/10"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    PDF & Flipbook View 📂
                  </button>
                </div>
              </div>

              {historyViewMode === "data" ? (
                <AccountHistory
                  accountId={id}
                  invoices={account.invoices || []}
                  salesOrders={account.salesOrders || []}
                  quotes={account.quotes || []}
                  notes={account.notes || []}
                  onViewInvoice={(zohoId) => {
                    const inv = account.invoices?.find((i: any) => i.zohoId === zohoId)
                    setViewingInvoice(inv || { zohoId, id: zohoId })
                  }}
                  onViewSalesDoc={(type, doc) => setViewingSalesDoc({ type, doc })}
                />
              ) : (
                <DocumentFlipbook
                  invoices={account.invoices}
                  quotes={account.quotes}
                  salesOrders={account.salesOrders}
                  onViewInvoice={(zohoId) => {
                    const inv = account.invoices?.find((i: any) => i.zohoId === zohoId)
                    setViewingInvoice(inv || { zohoId, id: zohoId })
                  }}
                  onViewSalesDoc={(type, doc) => setViewingSalesDoc({ type, doc })}
                />
              )}
            </div>
          )}

          {activeTab === "purchased" && (
            <AccountProductsPurchased accountId={account.zohoId} />
          )}

          {activeTab === "tasks" && (
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 sm:p-6 shadow-xl flex-1">
              <h2 className="text-xl font-semibold mb-4 text-emerald-500">Account Tasks</h2>
              {(!account.tasks || account.tasks.length === 0) ? (
                <div className="text-center py-8 text-neutral-500">No tasks found for this account.</div>
              ) : (
                <div className="space-y-3">
                  {account.tasks.map((task: any) => (
                    <TaskEditor 
                      key={task.id} 
                      task={task} 
                      onSave={() => {
                        // Refresh data after save
                        fetch(`/api/get-account-details?accountId=${account.zohoId}`)
                          .then(r => r.json())
                          .then(d => {
                            if (d.success) setAccount(d.account)
                          })
                      }} 
                    />
                  ))}
                </div>
              )}
            </div>
          )}



          {activeTab === "ai" && (
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 sm:p-6 shadow-xl flex-1 flex flex-col min-h-[500px] space-y-4">
              <div className="flex justify-end mb-2">
                <div className="flex bg-neutral-950 p-0.5 rounded-lg border border-neutral-800 shrink-0">
                  <button
                    onClick={() => setAiViewMode("comms")}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                      aiViewMode === "comms"
                        ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/10"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    Comm Center 📞
                  </button>
                  <button
                    onClick={() => setAiViewMode("assistant")}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                      aiViewMode === "assistant"
                        ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/10"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    AI Copilot ⚡
                  </button>
                </div>
              </div>

              {aiViewMode === "assistant" ? (
                <div className="flex-1 flex flex-col min-h-0">
                  <SalesAssistant
                    accountId={id}
                    accountData={{ ...account, invoices, daysSinceLastPurchase, totalRevenue }}
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0">
                  <CommunicationCenter accountId={id} account={{ ...account, invoices }} contacts={account.contacts} />
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {showPos && <PointOfSale accountId={id} onCancel={() => setShowPos(false)} onSuccess={() => { setShowPos(false); fetchAccountData(true); }} />}

      {drillInvoices && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setDrillInvoices(null)}>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
              <h3 className="font-bold text-white flex items-center gap-2">
                {drillTitle} <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">{drillInvoices.length}</span>
              </h3>
              <button onClick={() => setDrillInvoices(null)} className="text-neutral-500 hover:text-white text-xl">&times;</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-2 scrollbar-thin">
              {drillInvoices.length === 0 ? (
                <div className="text-center py-8 text-neutral-500 italic">No invoices match this statistic.</div>
              ) : (
                drillInvoices.map((inv, idx) => {
                  const invoiceNum = (inv.items && typeof inv.items === 'object' && 'invoiceNumber' in inv.items)
                    ? (inv.items as any).invoiceNumber
                    : inv.zohoId?.slice(-6) || "INV";

                  return (
                    <div 
                      key={idx} 
                      onClick={() => {
                        setViewingInvoice(inv)
                        setDrillInvoices(null)
                      }}
                      className="bg-neutral-800/50 p-3 rounded border border-neutral-800 flex justify-between items-center cursor-pointer hover:bg-neutral-800 transition-colors"
                      title="Click to view Invoice PDF"
                    >
                      <div>
                        <div className="text-sm font-bold text-white mb-0.5 flex items-center gap-1.5">
                          <FiFileText className="text-amber-500 shrink-0" size={12} />
                          <span>#{invoiceNum}</span>
                        </div>
                        <div className="text-xs text-neutral-400 mt-1 flex flex-col gap-0.5 border-l-2 border-neutral-700 pl-2">
                          <span>Ordered: {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString(undefined, { timeZone: 'UTC' }) : "—"}</span>
                          {inv.status === 'Paid' && (
                            <span className="text-blue-400">Paid: {new Date((inv.items as any)?.paymentDate || inv.updatedAt || inv.issueDate).toLocaleDateString(undefined, { timeZone: 'UTC' })}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-blue-400">${parseFloat(inv.amount || 0).toLocaleString()}</div>
                        {inv.items?.profit !== undefined && (
                          <div className="text-[10px] text-sky-400 font-semibold mt-0.5">Profit: ${parseFloat(inv.items.profit).toLocaleString()}</div>
                        )}
                        <div className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded inline-block mt-1 ${
                          inv.status === "Paid" ? "bg-emerald-900/40 text-emerald-400" :
                          inv.status === "Overdue" ? "bg-red-900/40 text-red-400" :
                          "bg-neutral-800 text-neutral-300"
                        }`}>{inv.status || "—"}</div>
                        {inv.status !== 'Paid' && inv.status !== 'Void' && inv.status !== 'Draft' && inv.items?.shippingCharge === 0 && (
                          <div className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded inline-block mt-1 ml-1 bg-amber-900/40 text-amber-400">⚠ No Ship $</div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
      {viewingInvoice && (
        <InvoiceDetailsModal 
          invoice={viewingInvoice} 
          onClose={() => setViewingInvoice(null)} 
        />
      )}

      {/* ── Sales Document (Quote / Sales Order) Details Modal ── */}
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
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <AccountHubContent />
    </Suspense>
  )
}

