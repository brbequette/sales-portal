"use client"

import { useSearchParams } from "next/navigation"
import { Suspense, useState, useEffect } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { AccountHistory } from "@/components/AccountHistory"
import { SalesAssistant } from "@/components/SalesAssistant"
import { CommunicationCenter } from "@/components/CommunicationCenter"
import { InvoiceFlipbook } from "@/components/InvoiceFlipbook"
import { PointOfSale } from "@/components/PointOfSale"
import Link from "next/link"

function AccountHubContent() {
  const searchParams = useSearchParams()
  const id = searchParams.get("id") || ""
  const { isInitialized, zohoContext } = useZoho()
  const [account, setAccount] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showPos, setShowPos] = useState(false)

  useEffect(() => {
    if (!id) return
    const fetchAccountData = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/get-account-details?id=${encodeURIComponent(id)}`)
        const data = await res.json()
        if (data.success) {
          setAccount(data.account)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchAccountData()
  }, [id])

  if (loading) return <div className="p-8 text-(--foreground) animate-pulse">Loading account data...</div>
  if (!account) return <div className="p-8 text-(--foreground)">Account not found.</div>

  // Analytics Calculations
  const invoices = account.invoices || []
  const totalRevenue = invoices.reduce((sum: number, inv: any) => sum + parseFloat(inv.amount || 0), 0)
  const avgOrderValue = invoices.length ? (totalRevenue / invoices.length).toFixed(2) : 0
  const daysSinceLastPurchase = account.lastPurchaseAt 
    ? Math.floor((new Date().getTime() - new Date(account.lastPurchaseAt).getTime()) / (1000 * 3600 * 24))
    : 'N/A'

  return (
    <div className="min-h-screen bg-(--background) text-(--foreground) flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="shrink-0 p-4 border-b border-(--border) flex items-center justify-between bg-(--card)">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-(--primary) transition-colors">
             &larr; Back to Dashboard
          </Link>
          <div className="h-6 w-px bg-(--border)"></div>
          <div>
            <h1 className="text-2xl font-bold">{account.name}</h1>
            <div className="flex items-center gap-2 text-sm mt-1">
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                account.status === 'Update Status' ? 'bg-(--warning)/20 text-(--warning)' : 'bg-(--success)/20 text-(--success)'
              }`}>
                {account.status}
              </span>
              <span className="text-gray-400">&bull; {account.industry}</span>
            </div>
          </div>
        </div>
        <div className="text-sm text-gray-400">
          Last Purchase: {account.lastPurchaseAt ? new Date(account.lastPurchaseAt).toLocaleDateString() : 'None'}
        </div>
      </header>

      {/* Account Analysis Indicators */}
      <div className="bg-black/30 border-b border-(--border) p-4 flex gap-8 px-6">
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">Lifetime Value</span>
          <div className="text-lg font-bold text-green-400">${totalRevenue.toLocaleString()}</div>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">Avg Order Value</span>
          <div className="text-lg font-bold text-blue-400">${avgOrderValue.toLocaleString()}</div>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">Days Since Last Order</span>
          <div className={`text-lg font-bold ${typeof daysSinceLastPurchase === 'number' && daysSinceLastPurchase > 365 ? 'text-(--danger)' : 'text-purple-400'}`}>
            {daysSinceLastPurchase}
          </div>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">Open Quotes</span>
          <div className="text-lg font-bold text-white">{account.quotes?.length || 0}</div>
        </div>
      </div>

      {/* Main Side-by-Side Layout */}
      <main className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left Panel: Account Details & History (7 columns) */}
        <section className="col-span-1 lg:col-span-7 border-r border-(--border) overflow-y-auto p-6 scrollbar-thin space-y-8">
          <div>
            <h2 className="text-xl font-bold mb-4 text-(--primary) flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              Invoice Flipbook
            </h2>
            <InvoiceFlipbook invoices={account.invoices} />
          </div>
          <AccountHistory accountId={id} />
        </section>

        {/* Right Panel: AI Assistant & Communication (5 columns) */}
        <section className="col-span-1 lg:col-span-5 flex flex-col bg-(--card)/30">
          {/* Top Half: Sales Assistant & Orders */}
          <div className="flex-1 border-b border-(--border) overflow-y-auto p-6 scrollbar-thin flex flex-col gap-6">
            <SalesAssistant accountId={id} accountData={{...account, invoices, daysSinceLastPurchase, totalRevenue}} />
            
            <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 p-6 rounded-lg border border-blue-500/30 text-center">
               <h3 className="text-xl font-bold text-white mb-2">Ready to close the deal?</h3>
               <p className="text-sm text-blue-200 mb-4">Launch the POS to build a quote or process a sales order instantly.</p>
               <button 
                 onClick={() => setShowPos(true)}
                 className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-full font-bold shadow-lg shadow-blue-500/20 transition-all hover:scale-105"
               >
                 Launch Point of Sale
               </button>
            </div>
          </div>
          
          {/* Bottom Half: Communication Center */}
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            <CommunicationCenter accountId={id} />
          </div>
        </section>
      </main>

      {showPos && <PointOfSale accountId={id} onCancel={() => setShowPos(false)} />}
    </div>
  )
}

export default function AccountHub() {
  return (
    <Suspense fallback={<div className="p-8 text-(--foreground)">Loading account...</div>}>
      <AccountHubContent />
    </Suspense>
  )
}
