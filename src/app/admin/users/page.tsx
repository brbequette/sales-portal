"use client"

import { useState, useEffect } from "react"
import { FiCheckSquare, FiSquare, FiUser, FiShield, FiChevronDown, FiChevronUp, FiCheck, FiX, FiToggleLeft, FiToggleRight, FiSave } from "react-icons/fi"
import { PERMISSION_GROUPS, ALL_PERMISSIONS, DEFAULT_REP_PERMISSIONS, resolvePermissions, type UserPermissions } from "@/lib/permissions"

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [savingUser, setSavingUser] = useState<string | null>(null)
  const [editedPermissions, setEditedPermissions] = useState<Record<string, UserPermissions>>({})

  useEffect(() => {
    fetch('/api/admin/users')
      .then(res => res.json())
      .then(data => {
        if (data.success) setUsers(data.users || [])
      })
      .finally(() => setLoading(false))
  }, [])

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
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: userId, 
          permissions: perms,
          canSendCampaigns: perms.sendCampaigns // Keep legacy field in sync
        })
      })
      const data = await res.json()
      if (data.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, permissions: perms, canSendCampaigns: perms.sendCampaigns } : u))
      } else {
        alert("Failed to save: " + data.error)
      }
    } catch (e: any) {
      alert("Error saving permissions")
    } finally {
      setSavingUser(null)
    }
  }

  const hasChanges = (userId: string) => {
    const edited = editedPermissions[userId]
    if (!edited) return false
    const current = getEffectivePermissions(users.find(u => u.id === userId))
    return JSON.stringify(edited) !== JSON.stringify(current)
  }

  const countEnabled = (perms: UserPermissions) => {
    return Object.values(perms).filter(Boolean).length
  }

  const totalPerms = Object.keys(ALL_PERMISSIONS).length

  if (loading) return <div className="p-8 text-neutral-400">Loading...</div>

  return (
    <div className="flex flex-col text-neutral-100 font-sans h-full">
      <main className="flex-1 p-4 sm:p-6 space-y-6 overflow-y-auto safe-bottom">
        <header className="flex items-center justify-between gap-4 mb-2">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <FiShield className="text-emerald-400" /> User Permissions
            </h1>
            <p className="text-xs text-neutral-500 mt-1">Configure feature access for each user. Click a user to expand their permissions.</p>
          </div>
        </header>

        <div className="space-y-3">
          {users.map((user) => {
            const isExpanded = expandedUser === user.id
            const effectivePerms = editedPermissions[user.id] || getEffectivePermissions(user)
            const enabledCount = countEnabled(effectivePerms)
            const isAdmin = user.role?.toLowerCase().includes("admin") || user.role === "Administrator"
            const changed = hasChanges(user.id)

            return (
              <div key={user.id} className={`bg-neutral-900/60 border rounded-xl overflow-hidden transition-all ${isExpanded ? 'border-emerald-500/30' : 'border-neutral-800'}`}>
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
                      <h3 className="font-bold text-white text-sm">{user.name || "Unnamed User"}</h3>
                      <p className="text-[10px] text-neutral-500">{user.email} &bull; <span className={isAdmin ? "text-emerald-400 font-bold" : "text-neutral-400"}>{user.role}</span></p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
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
                  <div className="border-t border-neutral-800 p-4 sm:p-5 bg-black/30">
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
                                      : 'bg-neutral-900/50 border-neutral-800 hover:border-neutral-700'
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
                    <div className="flex justify-end mt-5 pt-4 border-t border-neutral-800">
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
        </div>
      </main>
    </div>
  )
}
