"use client"

import { useZoho } from "@/components/ZohoProvider"
import { useState, useEffect, useMemo } from "react"
import { FiDollarSign, FiPlus, FiEdit2, FiTrash2, FiCheck, FiX, FiUser, FiClock, FiTarget, FiActivity, FiRefreshCw, FiSend, FiFileText, FiList } from "react-icons/fi"

type CompensationPlan = {
  id: string
  repId: string
  name: string
  status: "ACTIVE" | "ENDED" | "DRAFT"
  startDate: string | null
  endDate: string | null
  payType: "SALARY" | "DRAW" | "HOURLY" | "COMMISSION_ONLY"
  baseAmount: number | null
  baseInterval: "HOURLY" | "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "ANNUALLY" | null
  commissionEnabled: boolean
  commissionRate: number | null
  commissionBasis: "NET_PROFIT" | "DEAD_PROFIT" | "SUBTOTAL" | null
  payoutStructure: "two_payment" | "single_payment" | "three_payment" | null
  drawRecoverable: boolean
  drawCapPerPeriod: number | null
  commitmentEnabled: boolean
  commitmentMetric: "SUBTOTAL" | "DEAD_PROFIT" | "NET_PROFIT" | "INVOICES_COUNT" | null
  commitmentTarget: number | null
  commitmentVigRate: number | null
  commitmentGoalType: "DAILY" | "MONTHLY" | null
  commitmentPenalty: "VIG_INCREASE" | "COMMISSION_REDUCTION" | "PLAN_REVIEW" | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

type User = {
  id: string
  name: string
  email: string
  role: string
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "$0.00"
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "N/A"
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return dateStr
  }
}

export default function CompensationPlansPage() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  
  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState<CompensationPlan[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState<string | null>(null)
  
  // Modal states
  const [showBuilder, setShowBuilder] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null)
  const [editingPlan, setEditingPlan] = useState<Partial<CompensationPlan> | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true)
      const [plansRes, usersRes] = await Promise.all([
        fetch('/api/compensation-plans'),
        fetch('/api/admin/users')
      ])
      
      const plansData = await plansRes.json()
      const usersData = await usersRes.json()
      
      if (plansData.success) {
        setPlans(plansData.data)
      } else {
        throw new Error(plansData.error || "Failed to fetch plans")
      }
      
      if (usersData.success) {
        setUsers(usersData.users)
      } else {
        throw new Error(usersData.error || "Failed to fetch users")
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Derived state
  const reps = users.filter(u => u.role?.toLowerCase() !== 'customer' && u.role?.toLowerCase() !== 'client')
  
  const activePlansByRep = useMemo(() => {
    const map = new Map<string, CompensationPlan>()
    reps.forEach(rep => {
      const activePlan = plans.find(p => p.repId === rep.id && p.status === 'ACTIVE')
      if (activePlan) {
        map.set(rep.id, activePlan)
      }
    })
    return map
  }, [plans, reps])

  const stats = useMemo(() => {
    const activePlans = plans.filter(p => p.status === 'ACTIVE')
    return {
      total: activePlans.length,
      salary: activePlans.filter(p => p.payType === 'SALARY').length,
      draw: activePlans.filter(p => p.payType === 'DRAW').length,
      hourly: activePlans.filter(p => p.payType === 'HOURLY').length,
      commissionOnly: activePlans.filter(p => p.payType === 'COMMISSION_ONLY').length,
    }
  }, [plans])

  const repHistory = useMemo(() => {
    if (!selectedRepId) return []
    return plans.filter(p => p.repId === selectedRepId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [plans, selectedRepId])

  // Actions
  const handleOpenBuilder = (repId?: string, planToEdit?: CompensationPlan) => {
    if (planToEdit) {
      setEditingPlan({ ...planToEdit })
    } else {
      const rep = users.find(u => u.id === repId)
      setEditingPlan({
        repId: repId || "",
        name: rep ? `${rep.name} - Plan` : "New Plan",
        status: "ACTIVE",
        payType: "COMMISSION_ONLY",
        baseAmount: 0,
        baseInterval: "WEEKLY",
        commissionEnabled: true,
        commissionRate: 50,
        commissionBasis: "NET_PROFIT",
        payoutStructure: "two_payment",
        drawRecoverable: false,
        drawCapPerPeriod: 0,
        commitmentEnabled: false,
        commitmentMetric: "NET_PROFIT",
        commitmentTarget: 0,
        commitmentVigRate: 1.0,
        commitmentGoalType: "MONTHLY",
        commitmentPenalty: "PLAN_REVIEW",
        notes: ""
      })
    }
    setShowBuilder(true)
  }

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPlan?.repId) {
      alert("Please select a rep")
      return
    }

    setSubmitting(true)
    try {
      const url = editingPlan.id ? '/api/compensation-plans' : '/api/compensation-plans'
      const method = editingPlan.id ? 'PUT' : 'POST'
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingPlan)
      })
      
      const data = await res.json()
      if (data.success) {
        setShowBuilder(false)
        setEditingPlan(null)
        fetchData()
      } else {
        alert("Failed to save plan: " + (data.error || "Unknown error"))
      }
    } catch (err: any) {
      alert("Error: " + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleEndPlan = async (planId: string) => {
    if (!confirm("Are you sure you want to end this plan?")) return
    
    try {
      const res = await fetch('/api/compensation-plans', {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: planId,
          status: 'ENDED',
          endDate: new Date().toISOString()
        })
      })
      const data = await res.json()
      if (data.success) {
        fetchData()
      }
    } catch (err: any) {
      alert("Error ending plan: " + err.message)
    }
  }

  const handleDuplicatePlan = (plan: CompensationPlan) => {
    const duplicate = { ...plan, id: undefined, status: "DRAFT" as const, name: `${plan.name} (Copy)` }
    setEditingPlan(duplicate)
    setShowBuilder(true)
  }
  
  const getCalculatedWeekly = (amount: number, interval: string) => {
    switch (interval) {
      case "HOURLY": return amount * 40;
      case "DAILY": return amount * 5;
      case "WEEKLY": return amount;
      case "BIWEEKLY": return amount / 2;
      case "MONTHLY": return (amount * 12) / 52;
      case "ANNUALLY": return amount / 52;
      default: return 0;
    }
  }

  return (
    <div className="page-content min-h-screen bg-black">
      <div className="page-header px-6 py-6 border-b border-white/10 bg-neutral-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center">
              <FiTarget className="text-emerald-500" size={20} />
            </div>
            <div>
              <h1 className="page-title text-2xl font-bold text-white">Compensation Plans</h1>
              <p className="page-subtitle text-sm text-neutral-400">Manage rep compensation, commissions, and performance commitments.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleOpenBuilder()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/20 cursor-pointer"
            >
              <FiPlus size={16} /> Create Plan
            </button>
          </div>
        </div>
        
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
          <div className="bg-neutral-800/50 border border-white/5 rounded-xl p-4">
            <div className="text-xs font-bold text-neutral-400 uppercase">Active Plans</div>
            <div className="text-2xl font-black text-white mt-1">{stats.total}</div>
          </div>
          <div className="bg-neutral-800/50 border border-white/5 rounded-xl p-4">
            <div className="text-xs font-bold text-neutral-400 uppercase">Salary</div>
            <div className="text-2xl font-black text-emerald-400 mt-1">{stats.salary}</div>
          </div>
          <div className="bg-neutral-800/50 border border-white/5 rounded-xl p-4">
            <div className="text-xs font-bold text-neutral-400 uppercase">Draw</div>
            <div className="text-2xl font-black text-amber-400 mt-1">{stats.draw}</div>
          </div>
          <div className="bg-neutral-800/50 border border-white/5 rounded-xl p-4">
            <div className="text-xs font-bold text-neutral-400 uppercase">Hourly</div>
            <div className="text-2xl font-black text-purple-400 mt-1">{stats.hourly}</div>
          </div>
          <div className="bg-neutral-800/50 border border-white/5 rounded-xl p-4">
            <div className="text-xs font-bold text-neutral-400 uppercase">Commission Only</div>
            <div className="text-2xl font-black text-blue-400 mt-1">{stats.commissionOnly}</div>
          </div>
        </div>
      </div>

      <div className="page-body p-6">
        {loading ? (
          <div className="flex justify-center p-12"><FiRefreshCw className="animate-spin text-emerald-500" size={32} /></div>
        ) : error ? (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">{error}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reps.map(rep => {
              const activePlan = activePlansByRep.get(rep.id)
              
              if (!activePlan) {
                return (
                  <div key={rep.id} className="glass-panel bg-neutral-900/40 border border-white/5 rounded-xl p-6 flex flex-col items-center justify-center text-center gap-3">
                    <div className="w-12 h-12 bg-neutral-800 rounded-full flex items-center justify-center">
                      <FiUser className="text-neutral-500" size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{rep.name}</h3>
                      <p className="text-xs text-neutral-500">No Active Plan</p>
                    </div>
                    <button
                      onClick={() => handleOpenBuilder(rep.id)}
                      className="mt-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      + Create Plan
                    </button>
                    {plans.some(p => p.repId === rep.id) && (
                      <button
                        onClick={() => { setSelectedRepId(rep.id); setShowHistory(true); }}
                        className="text-xs text-emerald-500 hover:text-emerald-400 underline mt-1"
                      >
                        View History
                      </button>
                    )}
                  </div>
                )
              }

              return (
                <div key={rep.id} className="glass-panel bg-neutral-900 border border-white/10 rounded-xl p-6 shadow-xl relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                  
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white">{rep.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold uppercase">
                          {activePlan.payType.replace('_', ' ')}
                        </span>
                        {activePlan.status === 'ACTIVE' && (
                          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded text-[10px] font-bold uppercase">
                            ACTIVE
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button onClick={() => { setSelectedRepId(rep.id); setShowHistory(true); }} className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded-lg cursor-pointer" title="View History">
                        <FiClock size={14} />
                      </button>
                      <button onClick={() => handleOpenBuilder(rep.id, activePlan)} className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded-lg cursor-pointer" title="Edit Plan">
                        <FiEdit2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 mt-4 text-sm">
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <span className="text-neutral-400">Base Pay</span>
                      <span className="font-mono font-bold text-white">
                        {activePlan.payType === 'COMMISSION_ONLY' 
                          ? 'Commission Only' 
                          : `${formatCurrency(activePlan.baseAmount)}/${activePlan.baseInterval?.toLowerCase()}`}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <span className="text-neutral-400">Commission</span>
                      <span className="font-bold text-emerald-400">
                        {activePlan.commissionEnabled ? `${activePlan.commissionRate}% of ${activePlan.commissionBasis?.replace('_', ' ')}` : 'N/A'}
                      </span>
                    </div>

                    {activePlan.commitmentEnabled && (
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <span className="text-neutral-400">Commitment</span>
                        <span className="font-bold text-amber-400 text-right text-xs">
                          {activePlan.commitmentTarget} {activePlan.commitmentMetric?.replace('_', ' ')} / {activePlan.commitmentGoalType?.toLowerCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 flex gap-2">
                    <button 
                      onClick={() => handleEndPlan(activePlan.id)}
                      className="flex-1 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      End Plan
                    </button>
                    <button 
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/rep-portal/verify?action=generate&repId=${rep.id}`)
                          const d = await res.json()
                          if (d.success) {
                            await navigator.clipboard.writeText(d.portalUrl)
                            alert(`Portal link copied to clipboard!\n\n${d.portalUrl}`)
                          } else {
                            alert("Failed to generate link: " + d.error)
                          }
                        } catch (e) { alert("Error generating link") }
                      }}
                      className="flex-1 py-1.5 border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <FiSend size={12} /> Portal Link
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* PLAN BUILDER MODAL */}
      {showBuilder && editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] shadow-2xl flex flex-col">
            <div className="p-5 border-b border-white/10 flex justify-between items-center shrink-0">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FiFileText className="text-emerald-500" /> 
                {editingPlan.id ? 'Edit Compensation Plan' : 'Create Compensation Plan'}
              </h2>
              <button onClick={() => setShowBuilder(false)} className="text-neutral-400 hover:text-white">
                <FiX size={20} />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1">
              <form id="plan-form" onSubmit={handleSavePlan} className="space-y-6">
                
                {/* General Section */}
                <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-4">
                  <h3 className="text-sm font-bold text-white mb-2 border-b border-white/10 pb-2">General Settings</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-neutral-400 mb-1">Representative</label>
                      <select 
                        value={editingPlan.repId || ""}
                        onChange={e => {
                          const rep = users.find(u => u.id === e.target.value)
                          setEditingPlan({...editingPlan, repId: e.target.value, name: rep ? `${rep.name} - Plan` : "New Plan"})
                        }}
                        required
                        className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
                      >
                        <option value="">Select a rep...</option>
                        {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-400 mb-1">Plan Name</label>
                      <input 
                        type="text"
                        value={editingPlan.name || ""}
                        onChange={e => setEditingPlan({...editingPlan, name: e.target.value})}
                        required
                        className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-400 mb-1">Status</label>
                      <select 
                        value={editingPlan.status || "DRAFT"}
                        onChange={e => setEditingPlan({...editingPlan, status: e.target.value as any})}
                        className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="DRAFT">Draft</option>
                        <option value="ENDED">Ended</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-neutral-400 mb-1">Start Date</label>
                        <input 
                          type="date"
                          value={editingPlan.startDate ? editingPlan.startDate.split('T')[0] : ""}
                          onChange={e => setEditingPlan({...editingPlan, startDate: e.target.value ? new Date(e.target.value).toISOString() : null})}
                          className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-400 mb-1">End Date</label>
                        <input 
                          type="date"
                          value={editingPlan.endDate ? editingPlan.endDate.split('T')[0] : ""}
                          onChange={e => setEditingPlan({...editingPlan, endDate: e.target.value ? new Date(e.target.value).toISOString() : null})}
                          className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Base Pay Section */}
                <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-4">
                  <h3 className="text-sm font-bold text-white mb-2 border-b border-white/10 pb-2">Pay Type & Base</h3>
                  
                  <div className="flex gap-4">
                    {['SALARY', 'DRAW', 'HOURLY', 'COMMISSION_ONLY'].map(type => (
                      <label key={type} className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="radio"
                          name="payType"
                          value={type}
                          checked={editingPlan.payType === type}
                          onChange={e => setEditingPlan({...editingPlan, payType: e.target.value as any})}
                          className="accent-emerald-500"
                        />
                        <span className="text-sm text-white">{type.replace('_', ' ')}</span>
                      </label>
                    ))}
                  </div>

                  {editingPlan.payType !== 'COMMISSION_ONLY' && (
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="block text-xs font-bold text-neutral-400 mb-1">Base Amount ($)</label>
                        <input 
                          type="number"
                          step="0.01"
                          value={editingPlan.baseAmount || 0}
                          onChange={e => setEditingPlan({...editingPlan, baseAmount: parseFloat(e.target.value) || 0})}
                          className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-400 mb-1">Interval</label>
                        <select 
                          value={editingPlan.baseInterval || "WEEKLY"}
                          onChange={e => setEditingPlan({...editingPlan, baseInterval: e.target.value as any})}
                          className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
                        >
                          <option value="HOURLY">Hourly</option>
                          <option value="DAILY">Daily</option>
                          <option value="WEEKLY">Weekly</option>
                          <option value="BIWEEKLY">Biweekly</option>
                          <option value="MONTHLY">Monthly</option>
                          <option value="ANNUALLY">Annually</option>
                        </select>
                      </div>
                      <div className="col-span-2 text-xs text-neutral-500">
                        Calculated Weekly Equivalent: <span className="font-bold text-white">{formatCurrency(getCalculatedWeekly(editingPlan.baseAmount || 0, editingPlan.baseInterval || "WEEKLY"))}</span>
                        {editingPlan.baseInterval === 'HOURLY' && " (assuming 40hrs)"}
                      </div>
                    </div>
                  )}
                  
                  {editingPlan.payType === 'DRAW' && (
                    <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/5">
                      <div>
                        <label className="flex items-center gap-2 cursor-pointer mt-6">
                          <input 
                            type="checkbox"
                            checked={editingPlan.drawRecoverable || false}
                            onChange={e => setEditingPlan({...editingPlan, drawRecoverable: e.target.checked})}
                            className="accent-emerald-500 w-4 h-4"
                          />
                          <span className="text-sm font-bold text-neutral-300">Recoverable Draw</span>
                        </label>
                        <p className="text-[10px] text-neutral-500 ml-6">Draw is offset against future commissions</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-400 mb-1">Cap Per Period ($)</label>
                        <input 
                          type="number"
                          value={editingPlan.drawCapPerPeriod || 0}
                          onChange={e => setEditingPlan({...editingPlan, drawCapPerPeriod: parseFloat(e.target.value) || 0})}
                          className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Commission Section */}
                <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-4">
                  <div className="flex justify-between items-center border-b border-white/10 pb-2">
                    <h3 className="text-sm font-bold text-white">Commissions</h3>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-neutral-400">Enable</span>
                      <input 
                        type="checkbox"
                        checked={editingPlan.commissionEnabled || false}
                        onChange={e => setEditingPlan({...editingPlan, commissionEnabled: e.target.checked})}
                        className="accent-emerald-500 w-4 h-4"
                      />
                    </label>
                  </div>
                  
                  {editingPlan.commissionEnabled && (
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-neutral-400 mb-1">Rate (%)</label>
                        <input 
                          type="number"
                          value={editingPlan.commissionRate || 0}
                          onChange={e => setEditingPlan({...editingPlan, commissionRate: parseFloat(e.target.value) || 0})}
                          className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-400 mb-1">Basis</label>
                        <select 
                          value={editingPlan.commissionBasis || "NET_PROFIT"}
                          onChange={e => setEditingPlan({...editingPlan, commissionBasis: e.target.value as any})}
                          className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
                        >
                          <option value="NET_PROFIT">Net Profit</option>
                          <option value="DEAD_PROFIT">Dead Profit</option>
                          <option value="SUBTOTAL">Subtotal</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-400 mb-1">Payout Structure</label>
                        <select 
                          value={editingPlan.payoutStructure || "two_payment"}
                          onChange={e => setEditingPlan({...editingPlan, payoutStructure: e.target.value as any})}
                          className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
                        >
                          <option value="single_payment">Single Payment (100%)</option>
                          <option value="two_payment">Two Payment (50/50)</option>
                          <option value="three_payment">Three Payment (33/33/33)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Performance Commitment Section */}
                <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-4">
                  <div className="flex justify-between items-center border-b border-white/10 pb-2">
                    <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2"><FiActivity /> Performance Commitment</h3>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-neutral-400">Enable</span>
                      <input 
                        type="checkbox"
                        checked={editingPlan.commitmentEnabled || false}
                        onChange={e => setEditingPlan({...editingPlan, commitmentEnabled: e.target.checked})}
                        className="accent-amber-500 w-4 h-4"
                      />
                    </label>
                  </div>
                  
                  {editingPlan.commitmentEnabled && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-neutral-400 mb-1">Target Value / Count</label>
                        <input 
                          type="number"
                          value={editingPlan.commitmentTarget || 0}
                          onChange={e => setEditingPlan({...editingPlan, commitmentTarget: parseFloat(e.target.value) || 0})}
                          className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-400 mb-1">Metric</label>
                        <select 
                          value={editingPlan.commitmentMetric || "SUBTOTAL"}
                          onChange={e => setEditingPlan({...editingPlan, commitmentMetric: e.target.value as any})}
                          className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
                        >
                          <option value="SUBTOTAL">Subtotal Volume ($)</option>
                          <option value="NET_PROFIT">Net Profit ($)</option>
                          <option value="DEAD_PROFIT">Dead Profit ($)</option>
                          <option value="INVOICES_COUNT">Invoice Count (#)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-400 mb-1">Goal Cadence</label>
                        <select 
                          value={editingPlan.commitmentGoalType || "MONTHLY"}
                          onChange={e => setEditingPlan({...editingPlan, commitmentGoalType: e.target.value as any})}
                          className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
                        >
                          <option value="DAILY">Daily</option>
                          <option value="MONTHLY">Monthly</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-400 mb-1">VIG Rate (Multiplier)</label>
                        <input 
                          type="number"
                          step="0.1"
                          value={editingPlan.commitmentVigRate || 1.0}
                          onChange={e => setEditingPlan({...editingPlan, commitmentVigRate: parseFloat(e.target.value) || 1.0})}
                          className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-neutral-400 mb-1">Penalty for Missing Commitment</label>
                        <select 
                          value={editingPlan.commitmentPenalty || "PLAN_REVIEW"}
                          onChange={e => setEditingPlan({...editingPlan, commitmentPenalty: e.target.value as any})}
                          className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
                        >
                          <option value="VIG_INCREASE">VIG Rate Increase</option>
                          <option value="COMMISSION_REDUCTION">Commission % Reduction</option>
                          <option value="PLAN_REVIEW">Mandatory Plan Review</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes Section */}
                <div className="bg-black/30 border border-white/5 rounded-xl p-4">
                  <label className="block text-xs font-bold text-neutral-400 mb-1">Notes / Terms</label>
                  <textarea
                    value={editingPlan.notes || ""}
                    onChange={e => setEditingPlan({...editingPlan, notes: e.target.value})}
                    rows={3}
                    className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
                    placeholder="Any specific agreements, terms, or conditions..."
                  />
                </div>

              </form>
            </div>
            
            <div className="p-4 border-t border-white/10 flex justify-end gap-3 shrink-0 bg-neutral-900 rounded-b-2xl">
              <button 
                type="button" 
                onClick={() => setShowBuilder(false)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-sm font-bold"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                form="plan-form"
                disabled={submitting}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold flex items-center gap-2"
              >
                {submitting ? <FiRefreshCw className="animate-spin" /> : <FiCheck />}
                Save Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PLAN HISTORY MODAL */}
      {showHistory && selectedRepId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[80vh] shadow-2xl flex flex-col">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FiList className="text-blue-400" /> 
                Plan History: {users.find(u => u.id === selectedRepId)?.name}
              </h2>
              <button onClick={() => setShowHistory(false)} className="text-neutral-400 hover:text-white">
                <FiX size={20} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {repHistory.length === 0 ? (
                <div className="text-center text-neutral-500 py-10">No history found for this rep.</div>
              ) : (
                repHistory.map(plan => (
                  <div key={plan.id} className="bg-neutral-800/50 border border-white/10 rounded-xl p-4 flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white">{plan.name}</h4>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                          plan.status === 'ACTIVE' ? 'bg-blue-500/20 text-blue-400' :
                          plan.status === 'ENDED' ? 'bg-neutral-700 text-neutral-400' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>
                          {plan.status}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        Type: {plan.payType} | Base: {formatCurrency(plan.baseAmount)} | Comm: {plan.commissionEnabled ? `${plan.commissionRate}%` : 'No'}
                      </div>
                      <div className="text-[10px] text-neutral-500 mt-1 font-mono">
                        {formatDate(plan.startDate)} — {formatDate(plan.endDate)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => { setShowHistory(false); handleOpenBuilder(plan.repId, plan) }}
                        className="p-2 bg-neutral-700 hover:bg-neutral-600 rounded text-neutral-300"
                        title="Edit / View Details"
                      >
                        <FiEdit2 size={14} />
                      </button>
                      <button 
                        onClick={() => { setShowHistory(false); handleDuplicatePlan(plan) }}
                        className="px-3 py-1 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded text-xs font-bold"
                      >
                        Duplicate
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
