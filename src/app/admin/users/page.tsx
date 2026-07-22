"use client"


import { useState, useEffect, useMemo, useCallback } from "react"
import { FiCheckSquare, FiSquare, FiUser, FiShield, FiChevronDown, FiChevronUp, FiCheck, FiX, FiToggleLeft, FiToggleRight, FiSave, FiUserPlus, FiEdit3, FiSearch, FiArrowUp, FiArrowDown, FiRefreshCw, FiUsers, FiZap, FiEye, FiEyeOff } from "react-icons/fi"
import { PERMISSION_GROUPS, ALL_PERMISSIONS, DEFAULT_REP_PERMISSIONS, resolvePermissions, type UserPermissions } from "@/lib/permissions"
import { toast } from 'react-hot-toast';

type SortField = "name" | "email" | "role" | "accountCount"
type SortDir = "asc" | "desc"
type RoleFilter = "All" | "Admin" | "Sales Representative"

interface AccountItem {
  id: string
  name: string
  owner?: { id: string; name: string; email: string } | null
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [savingUser, setSavingUser] = useState<string | null>(null)
  const [editedPermissions, setEditedPermissions] = useState<Record<string, UserPermissions>>({})
  const [showAddUser, setShowAddUser] = useState(false)
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "Sales Representative", zohoId: "" })
  const [addingUser, setAddingUser] = useState(false)
  const [addError, setAddError] = useState("")
  const [editedUserInfo, setEditedUserInfo] = useState<Record<string, { name: string; email: string; zohoId: string; role: string }>>({})

  // New state for search, sort, filter
  const [searchQuery, setSearchQuery] = useState("")
  const [sortField, setSortField] = useState<SortField>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("All")

  // Assign accounts modal state
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignUserId, setAssignUserId] = useState<string | null>(null)
  const [allAccounts, setAllAccounts] = useState<AccountItem[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [accountSearchQuery, setAccountSearchQuery] = useState("")
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set())
  const [assigning, setAssigning] = useState(false)
  const [assignProgress, setAssignProgress] = useState({ done: 0, total: 0, errors: [] as string[] })
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState("")
  const [visibleReps, setVisibleReps] = useState<string[]>([])

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      if (data.success) setUsers(data.users || [])
    } catch {}
  }

  const fetchVisibleReps = async () => {
    try {
      const res = await fetch('/api/get-update-config')
      const data = await res.json()
      if (data.success && data.config?.visibleReps) {
        setVisibleReps(data.config.visibleReps)
      }
    } catch {}
  }

  useEffect(() => {
    Promise.all([fetchUsers(), fetchVisibleReps()]).finally(() => setLoading(false))
  }, [])

  const syncFromZoho = async () => {
    setSyncing(true)
    setSyncMessage("")
    try {
      const res = await fetch('/api/get-accounts?refresh=true&includeHidden=true')
      const data = await res.json()
      if (data.success) {
        // Refresh the user list
        await fetchUsers()
        setSyncMessage(`✅ Synced! ${users.length} users loaded from Zoho.`)
      } else {
        setSyncMessage(`❌ Sync failed: ${data.error || 'Unknown error'}`)
      }
    } catch (e: any) {
      setSyncMessage(`❌ Sync error: ${e.message}`)
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMessage(""), 5000)
    }
  }

  const toggleVisibleRep = async (userId: string) => {
    const newSet = new Set(visibleReps)
    if (newSet.has(userId)) newSet.delete(userId)
    else newSet.add(userId)
    const newList = Array.from(newSet)
    setVisibleReps(newList)
    try {
      // Save via update-config endpoint
      const configRes = await fetch('/api/get-update-config')
      const configData = await configRes.json()
      const currentConfig = configData.success ? configData.config : {}
      await fetch('/api/save-update-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...currentConfig, visibleReps: newList })
      })
    } catch {}
  }

  const getEffectivePermissions = (user: any): UserPermissions => {
    return resolvePermissions(user.permissions, user.role)
  }

  const toggleExpanded = (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null)
    } else {
      setExpandedUser(userId)
      // Initialize edited permissions from effective permissions
      const user = users.find(u => u.id === userId)
      if (user && !editedPermissions[userId]) {
        setEditedPermissions(prev => ({
          ...prev,
          [userId]: getEffectivePermissions(user)
        }))
      }
      if (user && !editedUserInfo[userId]) {
        setEditedUserInfo(prev => ({
          ...prev,
          [userId]: { name: user.name || "", email: user.email || "", zohoId: user.zohoId || "", role: user.role || "Sales Representative" }
        }))
      }
    }
  }

  const togglePermission = (userId: string, key: keyof UserPermissions) => {
    setEditedPermissions(prev => {
      const current = prev[userId] || getEffectivePermissions(users.find(u => u.id === userId))
      return {
        ...prev,
        [userId]: { ...current, [key]: !current[key] }
      }
    })
  }

  const enableAll = (userId: string) => {
    setEditedPermissions(prev => ({ ...prev, [userId]: { ...ALL_PERMISSIONS } }))
  }

  const setDefaults = (userId: string) => {
    setEditedPermissions(prev => ({ ...prev, [userId]: { ...DEFAULT_REP_PERMISSIONS } }))
  }

  const savePermissions = async (userId: string) => {
    const perms = editedPermissions[userId]
    if (!perms) return

    setSavingUser(userId)
    try {
      const info = editedUserInfo[userId]
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: userId, 
          permissions: perms,
          canSendCampaigns: perms.sendCampaigns,
          ...(info ? { name: info.name, email: info.email, zohoId: info.zohoId, role: info.role } : {})
        })
      })
      const data = await res.json()
      if (data.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, permissions: perms, canSendCampaigns: perms.sendCampaigns, ...(info || {}) } : u))
      } else {
        toast.error("Failed to save: " + data.error)
      }
    } catch (e: any) {
      toast.error("Error saving permissions")
    } finally {
      setSavingUser(null)
    }
  }

  const hasChanges = (userId: string) => {
    const edited = editedPermissions[userId]
    const info = editedUserInfo[userId]
    const user = users.find(u => u.id === userId)
    if (!user) return false
    const permChanged = edited && JSON.stringify(edited) !== JSON.stringify(getEffectivePermissions(user))
    const infoChanged = info && (info.name !== (user.name || "") || info.email !== (user.email || "") || info.zohoId !== (user.zohoId || "") || info.role !== (user.role || ""))
    return permChanged || infoChanged
  }

  const countEnabled = (perms: UserPermissions) => {
    return Object.values(perms).filter(Boolean).length
  }

  const totalPerms = Object.keys(ALL_PERMISSIONS).length

  // Sorting handler
  const handleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDir(d => d === "asc" ? "desc" : "asc")
        return field
      }
      setSortDir("asc")
      return field
    })
  }, [])

  // Filtered and sorted users
  const filteredUsers = useMemo(() => {
    let result = [...users]

    // Role filter
    if (roleFilter !== "All") {
      result = result.filter(u => {
        if (roleFilter === "Admin") {
          return u.role?.toLowerCase().includes("admin") || u.role === "Administrator"
        }
        return u.role === "Sales Representative"
      })
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(u =>
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
      )
    }

    // Sort
    result.sort((a, b) => {
      let aVal: any, bVal: any
      switch (sortField) {
        case "name":
          aVal = (a.name || "").toLowerCase()
          bVal = (b.name || "").toLowerCase()
          break
        case "email":
          aVal = (a.email || "").toLowerCase()
          bVal = (b.email || "").toLowerCase()
          break
        case "role":
          aVal = (a.role || "").toLowerCase()
          bVal = (b.role || "").toLowerCase()
          break
        case "accountCount":
          aVal = a.accountCount || 0
          bVal = b.accountCount || 0
          break
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1
      return 0
    })

    return result
  }, [users, roleFilter, searchQuery, sortField, sortDir])

  // Open assign accounts modal
  const openAssignModal = useCallback(async (userId: string) => {
    setAssignUserId(userId)
    setShowAssignModal(true)
    setAccountSearchQuery("")
    setSelectedAccountIds(new Set())
    setAssigning(false)
    setAssignProgress({ done: 0, total: 0, errors: [] })
    setLoadingAccounts(true)
    setAllAccounts([])
    try {
      // Fetch all accounts (paginated) - get first page, check for hasMore
      let page = 1
      let allFetched: AccountItem[] = []
      let hasMore = true
      while (hasMore) {
        const res = await fetch(`/api/get-accounts?email=admin@titandiamond.com&role=Admin&page=${page}`)
        const data = await res.json()
        if (data.success && data.accounts) {
          allFetched = [...allFetched, ...data.accounts.map((a: any) => ({
            id: a.id,
            name: a.name || "Unnamed Account",
            owner: a.owner || null,
          }))]
          hasMore = data.pagination?.hasMore || false
          page++
        } else {
          hasMore = false
        }
      }
      setAllAccounts(allFetched)
    } catch (err) {
      console.error("Failed to fetch accounts:", err)
    } finally {
      setLoadingAccounts(false)
    }
  }, [])

  // Filtered accounts in modal
  const filteredAccounts = useMemo(() => {
    if (!accountSearchQuery.trim()) return allAccounts
    const q = accountSearchQuery.toLowerCase().trim()
    return allAccounts.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.owner?.name || "").toLowerCase().includes(q)
    )
  }, [allAccounts, accountSearchQuery])

  // Toggle account selection
  const toggleAccountSelection = useCallback((accountId: string) => {
    setSelectedAccountIds(prev => {
      const next = new Set(prev)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })
  }, [])

  // Select / deselect all visible
  const toggleSelectAll = useCallback(() => {
    const visibleIds = filteredAccounts.map(a => a.id)
    setSelectedAccountIds(prev => {
      const allSelected = visibleIds.every(id => prev.has(id))
      const next = new Set(prev)
      if (allSelected) {
        visibleIds.forEach(id => next.delete(id))
      } else {
        visibleIds.forEach(id => next.add(id))
      }
      return next
    })
  }, [filteredAccounts])

  // Perform bulk assignment
  const performAssignment = useCallback(async () => {
    if (!assignUserId || selectedAccountIds.size === 0) return
    const user = users.find(u => u.id === assignUserId)
    if (!user) return

    setAssigning(true)
    const ids = Array.from(selectedAccountIds)
    const progress = { done: 0, total: ids.length, errors: [] as string[] }
    setAssignProgress({ ...progress })

    for (const accountId of ids) {
      try {
        const res = await fetch('/api/update-account-owner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId, newOwnerId: assignUserId })
        })
        const data = await res.json()
        if (!data.success) {
          const acct = allAccounts.find(a => a.id === accountId)
          progress.errors.push(`${acct?.name || accountId}: ${data.message || "Failed"}`)
        }
      } catch (err: any) {
        const acct = allAccounts.find(a => a.id === accountId)
        progress.errors.push(`${acct?.name || accountId}: ${err.message}`)
      }
      progress.done++
      setAssignProgress({ ...progress })
    }

    setAssigning(false)

    // Refresh user list to get updated account counts
    if (progress.errors.length === 0) {
      try {
        const res = await fetch('/api/admin/users')
        const data = await res.json()
        if (data.success) setUsers(data.users || [])
      } catch {}
      setShowAssignModal(false)
    }
  }, [assignUserId, selectedAccountIds, users, allAccounts])

  // Sort header component
  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer select-none"
    >
      {label}
      {sortField === field ? (
        sortDir === "asc" ? <FiArrowUp size={10} className="text-emerald-400" /> : <FiArrowDown size={10} className="text-emerald-400" />
      ) : (
        <FiArrowUp size={10} className="opacity-0 group-hover:opacity-30" />
      )}
    </button>
  )

  if (loading) return <div className="p-8 text-neutral-400">Loading...</div>

  const assignUser = assignUserId ? users.find(u => u.id === assignUserId) : null

  return (
    <div className="flex flex-col text-neutral-100 font-sans h-full">
      <main className="flex-1 p-4 sm:p-6 space-y-6 overflow-y-auto safe-bottom">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-2">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <FiShield className="text-emerald-400" /> User Management
            </h1>
            <p className="text-xs text-neutral-500 mt-1">Manage users, permissions, and visibility across the portal. Click a user to expand.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={syncFromZoho}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 transition-colors cursor-pointer disabled:opacity-50"
            >
              <FiRefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing...' : 'Sync from Zoho'}
            </button>
            <button
              onClick={() => { setShowAddUser(true); setAddError(""); setNewUser({ name: "", email: "", role: "Sales Representative", zohoId: "" }) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors cursor-pointer"
            >
              <FiUserPlus size={14} /> Add User
            </button>
          </div>
        </header>
        {syncMessage && (
          <div className={`text-xs font-semibold px-3 py-2 rounded-lg ${syncMessage.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            {syncMessage}
          </div>
        )}

        {/* Search + Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full glass-panel/60 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 cursor-pointer"
              >
                <FiX size={12} />
              </button>
            )}
          </div>

          {/* Role Filter Tabs */}
          <div className="flex rounded-lg border border-white/10 overflow-hidden shrink-0">
            {(["All", "Admin", "Sales Representative"] as RoleFilter[]).map(role => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  roleFilter === role
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.03]"
                }`}
              >
                {role === "Sales Representative" ? "Reps" : role}
              </button>
            ))}
          </div>
        </div>

        {/* Column Sort Headers */}
        <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-4 items-center">
          <SortHeader field="name" label="Name" />
          <SortHeader field="email" label="Email" />
          <SortHeader field="role" label="Role" />
          <SortHeader field="accountCount" label="Accounts" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 text-right">Perms</span>
        </div>

        {/* Results count */}
        <p className="text-[10px] text-neutral-600">{filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""} shown</p>

        <div className="space-y-3">
          {filteredUsers.map((user) => {
            const isExpanded = expandedUser === user.id
            const effectivePerms = editedPermissions[user.id] || getEffectivePermissions(user)
            const enabledCount = countEnabled(effectivePerms)
            const isAdmin = user.role?.toLowerCase().includes("admin") || user.role === "Administrator"
            const changed = hasChanges(user.id)

            return (
              <div key={user.id} className={`glass-panel/60 border rounded-xl overflow-hidden transition-all ${isExpanded ? 'border-emerald-500/30' : 'border-white/10'}`}>
                {/* User Row */}
                <button
                  onClick={() => toggleExpanded(user.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isAdmin ? 'bg-emerald-500/15 text-emerald-400' : 'bg-neutral-800 text-neutral-400'}`}>
                      {isAdmin ? <FiShield size={18} /> : <FiUser size={18} />}
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-sm flex items-center gap-2">
                        {user.name || "Unnamed User"}
                        {user.zohoId ? (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" title={`Zoho ID: ${user.zohoId}`}>ZOHO ✍"</span>
                        ) : (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20" title="No Zoho ID linked">NO ZOHO</span>
                        )}
                        {visibleReps.length > 0 && visibleReps.includes(user.id) && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/20" title="Visible across portal (Stats, Commissions, Dashboard)">VISIBLE</span>
                        )}
                        {user.showOnSalesBoard && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20" title="Shown on Sales Board">BOARD</span>
                        )}
                      </h3>
                      <p className="text-[10px] text-neutral-500">
                        {user.email} &bull; <span className={isAdmin ? "text-emerald-400 font-bold" : "text-neutral-400"}>{user.role}</span>
                        {" "}&bull;{" "}
                        <span className="text-neutral-400">
                          <FiUsers size={9} className="inline -mt-px mr-0.5" />
                          {user.accountCount ?? 0} account{(user.accountCount ?? 0) !== 1 ? "s" : ""}
                        </span>
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {/* Account count badge (visible on wider screens) */}
                    <span className="hidden sm:inline text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">
                      <FiUsers size={9} className="inline -mt-px mr-0.5" />{user.accountCount ?? 0}
                    </span>
                    {/* Permission count badge */}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      enabledCount === totalPerms ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                      enabledCount > totalPerms / 2 ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' :
                      'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    }`}>
                      {enabledCount}/{totalPerms}
                    </span>
                    {isExpanded ? <FiChevronUp className="text-neutral-400" /> : <FiChevronDown className="text-neutral-400" />}
                  </div>
                </button>

                {/* Expanded Permissions Panel */}
                {isExpanded && (
                  <div className="border-t border-white/10 p-4 sm:p-5 bg-black/30">
                    {/* Quick Actions */}
                    <div className="flex flex-wrap gap-2 mb-5">
                      <button
                        onClick={() => enableAll(user.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                      >
                        <FiToggleRight size={13} /> Enable All
                      </button>
                      <button
                        onClick={() => setDefaults(user.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition-colors"
                      >
                        <FiToggleLeft size={13} /> Rep Defaults
                      </button>
                      <button
                        onClick={() => openAssignModal(user.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors cursor-pointer"
                      >
                        <FiUsers size={13} /> Assign Accounts
                      </button>
                    </div>

                    {/* User Info Section */}
                    <div className="mb-5 pb-5 border-b border-white/10">
                      <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <FiEdit3 size={11} /> User Info
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-neutral-500 font-semibold block mb-1">Name</label>
                          <input
                            value={editedUserInfo[user.id]?.name || ""}
                            onChange={e => setEditedUserInfo(prev => ({ ...prev, [user.id]: { ...prev[user.id], name: e.target.value } }))}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-neutral-500 font-semibold block mb-1">Email</label>
                          <input
                            value={editedUserInfo[user.id]?.email || ""}
                            onChange={e => setEditedUserInfo(prev => ({ ...prev, [user.id]: { ...prev[user.id], email: e.target.value } }))}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-neutral-500 font-semibold block mb-1">Zoho User ID</label>
                          <input
                            value={editedUserInfo[user.id]?.zohoId || ""}
                            onChange={e => setEditedUserInfo(prev => ({ ...prev, [user.id]: { ...prev[user.id], zohoId: e.target.value } }))}
                            placeholder="e.g. 4912873000000275001"
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-neutral-500 font-semibold block mb-1">Role</label>
                          <select
                            value={editedUserInfo[user.id]?.role || "Sales Representative"}
                            onChange={e => setEditedUserInfo(prev => ({ ...prev, [user.id]: { ...prev[user.id], role: e.target.value } }))}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 appearance-none cursor-pointer"
                          >
                            <option value="Sales Representative">Sales Representative</option>
                            <option value="Admin">Admin</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Visibility Toggles */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Visible in Portal (Stats, Commissions, Dashboard) */}
                      <div className="flex items-center justify-between bg-neutral-800/50 border border-neutral-700/50 rounded-xl px-4 py-3">
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            <FiEye className="text-purple-400" size={13} /> Visible in Portal
                          </div>
                          <div className="text-[10px] text-neutral-500 mt-0.5">Show in Stats, Commissions, Dashboard dropdowns</div>
                        </div>
                        <button
                          onClick={() => toggleVisibleRep(user.id)}
                          className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${visibleReps.includes(user.id) ? 'bg-purple-500' : 'bg-neutral-700'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${visibleReps.includes(user.id) ? 'translate-x-5' : ''}`} />
                        </button>
                      </div>

                      {/* Show on Sales Board */}
                      <div className="flex items-center justify-between bg-neutral-800/50 border border-neutral-700/50 rounded-xl px-4 py-3">
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            <FiUsers className="text-amber-400" size={13} /> Show on Sales Board
                          </div>
                          <div className="text-[10px] text-neutral-500 mt-0.5">Include this user on the live Sales Board display</div>
                        </div>
                        <button
                          onClick={async () => {
                            const newVal = !user.showOnSalesBoard
                            try {
                              const res = await fetch('/api/admin/users', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: user.id, showOnSalesBoard: newVal })
                              })
                              const data = await res.json()
                              if (data.success) {
                                setUsers(prev => prev.map(u => u.id === user.id ? { ...u, showOnSalesBoard: newVal } : u))
                              }
                            } catch {}
                          }}
                          className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${user.showOnSalesBoard ? 'bg-amber-500' : 'bg-neutral-700'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${user.showOnSalesBoard ? 'translate-x-5' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Permission Groups */}
                    <div className="space-y-5">
                      {PERMISSION_GROUPS.map(group => (
                        <div key={group.label}>
                          <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500/60 inline-block" />
                            {group.label}
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {group.permissions.map(perm => {
                              const isEnabled = effectivePerms[perm.key]
                              return (
                                <button
                                  key={perm.key}
                                  onClick={() => togglePermission(user.id, perm.key)}
                                  className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all ${
                                    isEnabled
                                      ? 'bg-emerald-500/8 border-emerald-500/25 hover:bg-emerald-500/12'
                                      : 'glass-panel/50 border-white/10 hover:border-neutral-700'
                                  }`}
                                >
                                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                                    isEnabled ? 'bg-emerald-500 border-emerald-500' : 'border-neutral-600'
                                  }`}>
                                    {isEnabled && <FiCheck size={10} className="text-white" />}
                                  </span>
                                  <div className="min-w-0">
                                    <span className={`text-xs font-bold block ${isEnabled ? 'text-white' : 'text-neutral-400'}`}>
                                      {perm.label}
                                    </span>
                                    <span className="text-[10px] text-neutral-500 block mt-0.5 leading-tight">
                                      {perm.description}
                                    </span>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end mt-5 pt-4 border-t border-white/10">
                      <button
                        onClick={() => savePermissions(user.id)}
                        disabled={!changed || savingUser === user.id}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                          changed
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'
                            : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                        } disabled:opacity-50`}
                      >
                        {savingUser === user.id ? (
                          <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
                        ) : (
                          <><FiSave size={14} /> {changed ? 'Save Changes' : 'No Changes'}</>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {filteredUsers.length === 0 && (
            <div className="text-center py-12 text-neutral-500 text-sm">
              No users match your search or filter.
            </div>
          )}
        </div>
      </main>

      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAddUser(false)}>
          <div className="glass-panel border border-neutral-700 rounded-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FiUserPlus className="text-emerald-400" /> Add New User
            </h2>
            <p className="text-xs text-neutral-400">Create a user so they can log in via Zoho OAuth. If they already have accounts assigned in Zoho CRM, their stub user will be automatically merged on first login.</p>
            
            {addError && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{addError}</div>}
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-neutral-400 font-semibold block mb-1">Full Name *</label>
                <input
                  value={newUser.name}
                  onChange={e => setNewUser(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="John Smith"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-400 font-semibold block mb-1">Email *</label>
                <input
                  value={newUser.email}
                  onChange={e => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="john@titandiamond.com"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-400 font-semibold block mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 appearance-none cursor-pointer"
                >
                  <option value="Sales Representative">Sales Representative</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-400 font-semibold block mb-1">Zoho User ID <span className="text-neutral-600">(optional)</span></label>
                <input
                  value={newUser.zohoId}
                  onChange={e => setNewUser(prev => ({ ...prev, zohoId: e.target.value }))}
                  placeholder="e.g. 4912873000000275001"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-neutral-600 mt-1">Found in Zoho CRM â†' Settings â†' Users â†' click user â†' URL contains the ID</p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowAddUser(false)}
                className="flex-1 py-2 text-xs font-bold rounded-lg border border-neutral-700 text-neutral-400 hover:text-white hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!newUser.name || !newUser.email) { setAddError("Name and email are required."); return }
                  setAddingUser(true); setAddError("")
                  try {
                    const res = await fetch('/api/admin/users', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(newUser)
                    })
                    const data = await res.json()
                    if (data.success) {
                      setUsers(prev => [...prev, data.user])
                      setShowAddUser(false)
                    } else {
                      setAddError(data.error || "Failed to create user")
                    }
                  } catch (e: any) {
                    setAddError("Network error: " + e.message)
                  } finally {
                    setAddingUser(false)
                  }
                }}
                disabled={addingUser}
                className="flex-1 py-2 text-xs font-bold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                {addingUser ? "Creating..." : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Accounts Modal */}
      {showAssignModal && assignUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !assigning && setShowAssignModal(false)}>
          <div className="glass-panel border border-neutral-700 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 pb-4 border-b border-white/10 shrink-0">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FiUsers className="text-violet-400" /> Assign Accounts
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Select accounts to reassign to <span className="text-white font-semibold">{assignUser.name || assignUser.email}</span>.
                This updates both Zoho CRM and the local database.
              </p>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b border-white/10 shrink-0">
              <div className="relative">
                <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  value={accountSearchQuery}
                  onChange={e => setAccountSearchQuery(e.target.value)}
                  placeholder="Search accounts..."
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-violet-500/50 transition-colors"
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <button
                  onClick={toggleSelectAll}
                  className="text-[10px] text-violet-400 font-bold hover:text-violet-300 transition-colors cursor-pointer"
                >
                  {filteredAccounts.length > 0 && filteredAccounts.every(a => selectedAccountIds.has(a.id)) ? "Deselect All" : "Select All"} ({filteredAccounts.length})
                </button>
                <span className="text-[10px] text-neutral-500">
                  {selectedAccountIds.size} selected
                </span>
              </div>
            </div>

            {/* Account List */}
            <div className="flex-1 overflow-y-auto px-5 py-2 min-h-0">
              {loadingAccounts ? (
                <div className="flex items-center justify-center py-12 gap-2 text-neutral-400 text-sm">
                  <FiRefreshCw size={14} className="animate-spin" /> Loading accounts"¦
                </div>
              ) : filteredAccounts.length === 0 ? (
                <div className="text-center py-12 text-neutral-500 text-sm">
                  {allAccounts.length === 0 ? "No accounts found." : "No accounts match your search."}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredAccounts.map(account => {
                    const isSelected = selectedAccountIds.has(account.id)
                    return (
                      <button
                        key={account.id}
                        onClick={() => toggleAccountSelection(account.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-violet-500/10 border border-violet-500/25"
                            : "border border-transparent hover:bg-white/[0.03]"
                        }`}
                      >
                        <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                          isSelected ? 'bg-violet-500 border-violet-500' : 'border-neutral-600'
                        }`}>
                          {isSelected && <FiCheck size={10} className="text-white" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className={`text-xs font-bold block truncate ${isSelected ? "text-white" : "text-neutral-300"}`}>
                            {account.name}
                          </span>
                          {account.owner && (
                            <span className="text-[10px] text-neutral-500 block truncate">
                              Current owner: {account.owner.name || account.owner.email}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Progress bar during assignment */}
            {assigning && assignProgress.total > 0 && (
              <div className="px-5 py-3 border-t border-white/10 shrink-0">
                <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1.5">
                  <span>Reassigning {assignProgress.done}/{assignProgress.total}"¦</span>
                  <span>{Math.round((assignProgress.done / assignProgress.total) * 100)}%</span>
                </div>
                <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all duration-300"
                    style={{ width: `${(assignProgress.done / assignProgress.total) * 100}%` }}
                  />
                </div>
                {assignProgress.errors.length > 0 && (
                  <div className="mt-2 max-h-20 overflow-y-auto space-y-1">
                    {assignProgress.errors.map((err, i) => (
                      <p key={i} className="text-[10px] text-red-400">{err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="p-5 pt-3 border-t border-white/10 flex gap-2 shrink-0">
              <button
                onClick={() => setShowAssignModal(false)}
                disabled={assigning}
                className="flex-1 py-2 text-xs font-bold rounded-lg border border-neutral-700 text-neutral-400 hover:text-white hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 transition-colors cursor-pointer disabled:opacity-50"
              >
                {assignProgress.errors.length > 0 && !assigning ? "Close" : "Cancel"}
              </button>
              <button
                onClick={performAssignment}
                disabled={selectedAccountIds.size === 0 || assigning}
                className="flex-1 py-2 text-xs font-bold rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {assigning ? (
                  <><FiRefreshCw size={12} className="animate-spin" /> Reassigning"¦</>
                ) : (
                  <>Reassign {selectedAccountIds.size > 0 ? `${selectedAccountIds.size} ` : ""}to {assignUser.name || "User"}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

