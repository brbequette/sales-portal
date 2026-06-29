"use client"

import { useState, useEffect } from "react"
import { FiX, FiUser, FiPhone, FiMail, FiDollarSign, FiClock, FiShoppingBag, FiInfo } from "react-icons/fi"
import { PointOfSale } from "@/components/PointOfSale"

export function AccountSlideout({ accountId, onClose }: { accountId: string, onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"overview" | "pos">("overview")
  const [account, setAccount] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!accountId) return
    const fetchAccount = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/get-account-details?id=${encodeURIComponent(accountId)}`)
        const data = await res.json()
        if (data.success) {
          setAccount(data.account)
        }
      } catch (e) {
        console.error("Failed to load account details", e)
      } finally {
        setLoading(false)
      }
    }
    fetchAccount()
  }, [accountId])

  // Calculate metrics
  const totalSales = account?.invoices?.reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0) || 0
  const openInvoices = account?.invoices?.filter((inv: any) => ['Sent', 'Overdue', 'Partially Paid'].includes(inv.status)) || []
  const outstandingBalance = openInvoices.reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0) || 0
  const primaryContact = account?.contacts?.find((c: any) => c.isPrimary) || account?.contacts?.[0]

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose}></div>
      <div className="fixed top-0 right-0 h-full w-full max-w-2xl bg-[#0a0a0a] z-50 shadow-2xl border-l border-white/10 flex flex-col transform transition-transform duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#0f1013] shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white">{account?.name || "Loading Account..."}</h2>
            {account?.zohoId && <p className="text-xs text-neutral-500">ID: {account.zohoId}</p>}
          </div>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
            <FiX size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-4 border-b border-white/10 shrink-0 bg-[#0f1013]">
          <button 
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'overview' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-neutral-400 hover:text-white'}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview & Metrics
          </button>
          <button 
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'pos' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-neutral-400 hover:text-white'}`}
            onClick={() => setActiveTab('pos')}
          >
            Create Quote / Order
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-neutral-500">Loading details...</div>
          ) : (
            <div className="h-full">
              {activeTab === 'overview' && (
                <div className="p-6 space-y-8">
                  
                  {/* Contact Info */}
                  <section>
                    <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <FiInfo /> Contact Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-neutral-900/50 p-4 rounded-xl border border-white/5">
                        <div className="flex items-center gap-3 text-white mb-2">
                          <FiUser className="text-emerald-500" />
                          <span className="font-semibold">{primaryContact?.firstName} {primaryContact?.lastName}</span>
                        </div>
                        <div className="flex items-center gap-3 text-neutral-400 text-sm mb-1">
                          <FiPhone className="text-neutral-500" />
                          <a href={`callto:${primaryContact?.phone || primaryContact?.mobilePhone}`} className="hover:text-emerald-400 hover:underline">
                            {primaryContact?.phone || primaryContact?.mobilePhone || 'No Phone'}
                          </a>
                        </div>
                        <div className="flex items-center gap-3 text-neutral-400 text-sm">
                          <FiMail className="text-neutral-500" />
                          <a href={`mailto:${primaryContact?.email}`} className="hover:text-emerald-400 hover:underline">
                            {primaryContact?.email || 'No Email'}
                          </a>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Metrics */}
                  <section>
                    <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <FiShoppingBag /> Buying History & Metrics
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-neutral-900/50 p-4 rounded-xl border border-white/5 flex flex-col items-center justify-center text-center">
                        <FiDollarSign className="text-emerald-500 text-2xl mb-2" />
                        <div className="text-2xl font-bold text-white">${totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-xs text-neutral-500 uppercase mt-1">Lifetime Value</div>
                      </div>
                      <div className="bg-neutral-900/50 p-4 rounded-xl border border-white/5 flex flex-col items-center justify-center text-center">
                        <FiClock className="text-amber-500 text-2xl mb-2" />
                        <div className="text-2xl font-bold text-white">${outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-xs text-neutral-500 uppercase mt-1">Outstanding Balance</div>
                      </div>
                    </div>
                  </section>

                  {/* Recent Activity Summary */}
                  <section>
                    <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <FiClock /> Recent Invoices
                    </h3>
                    <div className="space-y-2">
                      {account?.invoices?.slice(0, 5).map((inv: any) => (
                        <div key={inv.id} className="flex items-center justify-between p-3 bg-neutral-900/30 rounded-lg border border-white/5">
                          <div>
                            <div className="text-sm font-bold text-white">{new Date(inv.issueDate).toLocaleDateString()}</div>
                            <div className="text-xs text-neutral-500">{inv.status}</div>
                          </div>
                          <div className="text-sm font-bold text-white">
                            ${(inv.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      ))}
                      {(!account?.invoices || account.invoices.length === 0) && (
                        <div className="text-sm text-neutral-500 italic">No recent invoices found.</div>
                      )}
                    </div>
                  </section>

                </div>
              )}

              {activeTab === 'pos' && (
                <div className="h-full bg-[#0a0a0a]">
                  <PointOfSale 
                    accountId={account?.zohoId || accountId} 
                    onCancel={() => setActiveTab('overview')} 
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
