"use client"

import { useSearchParams } from "next/navigation"
import { Suspense, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { FiFileText, FiX, FiDatabase } from "react-icons/fi"
import { useZoho } from "@/components/ZohoProvider"
import { AccountHistory } from "@/components/AccountHistory"
import { SalesAssistant } from "@/components/SalesAssistant"
import { CommunicationCenter } from "@/components/CommunicationCenter"
import { DocumentFlipbook } from "@/components/DocumentFlipbook"
import { AccountAnalytics } from "@/components/AccountAnalytics"
import { DealsHistory } from "@/components/DealsHistory"
import { PointOfSale } from "@/components/PointOfSale"
import Link from "next/link"

import { QualityPicker } from "@/components/QualityPicker"
import { ContactsView } from "@/components/ContactsView"

type ActiveTab = "overview" | "history" | "ai" | "tasks"

function AccountHubContent() {
  const searchParams = useSearchParams()
  const id = searchParams.get("id") || ""
  const { isInitialized } = useZoho()
  const [account, setAccount] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPos, setShowPos] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview")
  const [drillTitle, setDrillTitle] = useState("")
  const [drillInvoices, setDrillInvoices] = useState<any[] | null>(null)
  const [viewingInvoice, setViewingInvoice] = useState<any | null>(null)
  const [fullInvoiceDetails, setFullInvoiceDetails] = useState<any | null>(null)
  const [isLoadingInvoiceDetails, setIsLoadingInvoiceDetails] = useState(false)
  const [viewingSalesDoc, setViewingSalesDoc] = useState<{ type: 'SalesOrder' | 'Quote', doc: any } | null>(null)
  const [historyViewMode, setHistoryViewMode] = useState<"data" | "pdf">("data")
  const [aiViewMode, setAiViewMode] = useState<"assistant" | "comms">("comms")

  const fetchAccountData = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch(`/api/get-account-details?id=${encodeURIComponent(id)}`)
      const data = await res.json()
      if (data.success) setAccount(data.account)
      else setError(data.error || data.message || 'Failed to load account')
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
    if (!isInitialized) return
    fetchAccountData()
  }, [isInitialized, id])

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
  }, [viewingInvoice])

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
    { label: "LTV", value: `$${(totalRevenue / 1000).toFixed(0)}k`, color: "text-emerald-400" },
    { label: "Total Profit", value: `$${(totalProfit / 1000).toFixed(1)}k`, color: "text-sky-400" },
    { label: "Avg Order", value: `$${avgOrderValue.toFixed(0)}`, color: "text-blue-400" },
    { label: "Days Since", value: daysSinceLastPurchase ?? "—", color: daysSinceLastPurchase && daysSinceLastPurchase > 365 ? "text-red-400" : "text-purple-400" },
    { label: "Quotes", value: account.quotes?.length || 0, color: "text-white" },
    { label: "Deals", value: account.deals?.length || 0, color: "text-amber-400" },
  ]

  return (
    <div className="flex flex-col bg-neutral-950 text-white font-sans" style={{ height: "100%" }}>

      {/* ── Header ── */}
      <header className="flex-none bg-neutral-900 border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="text-neutral-400 hover:text-white text-sm shrink-0">← Back</Link>
            <div className="h-5 w-px bg-neutral-700 shrink-0"></div>
            <div className="min-w-0">
              <h1 className="text-base font-bold truncate">{account.name}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <QualityPicker
                  zohoId={account.zohoId}
                  accountId={account.id}
                  currentQuality={account.quality || "WARM"}
                  onUpdated={(newQuality) => setAccount((a: any) => ({ ...a, quality: newQuality }))}
                />
                {account.industry && <span className="text-[10px] text-neutral-500 hidden sm:inline">{account.industry}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
      <div className="flex-none bg-black/40 border-b border-neutral-800 px-4 py-2 overflow-x-auto">
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

          {activeTab === "tasks" && (
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 sm:p-6 shadow-xl flex-1">
              <h2 className="text-xl font-semibold mb-4 text-emerald-500">Account Tasks</h2>
              {(!account.tasks || account.tasks.length === 0) ? (
                <div className="text-center py-8 text-neutral-500">No tasks found for this account.</div>
              ) : (
                <div className="space-y-3">
                  {account.tasks.map((task: any) => (
                    <div key={task.id} className="bg-neutral-800/50 border border-neutral-700 p-4 rounded-lg flex justify-between items-center">
                      <div>
                        <div className="font-bold text-white">{task.subject}</div>
                        <div className="text-xs text-neutral-400 mt-1">{task.description || "No description"}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block ${task.status === 'Completed' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-amber-900/40 text-amber-400'}`}>{task.status}</div>
                        {task.dueDate && <div className="text-xs text-neutral-500 mt-1">Due: {new Date(task.dueDate).toLocaleDateString()}</div>}
                      </div>
                    </div>
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
                <div className="flex-1 flex flex-col">
                  <SalesAssistant
                    accountId={id}
                    accountData={{ ...account, invoices, daysSinceLastPurchase, totalRevenue }}
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-[450px]">
                  <CommunicationCenter accountId={id} contacts={account.contacts} />
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
                        <div className="text-xs text-neutral-400">{inv.issueDate ? new Date(inv.issueDate).toLocaleDateString() : "—"}</div>
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
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── Invoice Details Modal ── */}
      {viewingInvoice && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm" onClick={() => setViewingInvoice(null)} />
          <div className="relative bg-neutral-900 border border-neutral-850 w-full max-w-6xl h-[85vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl z-[10001]">
            {/* Header */}
            <div className="bg-neutral-850 px-6 py-4 border-b border-neutral-800 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <FiFileText className="text-amber-500" /> Invoice Details
                </h2>
                <p className="text-[10px] text-neutral-400 mt-0.5 font-mono">Zoho ID: {viewingInvoice.zohoId || viewingInvoice.id}</p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`/api/get-invoice-pdf?id=${viewingInvoice.zohoId || viewingInvoice.id}&download=true`}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors border border-neutral-700 flex items-center gap-1.5 cursor-pointer"
                >
                  Download PDF
                </a>
                <button 
                  onClick={() => setViewingInvoice(null)} 
                  className="text-neutral-400 hover:text-white p-1 bg-neutral-800 hover:bg-neutral-755 transition-colors rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg cursor-pointer"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Content Split */}
            <div className="flex flex-1 overflow-hidden">
              {/* Data View */}
              <div className="w-1/3 min-w-[300px] bg-neutral-950 border-r border-neutral-800 overflow-y-auto p-5 flex flex-col gap-6">
                <div>
                  <h3 className="text-white font-bold text-sm mb-4 flex items-center gap-2"><FiDatabase className="text-sky-400" /> Data View</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Invoice #</label>
                      <div className="text-sm text-white font-mono">{viewingInvoice.items?.invoiceNumber || viewingInvoice.id?.slice(-6) || "—"}</div>
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Amount</label>
                      <div className="text-sm text-emerald-400 font-bold">${viewingInvoice.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}</div>
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Status</label>
                      <div className={`text-sm font-bold ${viewingInvoice.status === 'Paid' ? 'text-blue-400' : 'text-amber-400'}`}>{viewingInvoice.status || "—"}</div>
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Issue Date</label>
                      <div className="text-sm text-white">{viewingInvoice.issueDate ? new Date(viewingInvoice.issueDate).toLocaleDateString() : "—"}</div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-800 flex-1 overflow-y-auto pr-2">
                  <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-3">Custom Fields & Data</h4>
                  
                  {isLoadingInvoiceDetails ? (
                    <div className="flex justify-center items-center py-8 gap-2 text-sm font-semibold text-neutral-400">
                      <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      Loading details...
                    </div>
                  ) : fullInvoiceDetails?.custom_fields ? (
                    <div className="flex flex-col gap-2.5 pb-4">
                      {fullInvoiceDetails.custom_fields
                        .filter((f: any) => f.value && f.value !== "" && f.value !== false)
                        .map((field: any) => (
                        <div key={field.customfield_id} className="bg-neutral-850 border border-neutral-800 rounded-lg p-3 shadow-sm">
                          <label className="text-[10px] text-emerald-500/80 uppercase font-bold tracking-wider mb-1.5 block">
                            {field.label}
                          </label>
                          {field.data_type === "multiline" ? (
                            <pre className="text-xs text-neutral-200 font-mono whitespace-pre-wrap break-all bg-neutral-950 p-2.5 rounded border border-neutral-800/50">
                              {field.value_formatted || field.value}
                            </pre>
                          ) : (
                            <div className={`text-sm font-bold ${field.data_type === "amount" || field.data_type === "percent" ? "text-emerald-400" : "text-white"}`}>
                              {field.value_formatted || field.value}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 overflow-x-auto">
                      <pre className="text-[10px] text-neutral-300 font-mono whitespace-pre-wrap break-all">
                        {JSON.stringify(viewingInvoice.items || viewingInvoice, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>

              {/* PDF Preview */}
              <div className="flex-1 bg-neutral-900 p-3 relative flex flex-col">
                <iframe
                  src={`/api/get-invoice-pdf?id=${viewingInvoice.zohoId || viewingInvoice.id}`}
                  className="w-full h-full border-0 rounded-xl bg-neutral-950 flex-1 shadow-inner"
                  title="Invoice PDF Preview"
                />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Sales Document (Quote / Sales Order) Details Modal ── */}
      {viewingSalesDoc && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm" onClick={() => setViewingSalesDoc(null)} />
          <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col shadow-2xl text-white z-[10001] p-6 max-h-[85vh]">
            
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-neutral-800 mb-4 shrink-0">
              <div>
                <h3 className="font-bold text-lg text-white flex items-center gap-2">
                  <FiFileText className={viewingSalesDoc.type === 'Quote' ? "text-purple-500 animate-pulse" : "text-blue-500 animate-pulse"} />
                  <span>{viewingSalesDoc.type === 'Quote' ? 'Quote / Estimate Details' : 'Sales Order Details'}</span>
                </h3>
                <p className="text-neutral-500 text-xs mt-0.5 font-mono">
                  Document ID: #{viewingSalesDoc.doc.id.slice(-6).toUpperCase()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleDeleteTransaction(viewingSalesDoc.type, viewingSalesDoc.doc.id)} 
                  className="bg-red-900/30 hover:bg-red-900/60 text-red-400 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors border border-red-500/20"
                >
                  Delete from Hub
                </button>
                <button 
                  onClick={() => setViewingSalesDoc(null)} 
                  className="text-neutral-400 hover:text-white p-1 bg-neutral-800 hover:bg-neutral-755 transition-colors rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg cursor-pointer"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Document Content */}
            <div className="space-y-4 overflow-y-auto flex-1 pr-1 scrollbar-thin">
              <div className="grid grid-cols-2 gap-4 bg-neutral-950/40 p-4 border border-neutral-800 rounded-xl">
                <div>
                  <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Status</span>
                  <p className={`text-xs font-bold mt-0.5 ${
                    viewingSalesDoc.doc.status === 'Accepted' || viewingSalesDoc.doc.status === 'Shipped' || viewingSalesDoc.doc.status === 'Processed'
                      ? 'text-emerald-400' 
                      : 'text-amber-400'
                  }`}>
                    {viewingSalesDoc.doc.status || 'Draft'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Date</span>
                  <p className="text-xs text-neutral-200 font-semibold mt-0.5">
                    {new Date(viewingSalesDoc.doc.orderDate || viewingSalesDoc.doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {viewingSalesDoc.type === 'Quote' && viewingSalesDoc.doc.validUntil && (
                  <div className="col-span-2">
                    <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Valid Until</span>
                    <p className="text-xs text-neutral-200 font-semibold mt-0.5">
                      {new Date(viewingSalesDoc.doc.validUntil).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>

              {/* Line Items Table */}
              <div className="space-y-2">
                <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Items Breakdown</span>
                <div className="border border-neutral-800 rounded-xl overflow-hidden max-h-[250px] overflow-y-auto scrollbar-thin">
                  <table className="w-full text-xs">
                    <thead className="bg-neutral-950/60 border-b border-neutral-800 text-neutral-500 font-bold">
                      <tr>
                        <th className="text-left px-3 py-2">Item Description</th>
                        <th className="text-right px-3 py-2 w-24">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/50">
                      {Array.isArray(viewingSalesDoc.doc.items) && viewingSalesDoc.doc.items.length > 0 ? (
                        viewingSalesDoc.doc.items.map((item: any, i: number) => {
                          const name = typeof item === 'string' ? item : item.name || 'Product Item'
                          const amount = typeof item === 'string' ? null : item.amount || null
                          return (
                            <tr key={i}>
                              <td className="px-3 py-2.5 text-neutral-200 font-semibold">
                                {name}
                              </td>
                              <td className="px-3 py-2.5 text-right text-neutral-300">
                                {amount ? `$${parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                              </td>
                            </tr>
                          )
                        })
                      ) : (
                        <tr>
                          <td colSpan={2} className="px-3 py-4 text-center text-neutral-500 italic">
                            Standard product assortment
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="flex justify-between items-center bg-neutral-950/20 border border-neutral-800/80 rounded-xl p-4 mt-2">
                <span className="text-sm font-bold text-neutral-400">Total Document Amount</span>
                <span className="text-xl font-bold text-emerald-400 font-mono">
                  ${parseFloat(viewingSalesDoc.doc.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-4 border-t border-neutral-800 flex justify-end shrink-0">
              <button 
                onClick={() => setViewingSalesDoc(null)}
                className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>,
        document.body
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
