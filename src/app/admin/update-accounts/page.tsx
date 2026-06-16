"use client"

import { useZoho } from "@/components/ZohoProvider"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback, useRef } from "react"
import { FiTarget, FiAlertTriangle, FiArrowLeft, FiCheckCircle, FiX, FiSearch, FiShield } from "react-icons/fi"

export default function AdminUpdateAccountsPage() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [reassigningId, setReassigningId] = useState<string | null>(null)

  const [accounts, setAccounts] = useState<any[]>([])
  const [reps, setReps] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [pendingOwners, setPendingOwners] = useState<Record<string, string>>({})

  const [apiError, setApiError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const normalizedRole = currentUser?.role?.toLowerCase() || ""
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("collections") || normalizedRole.includes("manager")

  const fetchAccounts = useCallback(async (pageNum = 1, append = false, currentSearch = searchQuery) => {
    try {
      setApiError(null)
      const ts = Date.now()
      const query = currentUser?.id && !currentUser.id.includes("@")
        ? `zohoId=${currentUser.id}`
        : `email=${currentUser?.email}`
      const roleQuery = currentUser?.role ? `&role=${encodeURIComponent(currentUser.role)}` : ""
      const searchParam = currentSearch ? `&search=${encodeURIComponent(currentSearch)}` : ""
      
      const res = await fetch(`/api/get-accounts?${query}${roleQuery}&page=${pageNum}${searchParam}&includeDocs=true&statusFilter=Update Status&includeHidden=true&_t=${ts}`)
      const data = await res.json()

      if (data.success) {
        if (append) {
          setAccounts(prev => {
            const existingIds = new Set(prev.map(a => a.id))
            const newAccounts = data.accounts.filter((a: any) => !existingIds.has(a.id))
            return [...prev, ...newAccounts]
          })
        } else {
          setAccounts(data.accounts)
        }
        if (data.reps) setReps(data.reps)
        
        if (data.pagination?.hasMore && pageNum === 1) {
          autoLoadAllAccounts(data.pagination.totalCount, data.accounts.length, currentSearch)
        }
      } else {
        setApiError(data.error || data.message || "Failed to load accounts")
      }
    } catch (err: any) {
      setApiError(err.message || "Network error")
    } finally {
      setLoading(false)
    }
  }, [currentUser, searchQuery])

  const autoLoadRef = useRef(0)
  const autoLoadAllAccounts = async (totalCount: number, currentCount: number, currentSearch: string) => {
    autoLoadRef.current++
    const myId = autoLoadRef.current
    let loaded = currentCount
    let page = 2
    while (loaded < totalCount) {
      if (autoLoadRef.current !== myId) break // User searched or re-rendered
      try {
        const ts = Date.now()
        const query = currentUser?.id && !currentUser.id.includes("@") ? `zohoId=${currentUser.id}` : `email=${currentUser?.email}`
        const roleQuery = currentUser?.role ? `&role=${encodeURIComponent(currentUser.role)}` : ""
        const searchParam = currentSearch ? `&search=${encodeURIComponent(currentSearch)}` : ""
        const res = await fetch(`/api/get-accounts?${query}${roleQuery}&page=${page}${searchParam}&includeDocs=true&statusFilter=Update Status&includeHidden=true&_t=${ts}`)
        const data = await res.json()
        if (data.success && data.accounts) {
          setAccounts(prev => {
            const existingIds = new Set(prev.map(a => a.id))
            const newAccounts = data.accounts.filter((a: any) => !existingIds.has(a.id))
            return [...prev, ...newAccounts]
          })
          loaded += data.accounts.length
          if (!data.pagination?.hasMore) break
          page++
        } else {
          break
        }
      } catch (err) {
        break
      }
    }
  }

  useEffect(() => {
    if (!isInitialized) return
    if (!currentUser) {
      router.push("/login")
      return
    }
    if (isAdmin) {
      fetchAccounts()
    } else {
      setLoading(false)
    }
  }, [isInitialized, currentUser, router, isAdmin, fetchAccounts])

  // Handle auto-dismissing success messages
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(null), 5000)
      return () => clearTimeout(t)
    }
  }, [successMsg])

  const handleReassign = async (accountId: string, newOwnerId: string) => {
    setReassigningId(accountId)
    setApiError(null)
    setSuccessMsg(null)

    try {
      const res = await fetch("/api/update-account-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, newOwnerId })
      })
      const data = await res.json()
      
      if (data.success) {
        setSuccessMsg("Account successfully reassigned!")
        setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, ownerId: newOwnerId } : a))
        setPendingOwners(prev => {
          const next = { ...prev }
          delete next[accountId]
          return next
        })
      } else {
        setApiError(data.message || "Failed to reassign account")
      }
    } catch (err: any) {
      setApiError(err.message || "Network error")
    } finally {
      setReassigningId(null)
    }
  }

  // Calculate stats for table presentation
  const accountsWithStats = accounts.map(acc => {
    const invoices = acc.invoices || []
    let totalRev = 0
    let totalProf = 0
    invoices.forEach((inv: any) => {
      totalRev += parseFloat(inv.amount || "0")
      totalProf += parseFloat(inv.items?.profit || "0")
    })
    return { ...acc, totalRev, totalProf }
  })

  // Sort by Last Purchase Date ascending (oldest first) so they are the most "needy"
  accountsWithStats.sort((a, b) => {
    if (!a.lastPurchaseAt) return -1
    if (!b.lastPurchaseAt) return 1
    return new Date(a.lastPurchaseAt).getTime() - new Date(b.lastPurchaseAt).getTime()
  })

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    fetchAccounts(1, false, searchQuery)
  }

  if (!isInitialized || loading && accounts.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-neutral-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-neutral-400 font-medium text-sm">Loading Update Accounts...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center text-white font-sans" style={{ height: "100%" }}>
        <div className="text-center max-w-sm mx-auto px-4">
          <div className="w-16 h-16 rounded-2xl bg-red-950/40 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
            <FiShield size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-neutral-400 text-sm mb-6">
            You need administrator privileges to access this page.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl text-sm font-bold text-white transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col text-neutral-100 font-sans overflow-y-auto" style={{ height: "100%" }}>
      <main className="flex-1 px-4 sm:px-6 py-4 space-y-5 overflow-y-auto safe-bottom">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => router.push('/admin')}
              className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 transition"
            >
              <FiArrowLeft size={20} className="text-neutral-400" />
            </button>
            <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/30">
              <FiTarget size={20} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Update Accounts</h1>
              <p className="text-xs text-neutral-500">Manually reassign accounts marked as 'Update Status'</p>
            </div>
          </div>
        </div>

        {/* Feedback Messages */}
        {apiError && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm flex items-center gap-2 animate-in fade-in">
            <FiAlertTriangle size={16} className="shrink-0" />
            <span><strong>Error:</strong> {apiError}</span>
            <button onClick={() => setApiError(null)} className="ml-auto text-red-500 hover:text-red-300">
              <FiX size={14} />
            </button>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-3 text-emerald-400 text-sm flex items-center gap-2 animate-in fade-in">
            <FiCheckCircle size={16} className="shrink-0" />
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="ml-auto text-emerald-500 hover:text-emerald-300">
              <FiX size={14} />
            </button>
          </div>
        )}

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-lg overflow-hidden flex flex-col min-h-[500px]">
          
          <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-sm font-bold text-white">
              {accounts.length} Update Accounts Found
            </h2>
            <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-64">
              <FiSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search accounts..."
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
              />
            </form>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-950 text-[10px] uppercase tracking-wider text-neutral-500 font-bold border-b border-neutral-800">
                  <th className="px-4 py-3 sticky top-0 bg-neutral-950 z-10 w-1/4">Account Name</th>
                  <th className="px-4 py-3 sticky top-0 bg-neutral-950 z-10 text-right">Last Purchase</th>
                  <th className="px-4 py-3 sticky top-0 bg-neutral-950 z-10 text-right">Revenue</th>
                  <th className="px-4 py-3 sticky top-0 bg-neutral-950 z-10 text-right">Profit</th>
                  <th className="px-4 py-3 sticky top-0 bg-neutral-950 z-10 w-1/3">Assign To</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-neutral-800">
                {accountsWithStats.map(acc => (
                  <tr key={acc.id} className="hover:bg-neutral-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-white truncate max-w-[200px] sm:max-w-[300px]" title={acc.name}>
                        {acc.name}
                      </div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">{acc.industry || "No Industry"}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-300 whitespace-nowrap">
                      {acc.lastPurchaseAt ? new Date(acc.lastPurchaseAt).toLocaleDateString() : "Never"}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-300 whitespace-nowrap font-mono">
                      ${acc.totalRev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-300 whitespace-nowrap font-mono">
                      ${acc.totalProf.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        {reassigningId === acc.id ? (
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
                            <span className="text-xs text-purple-400 font-bold">Assigning...</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <select
                                value={pendingOwners[acc.id] !== undefined ? pendingOwners[acc.id] : (acc.ownerId || "")}
                                onChange={(e) => {
                                  setPendingOwners({ ...pendingOwners, [acc.id]: e.target.value })
                                }}
                                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-purple-500 transition-colors appearance-none cursor-pointer hover:border-neutral-600 pr-8"
                              >
                                <option value="" disabled>Select Owner</option>
                                {reps.map(rep => (
                                  <option key={rep.id} value={rep.id}>{rep.name} ({rep.role})</option>
                                ))}
                              </select>
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                                ▼
                              </div>
                            </div>
                            {pendingOwners[acc.id] !== undefined && pendingOwners[acc.id] !== acc.ownerId && (
                              <button
                                onClick={() => handleReassign(acc.id, pendingOwners[acc.id])}
                                className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                              >
                                Save
                              </button>
                            )}
                          </div>
                        )}
                        <span className="text-[10px] text-neutral-500 leading-tight">
                          Current: {reps.find(r => r.id === acc.ownerId)?.name || "Unknown Owner"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
                {accountsWithStats.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-neutral-500 text-sm">
                      No update accounts found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  )
}
