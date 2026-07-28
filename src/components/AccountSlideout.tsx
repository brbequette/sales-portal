"use client"


import { formatPhoneNumber } from "@/lib/formatters"
import { useState, useEffect } from "react"
import { FiX, FiUser, FiPhone, FiMail, FiDollarSign, FiClock, FiShoppingBag, FiInfo, FiMapPin, FiExternalLink, FiRefreshCw, FiAlertTriangle, FiFileText, FiSettings } from "react-icons/fi"
import { PhoneLink } from "@/components/PhoneLink"
import { OrderBuilder } from "@/components/OrderBuilder"
import Link from "next/link"
import { CommunicationsHub } from "@/components/CommunicationsHub"
import { DocumentFlipbook } from "@/components/DocumentFlipbook"
import { QualityPicker } from "@/components/QualityPicker"
import { InvoiceDetailsModal } from "@/components/InvoiceDetailsModal"

// Build a billing address from the account record, falling back to the live
// Zoho CRM details so an address is shown whenever one exists on either source.
function resolveAddress(account: any) {
  const crm = account?.crmDetails || {}
  const street = account?.billingStreet || crm.Billing_Street || ""
  const city = account?.billingCity || crm.Billing_City || ""
  const state = account?.billingState || crm.Billing_State || ""
  const zip = account?.billingZip || crm.Billing_Code || ""
  const cityLine = [city, state].filter(Boolean).join(", ")
  const lastLine = [cityLine, zip].filter(Boolean).join(" ").trim()
  const lines = [street, lastLine].filter(Boolean)
  return { street, city, state, zip, lines, hasAddress: lines.length > 0 }
}

export function AccountSlideout({ accountId, onClose }: { accountId: string, onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"profile" | "communications" | "documents" | "financials" | "settings">("profile")
  const [account, setAccount] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [viewingDocType, setViewingDocType] = useState<"Invoice" | "SalesOrder" | "Quote" | null>(null)
  const [viewingInvoice, setViewingInvoice] = useState<any | null>(null)

  useEffect(() => {
    if (!accountId) return
    const fetchAccount = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/get-account-details?id=${encodeURIComponent(accountId)}`)
        const data = await res.json()
        if (data.success) {
          setAccount(data.account)
        } else {
          setError(data.error || "Failed to load account")
        }
      } catch (e) {
        console.error("Failed to load account details", e)
        setError("Network error -- could not load account")
      } finally {
        setLoading(false)
      }
    }
    fetchAccount()
  }, [accountId])

  // Calculate metrics
  const totalSales = account?.invoices?.reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0) || 0
  const openInvoices = account?.invoices?.filter((inv: any) => ['Sent', 'Overdue', 'Partially Paid'].includes(inv.status)) || []
  const outstandingBalance = openInvoices.reduce((sum: number, inv: any) => sum + (parseFloat(inv.balance_due || inv.balance || 0) || (inv.amount || 0)), 0) || 0
  const primaryContact = account?.contacts?.find((c: any) => c.isPrimary) || account?.contacts?.[0]
  const address = resolveAddress(account)
  const mapsUrl = address.hasAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.lines.join(", "))}`
    : null

  const tabs = [
    { id: "profile", label: "Profile" },
    { id: "communications", label: "Communications" },
    { id: "documents", label: "Documents" },
    { id: "financials", label: "Financials" },
    { id: "settings", label: "Settings" }
  ] as const

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose}></div>
      <div className="fixed top-0 right-0 h-full w-full max-w-4xl bg-[#0a0a0a] z-50 shadow-2xl border-l border-white/10 flex flex-col transform transition-transform duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#0f1013] shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white">{account?.name || "Loading Account..."}</h2>
            <div className="flex items-center gap-3 mt-0.5">
              {account?.zohoId && <p className="text-xs text-neutral-500">ID: {account.zohoId}</p>}
              {account && (
                <Link
                  href={`/account?id=${accountId}`}
                  className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 font-bold transition-colors"
                >
                  <FiExternalLink size={10} /> Open Full Account
                </Link>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 rounded-lg transition-colors">
            <FiX size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-4 border-b border-white/10 shrink-0 bg-[#0f1013] overflow-x-auto hide-scrollbar">
          {tabs.map(tab => (
            <button 
              key={tab.id}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-neutral-400 hover:text-white'}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto relative">
          {loading ? (
            <div className="p-6 space-y-5">
              {/* Loading skeleton */}
              <div className="space-y-3">
                <div className="h-5 w-48 bg-neutral-800 rounded animate-pulse" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 p-4 glass-panel/60 rounded-xl border border-white/10">
                    <div className="h-3 w-20 bg-neutral-800 rounded animate-pulse" />
                    <div className="h-4 w-36 bg-neutral-800 rounded animate-pulse" />
                    <div className="h-3 w-28 bg-neutral-800 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
              <FiAlertTriangle size={32} className="text-red-400" />
              <p className="text-sm text-neutral-400 text-center">{error}</p>
              <button
                onClick={() => {
                  setLoading(true)
                  setError(null)
                  fetch(`/api/get-account-details?id=${encodeURIComponent(accountId)}`)
                    .then(r => r.json())
                    .then(data => { if (data.success) setAccount(data.account); else setError(data.error || "Failed") })
                    .catch(() => setError("Network error"))
                    .finally(() => setLoading(false))
                }}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-bold rounded-lg transition-colors border border-white/10"
              >
                <FiRefreshCw size={14} /> Retry
              </button>
            </div>
          ) : (
            <div className="h-full">
              {activeTab === 'profile' && (
                <div className="p-6 space-y-8">
                  {/* Contact Info */}
                  <section>
                    <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <FiInfo /> Contact Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="glass-panel/50 p-4 rounded-xl border border-white/10 min-w-0">
                        <div className="flex items-center gap-3 text-white mb-2 min-w-0">
                          <FiUser className="text-emerald-500 shrink-0" />
                          <span className="font-semibold truncate">{[primaryContact?.firstName, primaryContact?.lastName].filter(Boolean).join(" ") || "No Contact Name"}</span>
                        </div>
                        <div className="flex items-center gap-3 text-neutral-400 text-sm mb-1 min-w-0">
                          <FiPhone className="text-neutral-500 shrink-0" />
                          {primaryContact?.phone || primaryContact?.mobilePhone ? (
                            <PhoneLink phone={primaryContact?.phone || primaryContact?.mobilePhone} className="hover:text-emerald-400 font-mono font-bold truncate" />
                          ) : (
                            <span className="text-neutral-500 italic">No Phone</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-neutral-400 text-sm min-w-0">
                          <FiMail className="text-neutral-500 shrink-0" />
                          <a href={`mailto:${primaryContact?.email}`} className="hover:text-emerald-400 hover:underline truncate">
                            {primaryContact?.email || 'No Email'}
                          </a>
                        </div>
                      </div>

                      {/* Billing Address */}
                      <div className="glass-panel/50 p-4 rounded-xl border border-white/10 min-w-0">
                        <div className="flex items-center justify-between gap-3 text-white mb-2 min-w-0">
                          <div className="flex items-center gap-3 min-w-0">
                            <FiMapPin className="text-emerald-500 shrink-0" />
                            <span className="font-semibold truncate">Billing Address</span>
                          </div>
                          {mapsUrl && (
                            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-400 hover:underline shrink-0">
                              Map
                            </a>
                          )}
                        </div>
                        {address.hasAddress ? (
                          <div className="text-sm text-neutral-300 leading-relaxed break-words">
                            {address.lines.map((line, i) => (
                              <div key={i}>{line}</div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-neutral-500 italic">No address on file</div>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'communications' && (
                <div className="h-full flex flex-col p-4 bg-[#0a0a0a]">
                  <CommunicationsHub
                    accountId={account?.zohoId || accountId}
                    account={account}
                  />
                </div>
              )}

              {activeTab === 'documents' && (
                <div className="h-full p-4 bg-[#0a0a0a]">
                  <DocumentFlipbook
                    invoices={account?.invoices || []}
                    quotes={account?.quotes || []}
                    salesOrders={account?.salesOrders || []}
                    onViewInvoice={(zohoId) => {
                      const inv = account?.invoices?.find((i: any) => i.zohoId === zohoId || i.id === zohoId) || { zohoId, id: zohoId };
                      setViewingInvoice(inv);
                      setViewingDocType("Invoice");
                    }}
                    onViewSalesDoc={(type, doc) => {
                      setViewingInvoice(doc);
                      setViewingDocType(type);
                    }}
                  />
                </div>
              )}

              {activeTab === 'financials' && (
                <div className="p-6 space-y-8">
                  {/* Metrics */}
                  <section>
                    <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <FiShoppingBag /> Buying History & Metrics
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="glass-panel/50 p-4 rounded-xl border border-white/10 flex flex-col items-center justify-center text-center">
                        <FiDollarSign className="text-emerald-500 text-2xl mb-2" />
                        <div className="text-2xl font-bold text-white">${totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-xs text-neutral-500 uppercase mt-1">Lifetime Value</div>
                      </div>
                      <div className="glass-panel/50 p-4 rounded-xl border border-white/10 flex flex-col items-center justify-center text-center">
                        <FiClock className="text-amber-500 text-2xl mb-2" />
                        <div className="text-2xl font-bold text-white">${outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-xs text-neutral-500 uppercase mt-1">Outstanding Balance</div>
                      </div>
                    </div>
                  </section>

                  {/* Order Builder */}
                  <section>
                    <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <FiFileText /> Create Quote / Order
                    </h3>
                    <div className="bg-[#0f1013] border border-white/10 rounded-xl overflow-hidden min-h-[400px]">
                      <OrderBuilder 
                        accountId={account?.zohoId || accountId} 
                        accountName={account?.name}
                        accountDetail={account}
                        onCancel={() => {}} 
                        onSuccess={() => {}}
                      />
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="p-6 space-y-8">
                  <section>
                    <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <FiSettings /> Account Settings
                    </h3>
                    <div className="glass-panel/50 p-4 rounded-xl border border-white/10 space-y-4">
                      <QualityPicker
                        zohoId={account?.zohoId || accountId}
                        accountId={account?.id || accountId}
                        currentQuality={account?.quality || "NEVER_STATUSED"}
                        onUpdated={(q) => setAccount((a: any) => ({ ...a, quality: q }))}
                      />
                    </div>
                  </section>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {viewingInvoice && viewingDocType && (
        <InvoiceDetailsModal
          invoice={viewingInvoice}
          type={viewingDocType}
          onClose={() => { setViewingInvoice(null); setViewingDocType(null); }}
        />
      )}
    </>
  )
}


