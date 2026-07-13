"use client"

import { useZoho } from "@/components/ZohoProvider"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { FiTarget, FiAlertTriangle, FiArrowLeft, FiCheckCircle, FiX, FiSearch, FiArrowUp, FiArrowDown, FiCheckSquare, FiSquare, FiUsers } from "react-icons/fi"

type SortKey = "name" | "lastPurchaseAt" | "totalRev" | "totalProf" | "owner"
type SortDir = "asc" | "desc"

export default function AdminUpdateAccountsPage() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [reassigningId, setReassigningId] = useState<string | null>(null)
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 })

  const [accounts, setAccounts] = useState<any[]>([])
  const [reps, setReps] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [localSearch, setLocalSearch] = useState("")
  const [pendingOwners, setPendingOwners] = useState<Record<string, string>>({})

  // Sort & Filter
  const [sortKey, setSortKey] = useState<SortKey>("lastPurchaseAt")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [ownerFilter, setOwnerFilter] = useState("All")

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkOwnerId, setBulkOwnerId] = useState("")

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
      if (autoLoadRef.current !== myId) break
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
    fetchAccounts()
  }, [fetchAccounts])

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

  // Bulk reassign
  const handleBulkReassign = async () => {
    if (!bulkOwnerId || selectedIds.size === 0) return
    setBulkAssigning(true)
    setApiError(null)
    setBulkProgress({ done: 0, total: selectedIds.size })
    const ids = Array.from(selectedIds)
    let successes = 0
    let failures = 0

    for (let i = 0; i < ids.length; i++) {
      try {
        const res = await fetch("/api/update-account-owner", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: ids[i], newOwnerId: bulkOwnerId })
        })
        const data = await res.json()
        if (data.success) {
          successes++
          setAccounts(prev => prev.map(a => a.id === ids[i] ? { ...a, ownerId: bulkOwnerId } : a))
        } else {
          failures++
        }
      } catch {
        failures++
      }
      setBulkProgress({ done: i + 1, total: ids.length })
    }

    setBulkAssigning(false)
    setSelectedIds(new Set())
    setBulkOwnerId("")
    if (failures === 0) {
      setSuccessMsg(`${successes} account${successes > 1 ? "s" : ""} reassigned successfully!`)
    } else {
      setApiError(`${successes} succeeded, ${failures} failed`)
    }
  }

  // Compute stats
  const accountsWithStats = useMemo(() => accounts.map(acc => {
    const invoices = acc.invoices || []
    let totalRev = 0
    let totalProf = 0
    invoices.forEach((inv: any) => {
      totalRev += parseFloat(inv.amount || "0")
      totalProf += parseFloat(inv.items?.profit || "0")
    })
    return { ...acc, totalRev, totalProf }
  }), [accounts])

  // Filter
  const filtered = useMemo(() => {
    let result = accountsWithStats
    if (ownerFilter !== "All") {
      result = result.filter(a => a.ownerId === ownerFilter)
    }
    if (localSearch) {
      const q = localSearch.toLowerCase()
      result = result.filter(a => a.name?.toLowerCase().includes(q))
    }
    return result
  }, [accountsWithStats, ownerFilter, localSearch])

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "name":
          cmp = (a.name || "").localeCompare(b.name || "")
          break
        case "lastPurchaseAt":
          const aDate = a.lastPurchaseAt ? new Date(a.lastPurchaseAt).getTime() : 0
          const bDate = b.lastPurchaseAt ? new Date(b.lastPurchaseAt).getTime() : 0
          cmp = aDate - bDate
          break
        case "totalRev":
          cmp = a.totalRev - b.totalRev
          break
        case "totalProf":
          cmp = a.totalProf - b.totalProf
          break
        case "owner":
          const aOwner = reps.find(r => r.id === a.ownerId)?.name || ""
          const bOwner = reps.find(r => r.id === b.ownerId)?.name || ""
          cmp = aOwner.localeCompare(bOwner)
          break
      }
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir, reps])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="text-neutral-700 ml-1">↕</span>
    return sortDir === "asc"
      ? <FiArrowUp size={11} className="ml-1 text-purple-400 inline" />
      : <FiArrowDown size={11} className="ml-1 text-purple-400 inline" />
  }

  // Selection helpers
  const allVisibleSelected = sorted.length > 0 && sorted.every(a => selectedIds.has(a.id))
  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sorted.map(a => a.id)))
    }
  }
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Unique owners for filter
  const uniqueOwners = useMemo(() => {
    const ownerIds = new Set(accountsWithStats.map(a => a.ownerId).filter(Boolean))
    return reps.filter(r => ownerIds.has(r.id))
  }, [accountsWithStats, reps])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    fetchAccounts(1, false, searchQuery)
  }

  return (
    <div className="flex flex-col text-neutral-100 font-sans h-full bg-[#0f1013]">
      <main className="flex-1 px-4 sm:px-6 py-6 space-y-5 overflow-y-auto safe-bottom">
        
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

        {/* Bulk Assign Bar */}
        {selectedIds.size > 0 && (
          <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-3 flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-purple-300">
              <FiCheckSquare size={14} className="inline mr-1.5" />
              {selectedIds.size} selected
            </span>
            <select
              value={bulkOwnerId}
              onChange={e => setBulkOwnerId(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 appearance-none cursor-pointer"
            >
              <option value="">Assign to...</option>
              {reps.map(rep => (
                <option key={rep.id} value={rep.id}>{rep.name} ({rep.role})</option>
              ))}
            </select>
            <button
              onClick={handleBulkReassign}
              disabled={!bulkOwnerId || bulkAssigning}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkAssigning ? `Assigning ${bulkProgress.done}/${bulkProgress.total}...` : `Reassign ${selectedIds.size} Accounts`}
            </button>
            <button
              onClick={() => { setSelectedIds(new Set()); setBulkOwnerId("") }}
              className="text-xs text-neutral-400 hover:text-white transition-colors ml-auto"
            >
              Clear Selection
            </button>
            {bulkAssigning && (
              <div className="w-full mt-1 bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%` }}
                />
              </div>
            )}
          </div>
        )}

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-lg overflow-hidden flex flex-col min-h-[500px]">
          
          {/* Toolbar: Count + Search + Filter */}
          <div className="p-4 border-b border-neutral-800 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-white">
                {sorted.length}{sorted.length !== accountsWithStats.length ? ` of ${accountsWithStats.length}` : ""} Update Accounts
              </h2>
              <div className="flex items-center gap-2">
                {/* Instant local filter */}
                <div className="relative w-full sm:w-56">
                  <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="text"
                    value={localSearch}
                    onChange={e => setLocalSearch(e.target.value)}
                    placeholder="Filter by name..."
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
                  />
                  {localSearch && (
                    <button onClick={() => setLocalSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white">
                      <FiX size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
            {/* Owner filter tabs */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setOwnerFilter("All")}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  ownerFilter === "All" ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "bg-neutral-800 text-neutral-500 border border-neutral-700 hover:text-neutral-300"
                }`}
              >
                All Owners
              </button>
              {uniqueOwners.map(rep => (
                <button
                  key={rep.id}
                  onClick={() => setOwnerFilter(ownerFilter === rep.id ? "All" : rep.id)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    ownerFilter === rep.id ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "bg-neutral-800 text-neutral-500 border border-neutral-700 hover:text-neutral-300"
                  }`}
                >
                  {rep.name?.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-950 text-[10px] uppercase tracking-wider text-neutral-500 font-bold border-b border-neutral-800">
                  <th className="px-3 py-3 sticky top-0 bg-neutral-950 z-10 w-10">
                    <button onClick={toggleSelectAll} className="text-neutral-400 hover:text-white transition-colors">
                      {allVisibleSelected && sorted.length > 0 ? <FiCheckSquare size={14} className="text-purple-400" /> : <FiSquare size={14} />}
                    </button>
                  </th>
                  <th className="px-3 py-3 sticky top-0 bg-neutral-950 z-10 cursor-pointer hover:text-neutral-300 select-none" onClick={() => handleSort("name")}>
                    Account Name <SortIcon col="name" />
                  </th>
                  <th className="px-3 py-3 sticky top-0 bg-neutral-950 z-10 text-right cursor-pointer hover:text-neutral-300 select-none" onClick={() => handleSort("lastPurchaseAt")}>
                    Last Purchase <SortIcon col="lastPurchaseAt" />
                  </th>
                  <th className="px-3 py-3 sticky top-0 bg-neutral-950 z-10 text-right cursor-pointer hover:text-neutral-300 select-none" onClick={() => handleSort("totalRev")}>
                    Revenue <SortIcon col="totalRev" />
                  </th>
                  <th className="px-3 py-3 sticky top-0 bg-neutral-950 z-10 text-right cursor-pointer hover:text-neutral-300 select-none" onClick={() => handleSort("totalProf")}>
                    Profit <SortIcon col="totalProf" />
                  </th>
                  <th className="px-3 py-3 sticky top-0 bg-neutral-950 z-10 w-1/3 cursor-pointer hover:text-neutral-300 select-none" onClick={() => handleSort("owner")}>
                    Assign To <SortIcon col="owner" />
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-neutral-800">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      <span className="text-neutral-500 text-xs">Loading accounts...</span>
                    </td>
                  </tr>
                ) : sorted.map(acc => {
                  const isSelected = selectedIds.has(acc.id)
                  return (
                  <tr key={acc.id} className={`transition-colors ${isSelected ? "bg-purple-950/20" : "hover:bg-neutral-800/50"}`}>
                    <td className="px-3 py-3">
                      <button onClick={() => toggleSelect(acc.id)} className="text-neutral-400 hover:text-white transition-colors">
                        {isSelected ? <FiCheckSquare size={14} className="text-purple-400" /> : <FiSquare size={14} />}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-white truncate max-w-[200px] sm:max-w-[300px]" title={acc.name}>
                        {acc.name}
                      </div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">{acc.industry || "No Industry"}</div>
                    </td>
                    <td className="px-3 py-3 text-right text-neutral-300 whitespace-nowrap">
                      {acc.lastPurchaseAt ? new Date(acc.lastPurchaseAt).toLocaleDateString() : "Never"}
                    </td>
                    <td className="px-3 py-3 text-right text-neutral-300 whitespace-nowrap font-mono">
                      ${acc.totalRev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-3 text-right text-neutral-300 whitespace-nowrap font-mono">
                      ${acc.totalProf.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-3">
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
                )})}
                {sorted.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-500 text-sm">
                      No accounts found{localSearch || ownerFilter !== "All" ? " matching filters" : ""}.
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
