"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { FiArrowLeft, FiSearch, FiUser, FiRefreshCw, FiX, FiCheckSquare, FiTruck, FiClipboard, FiExternalLink } from "react-icons/fi"
import { StandaloneOrderBuilder } from "@/components/StandaloneOrderBuilder"
import type { OrderCreationResult } from "@/components/OrderBuilder"
import { DocumentPopoutContent } from "@/components/DocumentPopoutContent"

interface Account {
  id: string
  zohoId: string
  crmAccountId?: string
  booksCustomerId?: string
  name: string
  status?: string
  timeZone?: string
  billingStreet?: string
  billingCity?: string
  billingState?: string
  billingZip?: string
  shippingStreet?: string
  shippingCity?: string
  shippingState?: string
  shippingZip?: string
}

export default function StandalonePosPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [lastCreatedDocument, setLastCreatedDocument] = useState<OrderCreationResult | null>(null)
  const [showDocumentActions, setShowDocumentActions] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch accounts when search query changes (debounced)
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setAccounts([])
      return
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)

    searchTimeoutRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/get-accounts?search=${encodeURIComponent(searchQuery)}&ownerIdFilter=all&limit=20`)
        const data = await res.json()
        if (data.success && Array.isArray(data.accounts)) {
          setAccounts(data.accounts)
        }
      } catch (err) {
        console.error("Failed to search accounts:", err)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [searchQuery])

  const handleSelectAccount = (account: Account) => {
    setSelectedAccount(account)
    setLastCreatedDocument(null)
    setShowDocumentActions(false)
    setSearchQuery("")
    setAccounts([])
  }

  const handleClearSelection = () => {
    setSelectedAccount(null)
    setLastCreatedDocument(null)
    setShowDocumentActions(false)
  }

  return (
    <div className="page-content">
      {/* ─── Header ─────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link
            href="/sales"
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors shrink-0"
            title="Back to Sales"
          >
            <FiArrowLeft size={16} />
          </Link>
          <div className="w-9 h-9 bg-violet-500/10 border border-violet-500/20 rounded-xl flex items-center justify-center">
            <FiUser className="text-violet-400" size={17} />
          </div>
          <div>
            <h1 className="page-title">POS Terminal</h1>
            <p className="page-subtitle">Dedicated Point of Sale order builder and transaction checkout</p>
          </div>
        </div>
        {selectedAccount && (
          <div className="flex flex-wrap items-center gap-3 bg-violet-500/10 border border-violet-500/30 px-4 py-2 rounded-xl">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 text-violet-400 flex items-center justify-center">
              <FiUser size={16} />
            </div>
            <div>
              <div className="text-xs font-bold text-white leading-none mb-0.5">{selectedAccount.name}</div>
              <div className="text-[10px] text-neutral-400 font-mono leading-none">
                CRM: {selectedAccount.crmAccountId || "Not mapped"} · Books: {selectedAccount.booksCustomerId || "Not mapped"}
              </div>
            </div>
            <Link
              href={`/tasks/new?accountId=${encodeURIComponent(selectedAccount.id)}&accountName=${encodeURIComponent(selectedAccount.name)}`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <FiCheckSquare size={12} /> Add follow-up task
            </Link>
            <button
              onClick={handleClearSelection}
              className="text-neutral-400 hover:text-white transition-colors"
              title="Change Account"
            >
              <FiX size={16} />
            </button>
          </div>
        )}
      </div>

      {/* ─── Body ───────────────────────────────────── */}
      <div className="page-body animate-fade-in">

      {/* Main Panel */}
      <div className="flex-1 flex flex-col min-h-0">
        {!selectedAccount ? (
          /* Account Selector View */
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-lg space-y-6 text-center">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">Select a Customer Account</h2>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Search by account/client name. Once selected, you'll be able to build quotes and invoices.
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative group">
                <div className="absolute inset-0 bg-violet-500/10 rounded-2xl blur-md group-focus-within:bg-violet-500/20 transition-all"></div>
                <div className="relative flex items-center bg-neutral-900 border border-white/10 group-focus-within:border-violet-500/50 rounded-2xl px-4 py-3.5 transition-all">
                  <FiSearch className="text-neutral-400 group-focus-within:text-violet-400 transition-colors mr-3" size={20} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Type client name to search..."
                    className="w-full bg-transparent text-white text-sm focus:outline-none placeholder-neutral-500"
                  />
                  {loading && (
                    <FiRefreshCw className="animate-spin text-violet-400 ml-2" size={16} />
                  )}
                </div>
              </div>

              {/* Search Results Dropdown/List */}
              {accounts.length > 0 && (
                <div className="border border-white/10 rounded-2xl bg-neutral-900/90 divide-y divide-white/5 max-h-72 overflow-y-auto text-left shadow-2xl backdrop-blur-md">
                  {accounts.map((acc) => (
                    <button
                      key={acc.id}
                      onClick={() => handleSelectAccount(acc)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors text-xs text-neutral-300"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded bg-white/5 flex items-center justify-center text-neutral-400">
                          <FiUser size={14} />
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm leading-tight mb-0.5">{acc.name}</div>
                          <div className="text-[10px] text-neutral-500 leading-none">
                            {acc.billingCity ? `${acc.billingCity}, ${acc.billingState || ''}` : 'No address'}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[9px] text-neutral-600 bg-neutral-950 px-2 py-0.5 rounded border border-white/5">
                        {acc.crmAccountId ? `CRM ${acc.crmAccountId}` : acc.id}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.trim().length >= 2 && accounts.length === 0 && !loading && (
                <div className="text-xs text-neutral-500 italic p-4 bg-white/[0.01] rounded-2xl border border-white/5">
                  No accounts found matching "{searchQuery}"
                </div>
              )}
            </div>
          </div>
        ) : (
          /* OrderBuilder View */
          <div className="flex-1 flex flex-col min-h-0 gap-4 bg-white/[0.01] border border-white/10 rounded-2xl p-5 shadow-inner">
            {lastCreatedDocument && (
              <section className="rounded-2xl border border-emerald-500/30 bg-emerald-950/15 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-400">Created successfully</p>
                    <h2 className="mt-1 text-base font-black text-white">
                      {lastCreatedDocument.type === "SalesOrder" ? "Sales order" : "Estimate"} {lastCreatedDocument.documentNumber || "created"}
                    </h2>
                    <p className="mt-1 text-xs text-neutral-400">The customer stays selected so you can continue without searching again.</p>
                  </div>
                  <button type="button" onClick={() => setLastCreatedDocument(null)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-neutral-300 hover:bg-white/10 hover:text-white">
                    Build another document
                  </button>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <button type="button" disabled={!lastCreatedDocument.booksId} onClick={() => setShowDocumentActions(true)} className="td-btn td-btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-40"><FiClipboard /> Open document actions</button>
                  <Link href="/shipping" className="td-btn td-btn-ghost justify-center"><FiTruck /> Fulfillment &amp; shipping</Link>
                  <Link href={`/tasks/new?accountId=${encodeURIComponent(selectedAccount.id)}&accountName=${encodeURIComponent(selectedAccount.name)}`} className="td-btn td-btn-ghost justify-center"><FiCheckSquare /> Add follow-up</Link>
                  <Link href={`/account?id=${encodeURIComponent(selectedAccount.id)}`} className="td-btn td-btn-ghost justify-center"><FiExternalLink /> Account workspace</Link>
                </div>
                <p className="mt-3 text-[10px] text-neutral-500">Conversion, invoicing, payment, dropship PO, package, and label actions remain in their established review screens so every provider write shows its exact confirmation and outcome.</p>
              </section>
            )}
            <StandaloneOrderBuilder
              accountId={selectedAccount.id}
              accountName={selectedAccount.name}
              accountDetail={selectedAccount}
              onCancel={handleClearSelection}
              onSuccess={result => setLastCreatedDocument(result || null)}
            />
          </div>
        )}
      </div>
      {showDocumentActions && lastCreatedDocument?.booksId && createPortal(
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
          <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.2em] text-violet-400">POS lifecycle actions</p>
                <p className="text-sm font-bold text-white">{lastCreatedDocument.documentNumber || lastCreatedDocument.booksId}</p>
              </div>
              <button type="button" onClick={() => setShowDocumentActions(false)} className="rounded-lg border border-white/10 bg-white/5 p-2 text-neutral-400 hover:bg-white/10 hover:text-white" aria-label="Close document actions"><FiX size={18} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DocumentPopoutContent
                entityId={lastCreatedDocument.booksId}
                entityType={lastCreatedDocument.type === "SalesOrder" ? "salesorder" : "quote"}
                onClose={() => setShowDocumentActions(false)}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
    </div>
  )
}
