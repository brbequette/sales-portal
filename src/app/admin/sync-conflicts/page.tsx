"use client"

import { useState, useEffect } from "react"
import { FiAlertTriangle, FiCheck, FiRefreshCw } from "react-icons/fi"

type ConflictField = {
  app?: any
  zoho?: any
  portal?: any
  current?: any
  new?: any
  [key: string]: any
}

type ConflictDoc = {
  docType: "invoice" | "salesorder" | "quote"
  id: string
  zohoId: string
  docNumber: string
  customer?: string
  status: string
  date: string
  lastSyncedAt: Date | string | null
  lastZohoModifiedTime: Date | string | null
  appModifiedAt: Date | string | null
  conflictFields: Record<string, ConflictField> | any
  recommendedSource: "app" | "zoho"
}

type SyncResponse = {
  totalConflicts: number
  invoiceConflicts: number
  salesOrderConflicts: number
  quoteConflicts: number
  invoices: ConflictDoc[]
  salesOrders: ConflictDoc[]
  quotes: ConflictDoc[]
}

export default function SyncConflictsPage() {
  const [data, setData] = useState<SyncResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<"all" | "invoices" | "salesorders" | "quotes">("all")
  const [resolving, setResolving] = useState<string | null>(null)
  const [fieldSelections, setFieldSelections] = useState<Record<string, Record<string, "app" | "zoho">>>({})
  
  const fetchConflicts = async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/api/admin/books/sync-conflicts")
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      setData(json)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchConflicts()
  }, [])

  const resolveConflict = async (doc: ConflictDoc, resolution: "app" | "zoho" | "dismiss" | "merge") => {
    setResolving(doc.id)
    try {
      const res = await fetch("/api/admin/books/sync-conflicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve",
          docType: doc.docType,
          docId: doc.id,
          resolution,
          fieldSelections: resolution === "merge" ? fieldSelections[doc.id] : undefined,
        })
      })
      if (!res.ok) throw new Error("Failed to resolve")
      
      // refresh list
      await fetchConflicts()
    } catch (error) {
      console.error(error)
      alert("Failed to resolve conflict.")
    } finally {
      setResolving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <FiRefreshCw className="animate-spin text-neutral-500" size={24} />
      </div>
    )
  }

  let allConflicts: ConflictDoc[] = []
  if (data) {
    allConflicts = [...data.invoices, ...data.salesOrders, ...data.quotes]
  }

  const displayedConflicts = activeTab === "all" 
    ? allConflicts 
    : activeTab === "invoices" ? data?.invoices || []
    : activeTab === "salesorders" ? data?.salesOrders || []
    : data?.quotes || []

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <FiAlertTriangle size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Sync Conflict Resolution</h1>
              <p className="text-sm text-neutral-400">Documents where Zoho Books data differs from portal data</p>
            </div>
          </div>
          <button 
            onClick={fetchConflicts}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-sm transition-colors border border-neutral-700 disabled:opacity-50"
          >
            <FiRefreshCw className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="flex gap-2 border-b border-neutral-800 pb-2 overflow-x-auto hide-scrollbar">
          {[
            { id: "all", label: "All Conflicts", count: data?.totalConflicts || 0 },
            { id: "invoices", label: "Invoices", count: data?.invoiceConflicts || 0 },
            { id: "salesorders", label: "Sales Orders", count: data?.salesOrderConflicts || 0 },
            { id: "quotes", label: "Quotes", count: data?.quoteConflicts || 0 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id 
                  ? "bg-neutral-800 text-white border border-neutral-700" 
                  : "text-neutral-400 hover:bg-neutral-800/50 hover:text-white border border-transparent"
              }`}
            >
              {tab.label}
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.id ? "bg-neutral-700 text-white" : "bg-neutral-800 text-neutral-400"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {displayedConflicts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center glass-panel border border-white/5 rounded-2xl">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-4">
              <FiCheck size={32} />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">All Synced — No conflicts detected</h3>
            <p className="text-sm text-neutral-500 max-w-md">
              All portal documents are currently in sync with Zoho Books.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {displayedConflicts.map((doc) => {
              const isResolving = resolving === doc.id
              const badgeColors = {
                invoice: "text-blue-400 bg-blue-500/10 border-blue-500/20",
                salesorder: "text-sky-400 bg-sky-500/10 border-sky-500/20",
                quote: "text-amber-400 bg-amber-500/10 border-amber-500/20",
              }
              const typeLabel = {
                invoice: "Invoice",
                salesorder: "Sales Order",
                quote: "Quote",
              }

              const renderDiff = (key: string, diffValue: any) => {
                let appVal = "N/A"
                let zohoVal = "N/A"
                
                if (diffValue && typeof diffValue === "object") {
                  appVal = diffValue.app ?? diffValue.portal ?? diffValue.current ?? JSON.stringify(diffValue)
                  zohoVal = diffValue.zoho ?? diffValue.new ?? JSON.stringify(diffValue)
                } else {
                  appVal = String(diffValue)
                }

                return (
                  <div key={key} className="bg-black/20 rounded-xl overflow-hidden border border-white/5">
                    <div className="px-3 py-2 bg-white/5 border-b border-white/5 text-xs font-bold text-neutral-300">
                      {key}
                    </div>
                    <div className="flex divide-x divide-white/5">
                      <div className="flex-1 p-3 bg-rose-500/5">
                        <div className="text-[10px] text-rose-400/70 uppercase tracking-wider font-bold mb-1">Portal Value</div>
                        <div className="text-sm text-rose-100 break-all">{String(appVal)}</div>
                      </div>
                      <div className="flex-1 p-3 bg-emerald-500/5">
                        <div className="text-[10px] text-emerald-400/70 uppercase tracking-wider font-bold mb-1">Zoho Value</div>
                        <div className="text-sm text-emerald-100 break-all">{String(zohoVal)}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 border-t border-white/5 p-2">
                      <button onClick={() => setFieldSelections(current => ({ ...current, [doc.id]: { ...current[doc.id], [key]: "app" } }))} className={`rounded-lg px-2 py-1 text-[10px] font-bold ${fieldSelections[doc.id]?.[key] === "app" ? "bg-blue-500 text-white" : "bg-blue-500/10 text-blue-300"}`}>Use Portal field</button>
                      <button onClick={() => setFieldSelections(current => ({ ...current, [doc.id]: { ...current[doc.id], [key]: "zoho" } }))} className={`rounded-lg px-2 py-1 text-[10px] font-bold ${fieldSelections[doc.id]?.[key] === "zoho" ? "bg-emerald-500 text-white" : "bg-emerald-500/10 text-emerald-300"}`}>Use Zoho field</button>
                    </div>
                  </div>
                )
              }

              return (
                <div key={doc.id} className="glass-panel border border-white/5 rounded-2xl p-5 flex flex-col">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg border ${badgeColors[doc.docType]}`}>
                          {typeLabel[doc.docType]}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {new Date(doc.lastZohoModifiedTime || doc.date).toLocaleDateString()}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-white">{doc.docNumber || "Unknown"}</h3>
                      {doc.customer && (
                        <p className="text-sm text-neutral-400">{doc.customer}</p>
                      )}
                      <p className="mt-2 text-xs text-amber-300">
                        Newest: {doc.recommendedSource === "app" ? "Portal" : "Zoho Books"} — approval required before replacement
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 flex-1 mb-6">
                    {doc.conflictFields && typeof doc.conflictFields === 'object' ? (
                      Object.entries(doc.conflictFields).map(([k, v]) => renderDiff(k, v))
                    ) : (
                      <div className="text-sm text-neutral-400 bg-black/20 p-3 rounded-xl border border-white/5">
                        <pre className="whitespace-pre-wrap">{JSON.stringify(doc.conflictFields, null, 2)}</pre>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-auto">
                    <button onClick={() => resolveConflict(doc, "merge")} disabled={isResolving} className="col-span-2 py-2.5 px-2 bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border border-orange-500/30 rounded-xl text-xs font-bold disabled:opacity-50">Apply reviewed field merge</button>
                    <button
                      onClick={() => resolveConflict(doc, "app")}
                      className="py-2.5 px-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-bold transition-colors text-center"
                    >
                      Keep Portal
                    </button>
                    <button
                      onClick={() => resolveConflict(doc, "zoho")}
                      className="py-2.5 px-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-bold transition-colors text-center"
                    >
                      Use Zoho
                    </button>
                    <button
                      onClick={() => resolveConflict(doc, "dismiss")}
                      className="py-2.5 px-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 rounded-xl text-xs font-bold transition-colors text-center"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )
            })}
        </div>
      )}
      </div>
    </div>
  )
}
