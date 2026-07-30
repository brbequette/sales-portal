"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { FiArrowLeft, FiSearch, FiUser, FiInfo, FiRefreshCw, FiX } from "react-icons/fi"
import { StandaloneOrderBuilder } from "@/components/StandaloneOrderBuilder"

interface Account {
  id: string
  zohoId: string
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
    setSearchQuery("")
    setAccounts([])
  }

  const handleClearSelection = () => {
    setSelectedAccount(null)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/sales" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors">
            <FiArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">POS Terminal</h1>
            <p className="text-neutral-400 text-xs">Dedicated Point of Sale order builder and transaction checkout.</p>
          </div>
        </div>
        {selectedAccount && (
          <div className="flex items-center gap-3 bg-violet-500/10 border border-violet-500/30 px-4 py-2 rounded-xl">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 text-violet-400 flex items-center justify-center">
              <FiUser size={16} />
            </div>
            <div>
              <div className="text-xs font-bold text-white leading-none mb-0.5">{selectedAccount.name}</div>
              <div className="text-[10px] text-neutral-400 font-mono leading-none">Zoho ID: {selectedAccount.zohoId}</div>
            </div>
            <button 
              onClick={handleClearSelection}
              className="ml-2 text-neutral-400 hover:text-white transition-colors"
              title="Change Account"
            >
              <FiX size={16} />
            </button>
          </div>
        )}
      </div>

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
                        {acc.zohoId}
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
          <div className="flex-1 flex flex-col min-h-0 bg-white/[0.01] border border-white/10 rounded-2xl p-5 shadow-inner">
            <StandaloneOrderBuilder
              accountId={selectedAccount.zohoId}
              accountName={selectedAccount.name}
              accountDetail={selectedAccount}
              onCancel={handleClearSelection}
              onSuccess={handleClearSelection}
            />
          </div>
        )}
      </div>
    </div>
  )
}
