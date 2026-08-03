"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "react-hot-toast"
import {
  FiPhone, FiPhoneCall, FiCheckCircle, FiRefreshCw, FiUserCheck,
  FiXCircle, FiClock, FiPlus, FiBriefcase, FiUsers, FiAlertCircle, FiArrowRight
} from "react-icons/fi"

export default function LeadsCallingPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [claiming, setClaiming] = useState(false)

  // Disposition Modal States
  const [activeLead, setActiveLead] = useState<any | null>(null)
  const [disposition, setDisposition] = useState("NO_ANSWER")
  const [notes, setNotes] = useState("")
  const [callbackDate, setCallbackDate] = useState("")
  const [savingDisp, setSavingDisp] = useState(false)

  useEffect(() => {
    fetchClaimedBatch(false)
  }, [])

  const fetchClaimedBatch = async (forceNew = false) => {
    try {
      if (forceNew) setClaiming(true)
      else setLoading(true)

      const res = await fetch("/api/leads/claim-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize: 10, forceNew })
      })

      const data = await res.json()
      if (data.success && data.leads) {
        setLeads(data.leads)
        if (data.leads.length > 0) {
          toast.success(data.message || "Loaded batch of confirmed leads")
        } else {
          toast.error("No available unallocated confirmed lead batches remaining.")
        }
      } else {
        toast.error("Failed to load lead batch: " + (data.error || "Unknown error"))
      }
    } catch (e) {
      toast.error("Failed to claim lead batch")
    } finally {
      setLoading(false)
      setClaiming(false)
    }
  }

  const handleSaveDisposition = async () => {
    if (!activeLead) return
    setSavingDisp(true)
    try {
      const res = await fetch("/api/leads/disposition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: activeLead.id,
          disposition,
          notes,
          callbackDate: disposition === "SCHEDULED_CALLBACK" ? callbackDate : null
        })
      })

      const data = await res.json()
      if (data.success) {
        toast.success(`Lead '${activeLead.company}' disposition saved.`)
        setLeads(prev => prev.map(l => l.id === activeLead.id ? { ...l, disposition, dispositionNotes: notes } : l))
        setActiveLead(null)
        setNotes("")
        setCallbackDate("")
      } else {
        toast.error("Error: " + data.error)
      }
    } catch (e) {
      toast.error("Failed to save disposition")
    } finally {
      setSavingDisp(false)
    }
  }

  const handleConvertCompany = async (companyLead: any) => {
    try {
      setLoading(true)
      const res = await fetch("/api/leads/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: companyLead.id,
          companyName: companyLead.company,
          contactFirstName: companyLead.firstName,
          contactLastName: companyLead.lastName,
          phone: companyLead.phone || companyLead.mobile,
          email: companyLead.email
        })
      })

      const data = await res.json()
      if (data.success && data.accountId) {
        toast.success(`Company '${companyLead.company}' and all matching contacts converted!`)
        router.push(`/account?id=${data.accountId}`)
      } else {
        toast.error("Conversion failed: " + (data.error || "Unknown error"))
      }
    } catch (e) {
      toast.error("Failed to convert lead")
    } finally {
      setLoading(false)
    }
  }

  // Group leads by company
  const companyGroups = leads.reduce((acc: any, l: any) => {
    const comp = (l.company || "Individual Lead").trim()
    if (!acc[comp]) acc[comp] = []
    acc[comp].push(l)
    return acc
  }, {})

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <FiPhoneCall className="text-orange-400" /> High-Velocity Lead Calling Queue
          </h1>
          <p className="text-xs text-neutral-400 mt-1 font-medium">
            Process randomized batches of 100% confirmed company leads. Call contacts, record dispositions, or convert to Accounts.
          </p>
        </div>

        <button
          onClick={() => fetchClaimedBatch(true)}
          disabled={claiming}
          className="px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all cursor-pointer disabled:opacity-50 shrink-0"
        >
          <FiRefreshCw className={claiming ? "animate-spin" : ""} size={14} />
          <span>{claiming ? "Claiming Batch..." : "Get Next Batch of Leads"}</span>
        </button>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="text-center py-16">
          <div className="w-10 h-10 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-bold text-neutral-400">Loading confirmed lead batch...</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-16 glass-panel rounded-2xl border border-white/10 p-8 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/10 text-orange-400 flex items-center justify-center mx-auto">
            <FiUsers size={28} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">No Active Claimed Leads</h3>
            <p className="text-xs text-neutral-400 max-w-md mx-auto mt-1">
              You currently have no unworked claimed leads in your workstation queue. Click below to claim a fresh batch of confirmed company leads.
            </p>
          </div>
          <button
            onClick={() => fetchClaimedBatch(true)}
            className="px-5 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-xs hover:bg-orange-600 transition-colors shadow-lg cursor-pointer"
          >
            Get Batch of Leads
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          
          <div className="flex items-center justify-between text-xs text-neutral-400 font-bold px-1">
            <span>Showing {Object.keys(companyGroups).length} Company Groups ({leads.length} Total Lead Contacts)</span>
            <span className="text-emerald-400">✓ 100% Confirmed Company Matches</span>
          </div>

          <div className="space-y-4">
            {Object.entries(companyGroups).map(([companyName, companyLeads]: [string, any]) => (
              <div key={companyName} className="glass-panel border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl">
                
                {/* Company Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center font-black text-base shadow-md">
                      {companyName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white tracking-tight">{companyName}</h3>
                      <div className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-2">
                        <span className="text-orange-400 font-bold uppercase tracking-wider">{companyLeads.length} Verified Contact{companyLeads.length > 1 ? "s" : ""}</span>
                        {companyLeads[0]?.city && <span>• {companyLeads[0].city}, {companyLeads[0].state}</span>}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleConvertCompany(companyLeads[0])}
                    className="px-4 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer shrink-0"
                  >
                    <FiCheckCircle size={14} />
                    <span>Convert Company to Account</span>
                  </button>
                </div>

                {/* Contacts Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {companyLeads.map((l: any) => (
                    <div key={l.id} className="bg-black/40 border border-white/10 hover:border-white/20 rounded-xl p-4 space-y-3 transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-bold text-white flex items-center gap-2">
                            {[l.firstName, l.lastName].filter(Boolean).join(" ") || "Unnamed Contact"}
                            {l.title && <span className="text-[10px] text-neutral-500 font-normal">({l.title})</span>}
                          </div>
                          <div className="text-xs text-neutral-400 mt-1 space-y-0.5">
                            {l.phone || l.mobile ? <div className="flex items-center gap-1.5"><FiPhone size={12} className="text-neutral-500" /> <span>{l.phone || l.mobile}</span></div> : null}
                            {l.email ? <div className="flex items-center gap-1.5"><span>✉️</span> <span>{l.email}</span></div> : null}
                          </div>
                        </div>

                        {l.disposition ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            {l.disposition}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-neutral-800 text-neutral-400 border border-white/10">
                            UNWORKED
                          </span>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                        <button
                          onClick={() => {
                            setActiveLead(l)
                            setNotes(l.dispositionNotes || "")
                          }}
                          className="flex-1 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-bold hover:bg-blue-500/30 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <FiPhoneCall size={13} />
                          <span>Call & Disposition</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            ))}
          </div>

        </div>
      )}

      {/* Disposition Modal */}
      {activeLead && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FiPhoneCall className="text-orange-400" /> Call Disposition: {[activeLead.firstName, activeLead.lastName].filter(Boolean).join(" ")}
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">{activeLead.company} • {activeLead.phone || activeLead.mobile || "No phone"}</p>
              </div>
              <button onClick={() => setActiveLead(null)} className="text-neutral-400 hover:text-white text-lg font-bold">✕</button>
            </div>

            <div className="space-y-4">
              
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1.5">Call Disposition Result</label>
                <select
                  value={disposition}
                  onChange={e => setDisposition(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="NO_ANSWER">📞 No Answer</option>
                  <option value="LEFT_VOICEMAIL">🗣️ Left Voicemail</option>
                  <option value="SCHEDULED_CALLBACK">📅 Scheduled Callback</option>
                  <option value="NOT_INTERESTED">🚫 Not Interested</option>
                  <option value="WRONG_NUMBER">❌ Wrong Number / Bad Info</option>
                  <option value="CONVERTED">✅ Decision Maker / Convert Account</option>
                </select>
              </div>

              {disposition === "SCHEDULED_CALLBACK" && (
                <div>
                  <label className="text-xs font-bold text-neutral-300 block mb-1.5">Callback Date & Time</label>
                  <input
                    type="datetime-local"
                    value={callbackDate}
                    onChange={e => setCallbackDate(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1.5">Call Notes & Fact Finding</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Enter details gathered during call, equipment specs, or callback notes..."
                  className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>

            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => setActiveLead(null)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDisposition}
                disabled={savingDisp}
                className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl shadow-lg flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {savingDisp ? "Saving..." : "Save Disposition"}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
