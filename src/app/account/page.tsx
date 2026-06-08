"use client"

import { useSearchParams } from "next/navigation"
import { Suspense, useState, useEffect } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { AccountHistory } from "@/components/AccountHistory"
import { SalesAssistant } from "@/components/SalesAssistant"
import { CommunicationCenter } from "@/components/CommunicationCenter"
import { DocumentFlipbook } from "@/components/DocumentFlipbook"
import { AccountAnalytics } from "@/components/AccountAnalytics"
import { DealsHistory } from "@/components/DealsHistory"
import { PointOfSale } from "@/components/PointOfSale"
import Link from "next/link"
import { StatusPicker } from "@/components/StatusPicker"

type ActiveTab = "overview" | "history" | "documents" | "ai" | "comms" | "tasks"

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

  useEffect(() => {
    if (!id) return
    const fetchAccountData = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/get-account-details?id=${encodeURIComponent(id)}`)
        const data = await res.json()
        if (data.success) setAccount(data.account)
        else setError(data.error || data.message || 'Failed to load account')
      } catch (e: any) {
        console.error(e)
        setError(e.message || 'Failed to load account')
      } finally {
        setLoading(false)
      }
    }
    fetchAccountData()
  }, [id])

  if (loading) return (
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
                <StatusPicker
                  zohoId={account.zohoId}
                  accountId={account.id}
                  currentStatus={account.status || "Open"}
                  onUpdated={(newStatus) => setAccount((a: any) => ({ ...a, status: newStatus }))}
                />
                {account.industry && <span className="text-[10px] text-neutral-500 hidden sm:inline">{account.industry}</span>}
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowPos(true)}
            className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 text-xs sm:text-sm rounded-full font-bold transition-colors"
          >
            POS
          </button>
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
            { id: "history", label: "Transactions", icon: "🧾" },
            { id: "tasks", label: "Tasks", icon: "✓" },
            { id: "documents", label: "Documents", icon: "📂" },
            { id: "ai", label: "AI Assistant", icon: "⚡" },
            { id: "comms", label: "Comm Center", icon: "📞" },
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-1">
                <DealsHistory deals={account.deals} />
              </div>
              <div className="lg:col-span-2">
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
            </div>
          )}

          {activeTab === "history" && (
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 sm:p-6 shadow-xl">
              <AccountHistory
                accountId={id}
                invoices={account.invoices || []}
                salesOrders={account.salesOrders || []}
                notes={account.notes || []}
              />
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

          {activeTab === "documents" && (
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 sm:p-6 shadow-xl flex-1 flex flex-col min-h-[500px]">
              <DocumentFlipbook
                invoices={account.invoices}
                quotes={account.quotes}
                salesOrders={account.salesOrders}
              />
            </div>
          )}

          {activeTab === "ai" && (
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 sm:p-6 shadow-xl flex-1 flex flex-col">
              <SalesAssistant
                accountId={id}
                accountData={{ ...account, invoices, daysSinceLastPurchase, totalRevenue }}
              />
            </div>
          )}

          {activeTab === "comms" && (
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 sm:p-6 shadow-xl flex-1 flex flex-col min-h-[450px]">
              <CommunicationCenter accountId={id} contacts={account.contacts} />
            </div>
          )}

        </div>
      </div>

      {showPos && <PointOfSale accountId={id} onCancel={() => setShowPos(false)} />}

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
                    <div key={idx} className="bg-neutral-800/50 p-3 rounded border border-neutral-800 flex justify-between items-center">
                      <div>
                        <div className="text-sm font-bold text-white mb-0.5">#{invoiceNum}</div>
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
