"use client"


import { useState, useEffect } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { FiDollarSign, FiPlus, FiCheck, FiX, FiRefreshCw, FiPrinter } from "react-icons/fi"

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n || 0)
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function PayrollAdminPage() {
  const { zohoContext: user, isInitialized } = useZoho()
  const [activeTab, setActiveTab] = useState<"advances" | "reimbursements" | "vouchers">("advances")
  
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<any[]>([])
  const [advances, setAdvances] = useState<any[]>([])
  const [reimbursements, setReimbursements] = useState<any[]>([])

  // Form State - Advances
  const [showAddAdvance, setShowAddAdvance] = useState(false)
  const [advanceForm, setAdvanceForm] = useState({ userId: "", amount: "", reason: "", splitOverWeeks: "", deductionRate: "" })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form State - Reimbursements
  const [showAddReimbursement, setShowAddReimbursement] = useState(false)
  const [reimbForm, setReimbForm] = useState({ userId: "", amount: "", description: "", status: "APPROVED" })

  const [selectedVoucherRep, setSelectedVoucherRep] = useState("")
  const [selectedVoucherWeek, setSelectedVoucherWeek] = useState("")

  const fetchData = async () => {
    setLoading(true)
    try {
      const [uRes, aRes, rRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/manage-advances"),
        fetch("/api/manage-reimbursements")
      ])
      const uData = await uRes.json()
      const aData = await aRes.json()
      const rData = await rRes.json()
      if (uData.success) setUsers(uData.users.filter((u: any) => u.role !== "Admin"))
      if (aData.success) setAdvances(aData.data)
      if (rData.success) setReimbursements(rData.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isInitialized) fetchData()
  }, [isInitialized])

  const handleAddAdvance = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/manage-advances", {
        method: "POST",
        body: JSON.stringify(advanceForm)
      })
      const data = await res.json()
      if (data.success) {
        setAdvances([data.data, ...advances])
        setShowAddAdvance(false)
        setAdvanceForm({ userId: "", amount: "", reason: "", splitOverWeeks: "", deductionRate: "" })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateReimbursement = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/manage-reimbursements", {
        method: "PUT",
        body: JSON.stringify({ id, status })
      })
      const data = await res.json()
      if (data.success) {
        setReimbursements(reimbursements.map(r => r.id === id ? { ...r, status } : r))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleCreateReimbursement = async () => {
    if (!reimbForm.userId || !reimbForm.amount || !reimbForm.description) return
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/manage-reimbursements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: reimbForm.userId,
          amount: parseFloat(reimbForm.amount),
          description: reimbForm.description,
          status: reimbForm.status,
        })
      })
      const data = await res.json()
      if (data.success) {
        setReimbursements([data.data, ...reimbursements])
        setShowAddReimbursement(false)
        setReimbForm({ userId: "", amount: "", description: "", status: "APPROVED" })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const getUserName = (id: string) => users.find(u => u.id === id)?.name || "Unknown User"

  if (!isInitialized) return <div className="p-8 text-white">Loading...</div>

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center">
            <FiDollarSign className="text-amber-500" size={17} />
          </div>
          <div>
            <h1 className="page-title">Payroll & Advances</h1>
            <p className="page-subtitle">Manage advances, reimbursements, and weekly vouchers</p>
          </div>
        </div>
        <button onClick={fetchData} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm font-bold flex items-center gap-2">
          <FiRefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="page-body">

        <div className="flex border-b border-white/10">
          <button
            onClick={() => setActiveTab("advances")}
            className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === "advances" ? "border-amber-500 text-amber-400" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
          >
            Company Advances
          </button>
          <button
            onClick={() => setActiveTab("reimbursements")}
            className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === "reimbursements" ? "border-amber-500 text-amber-400" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
          >
            Reimbursements
          </button>
          <button
            onClick={() => setActiveTab("vouchers")}
            className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === "vouchers" ? "border-amber-500 text-amber-400" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
          >
            Pay Vouchers
          </button>
        </div>

        <div className="mt-4">
           {activeTab === "advances" && (
              <div className="glass-panel border border-white/10 rounded-xl p-6">
                 <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-white">Active Advances</h2>
                    <button onClick={() => setShowAddAdvance(!showAddAdvance)} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold flex items-center gap-2">
                      {showAddAdvance ? <FiX /> : <FiPlus />} {showAddAdvance ? "Cancel" : "Issue Advance"}
                    </button>
                 </div>

                 {showAddAdvance && (
                   <form onSubmit={handleAddAdvance} className="bg-neutral-800 p-4 rounded-lg border border-neutral-700 mb-6 space-y-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div>
                         <label className="block text-xs font-bold text-neutral-400 mb-1">Rep</label>
                         <select required value={advanceForm.userId} onChange={e => setAdvanceForm({...advanceForm, userId: e.target.value})} className="w-full glass-panel border border-neutral-700 rounded p-2 text-sm text-white">
                           <option value="">Select Rep...</option>
                           {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                         </select>
                       </div>
                       <div>
                         <label className="block text-xs font-bold text-neutral-400 mb-1">Total Amount ($)</label>
                         <input required type="number" step="0.01" value={advanceForm.amount} onChange={e => setAdvanceForm({...advanceForm, amount: e.target.value})} className="w-full glass-panel border border-neutral-700 rounded p-2 text-sm text-white" />
                       </div>
                       <div>
                         <label className="block text-xs font-bold text-neutral-400 mb-1">Reason</label>
                         <input required type="text" value={advanceForm.reason} onChange={e => setAdvanceForm({...advanceForm, reason: e.target.value})} className="w-full glass-panel border border-neutral-700 rounded p-2 text-sm text-white" />
                       </div>
                       <div>
                         <label className="block text-xs font-bold text-neutral-400 mb-1">Payback Strategy</label>
                         <div className="flex gap-2">
                           <input type="number" placeholder="Split over X weeks" value={advanceForm.splitOverWeeks} onChange={e => setAdvanceForm({...advanceForm, splitOverWeeks: e.target.value, deductionRate: ""})} className="w-full glass-panel border border-neutral-700 rounded p-2 text-sm text-white" />
                           <span className="self-center font-bold text-neutral-500">OR</span>
                           <input type="number" placeholder="$X per week" value={advanceForm.deductionRate} onChange={e => setAdvanceForm({...advanceForm, deductionRate: e.target.value, splitOverWeeks: ""})} className="w-full glass-panel border border-neutral-700 rounded p-2 text-sm text-white" />
                         </div>
                       </div>
                     </div>
                     <div className="flex justify-end">
                       <button disabled={isSubmitting} type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-sm disabled:opacity-50">
                         {isSubmitting ? "Saving..." : "Create Advance"}
                       </button>
                     </div>
                   </form>
                 )}

                 <div className="divide-y divide-neutral-800">
                    {advances.length === 0 ? <p className="text-neutral-500 py-4">No advances found.</p> : advances.map(a => (
                      <div key={a.id} className="py-3 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-white">{getUserName(a.userId)} <span className="text-neutral-500 font-normal">({a.reason})</span></p>
                          <p className="text-xs text-neutral-400">Issued: {fmtDate(a.issueDate)} . {a.splitOverWeeks ? `Split over ${a.splitOverWeeks} weeks` : `$${a.deductionRate}/week`}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-400">{fmt(a.amount)}</p>
                        </div>
                      </div>
                    ))}
                 </div>
              </div>
           )}

           {activeTab === "reimbursements" && (
              <div className="glass-panel border border-white/10 rounded-xl p-6">
                 <div className="flex items-center justify-between mb-4">
                   <h2 className="text-lg font-bold text-white">Reimbursements</h2>
                   <button onClick={() => setShowAddReimbursement(!showAddReimbursement)} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-bold text-white flex items-center gap-2 transition-colors">
                     {showAddReimbursement ? <><FiX /> Cancel</> : <><FiPlus /> New Reimbursement</>}
                   </button>
                 </div>

                 {showAddReimbursement && (
                   <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 mb-4 space-y-3">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                       <div>
                         <label className="block text-xs text-neutral-400 mb-1 font-bold">Rep</label>
                         <select value={reimbForm.userId} onChange={e => setReimbForm({...reimbForm, userId: e.target.value})} className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white">
                           <option value="">Select rep...</option>
                           {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                         </select>
                       </div>
                       <div>
                         <label className="block text-xs text-neutral-400 mb-1 font-bold">Amount</label>
                         <input type="number" step="0.01" placeholder="0.00" value={reimbForm.amount} onChange={e => setReimbForm({...reimbForm, amount: e.target.value})} className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white" />
                       </div>
                       <div className="md:col-span-2">
                         <label className="block text-xs text-neutral-400 mb-1 font-bold">Description</label>
                         <input type="text" placeholder="Gas, meals, supplies, etc." value={reimbForm.description} onChange={e => setReimbForm({...reimbForm, description: e.target.value})} className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white" />
                       </div>
                       <div>
                         <label className="block text-xs text-neutral-400 mb-1 font-bold">Status</label>
                         <select value={reimbForm.status} onChange={e => setReimbForm({...reimbForm, status: e.target.value})} className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white">
                           <option value="APPROVED">Approved</option>
                           <option value="PENDING">Pending</option>
                         </select>
                       </div>
                     </div>
                     <button onClick={handleCreateReimbursement} disabled={isSubmitting || !reimbForm.userId || !reimbForm.amount || !reimbForm.description} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-bold text-white flex items-center gap-2 transition-colors">
                       {isSubmitting ? <FiRefreshCw className="animate-spin" /> : <FiCheck />} Save Reimbursement
                     </button>
                   </div>
                 )}

                 <div className="divide-y divide-neutral-800">
                    {reimbursements.length === 0 ? <p className="text-neutral-500 py-4">No pending reimbursements.</p> : reimbursements.map(r => (
                      <div key={r.id} className="py-3 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-white">{getUserName(r.userId)} <span className={`text-xs px-2 py-0.5 rounded ml-2 ${r.status === 'APPROVED' ? 'bg-emerald-900 text-emerald-400' : r.status === 'REJECTED' ? 'bg-red-900 text-red-400' : 'bg-amber-900 text-amber-400'}`}>{r.status}</span></p>
                          <p className="text-sm text-neutral-300 mt-1">{r.description}</p>
                          <p className="text-xs text-neutral-500 mt-1">Submitted: {fmtDate(r.dateSubmitted)}</p>
                        </div>
                        <div className="text-right flex flex-col items-end gap-2">
                          <p className="font-bold text-emerald-400">{fmt(r.amount)}</p>
                          {r.status === 'PENDING' && (
                            <div className="flex gap-2 mt-2">
                              <button onClick={() => handleUpdateReimbursement(r.id, "APPROVED")} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-bold text-white flex items-center gap-1"><FiCheck /> Approve</button>
                              <button onClick={() => handleUpdateReimbursement(r.id, "REJECTED")} className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-xs font-bold text-white flex items-center gap-1"><FiX /> Reject</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                 </div>
              </div>
           )}

           {activeTab === "vouchers" && (
              <div className="glass-panel border border-white/10 rounded-xl p-6">
                 <h2 className="text-lg font-bold text-white mb-6">Generate Pay Vouchers</h2>
                 
                 <div className="bg-neutral-800 p-6 rounded-lg border border-neutral-700 max-w-xl mx-auto space-y-4">
                   <div>
                     <label className="block text-sm font-bold text-neutral-400 mb-2">Select Rep</label>
                     <select value={selectedVoucherRep} onChange={e => setSelectedVoucherRep(e.target.value)} className="w-full glass-panel border border-neutral-700 rounded-lg p-3 text-white">
                       <option value="">Choose Rep...</option>
                       {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                     </select>
                   </div>
                   
                   <div>
                     <label className="block text-sm font-bold text-neutral-400 mb-2">Select Week (Monday)</label>
                     <input type="date" value={selectedVoucherWeek} onChange={e => setSelectedVoucherWeek(e.target.value)} className="w-full glass-panel border border-neutral-700 rounded-lg p-3 text-white color-scheme-dark" />
                     <p className="text-xs text-neutral-500 mt-1">Pick the Monday of the pay week</p>
                   </div>
                   
                   <div className="pt-4">
                     <button 
                       disabled={!selectedVoucherRep || !selectedVoucherWeek}
                       onClick={() => window.open(`/print/pay-voucher/${selectedVoucherRep}?weekStart=${selectedVoucherWeek}`, "_blank")}
                       className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2"
                     >
                       <FiPrinter /> Preview & Print Voucher
                     </button>
                   </div>
                 </div>
              </div>
           )}
        </div>
      </div>
    </div>
  )
}

