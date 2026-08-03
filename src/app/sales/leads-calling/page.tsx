"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "react-hot-toast"
import {
  FiPhone, FiPhoneCall, FiCheckCircle, FiRefreshCw, FiUserCheck,
  FiXCircle, FiClock, FiPlus, FiBriefcase, FiUsers, FiAlertCircle, FiArrowRight,
  FiFileText, FiChevronDown, FiChevronUp, FiRepeat, FiHelpCircle, FiSend
} from "react-icons/fi"

export default function LeadsCallingPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [releasing, setReleasing] = useState(false)

  // Re-up & Progress Metrics
  const [canReUp, setCanReUp] = useState(false)
  const [processedCount, setProcessedCount] = useState(0)
  const [unprocessedCount, setUnprocessedCount] = useState(0)

  // Cold Call Script Drawer
  const [showScript, setShowScript] = useState(true)
  const [scriptTab, setScriptTab] = useState<"opener" | "specs" | "offer" | "objections">("opener")

  // Disposition Modal States
  const [activeLead, setActiveLead] = useState<any | null>(null)
  const [disposition, setDisposition] = useState("NO_ANSWER")
  const [notes, setNotes] = useState("")
  const [callbackDate, setCallbackDate] = useState("")
  const [savingDisp, setSavingDisp] = useState(false)

  useEffect(() => {
    fetchClaimedBatch(false)
  }, [])

  const fetchClaimedBatch = async (forceReUp = false) => {
    try {
      if (forceReUp) setClaiming(true)
      else setLoading(true)

      const res = await fetch("/api/leads/claim-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetBatchSize: 50, forceReUp })
      })

      const data = await res.json()
      if (data.success && data.leads) {
        setLeads(data.leads)
        setCanReUp(data.canReUp)
        setProcessedCount(data.processedCount || 0)
        setUnprocessedCount(data.unprocessedCount || 0)

        if (data.leads.length > 0) {
          toast.success(data.message || "Loaded 50-lead call campaign batch")
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

  const handleReleaseBatch = async () => {
    if (!confirm("Are you sure you want to release your unconverted leads back to the pool? Other reps will be able to claim them randomly.")) return
    setReleasing(true)
    try {
      const res = await fetch("/api/leads/release-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseAllUnconverted: true })
      })

      const data = await res.json()
      if (data.success) {
        toast.success(`Released ${data.releasedCount} leads back to the main pool.`)
        fetchClaimedBatch(true)
      } else {
        toast.error("Release failed: " + data.error)
      }
    } catch (e) {
      toast.error("Failed to release batch")
    } finally {
      setReleasing(false)
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
        
        // Recompute progress metrics
        const updatedLeads = leads.map(l => l.id === activeLead.id ? { ...l, disposition, dispositionNotes: notes } : l)
        const unproc = updatedLeads.filter(l => !l.disposition).length
        const proc = updatedLeads.length - unproc
        setUnprocessedCount(unproc)
        setProcessedCount(proc)
        setCanReUp(unproc <= 20)

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

  const totalLeadsCount = leads.length
  const progressPct = totalLeadsCount > 0 ? Math.round((processedCount / totalLeadsCount) * 100) : 0

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <FiPhoneCall className="text-orange-400" /> Cold Call Campaign Workstation
          </h1>
          <p className="text-xs text-neutral-400 mt-1 font-medium">
            Random 50-lead batch allocation. Process at least 30 leads before re-upping to top back off to 50 total.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => fetchClaimedBatch(true)}
            disabled={claiming || (!canReUp && leads.length > 0)}
            className="px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 disabled:opacity-40 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all cursor-pointer shrink-0"
          >
            <FiRefreshCw className={claiming ? "animate-spin" : ""} size={14} />
            <span>{claiming ? "Re-upping Batch..." : "Re-up Batch (Top Off to 50)"}</span>
          </button>

          <button
            onClick={handleReleaseBatch}
            disabled={releasing || leads.length === 0}
            className="px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-300 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 border border-white/10"
            title="Recirculate unconverted leads back into the pool for other reps"
          >
            <FiRepeat size={14} className={releasing ? "animate-spin" : ""} />
            <span>Recirculate to Pool</span>
          </button>
        </div>
      </div>

      {/* Batch Progress Tracker */}
      <div className="glass-panel border border-white/10 rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-white flex items-center gap-2">
            📊 Campaign Progress: <span className="text-orange-400 font-black">{processedCount} / {totalLeadsCount} Leads Processed</span> ({progressPct}%)
          </span>
          {canReUp ? (
            <span className="text-emerald-400 flex items-center gap-1">
              <FiCheckCircle /> Re-up Unlocked! You can claim additional leads.
            </span>
          ) : (
            <span className="text-amber-400 flex items-center gap-1">
              <FiClock /> Process {Math.max(0, 30 - processedCount)} more lead(s) to unlock Re-up
            </span>
          )}
        </div>
        <div className="w-full bg-neutral-950 rounded-full h-2.5 overflow-hidden border border-white/5">
          <div
            className="bg-gradient-to-r from-orange-500 to-emerald-400 h-full transition-all duration-500 rounded-full"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Interactive Cold Call Script Panel */}
      <div className="glass-panel border border-orange-500/30 rounded-2xl overflow-hidden shadow-2xl">
        <div
          onClick={() => setShowScript(!showScript)}
          className="bg-orange-950/40 px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-orange-950/60 transition-colors border-b border-orange-500/20"
        >
          <div className="flex items-center gap-2.5">
            <FiFileText className="text-orange-400 text-lg" />
            <h3 className="text-sm font-bold text-white tracking-wide">
              Official Titan Diamond Cold Call Script & Objection Playbook
            </h3>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-orange-400">
            <span>{showScript ? "Hide Script" : "Show Call Script"}</span>
            {showScript ? <FiChevronUp /> : <FiChevronDown />}
          </div>
        </div>

        {showScript && (
          <div className="p-5 space-y-4 bg-neutral-950/80">
            
            {/* Script Navigation Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
              <button
                onClick={() => setScriptTab("opener")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${scriptTab === "opener" ? "bg-orange-500 text-white shadow-md" : "bg-neutral-800 text-neutral-400 hover:text-white"}`}
              >
                1. Opener & Hook
              </button>
              <button
                onClick={() => setScriptTab("specs")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${scriptTab === "specs" ? "bg-orange-500 text-white shadow-md" : "bg-neutral-800 text-neutral-400 hover:text-white"}`}
              >
                2. Fact Finding & Specs
              </button>
              <button
                onClick={() => setScriptTab("offer")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${scriptTab === "offer" ? "bg-orange-500 text-white shadow-md" : "bg-neutral-800 text-neutral-400 hover:text-white"}`}
              >
                3. Factory Offer
              </button>
              <button
                onClick={() => setScriptTab("objections")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${scriptTab === "objections" ? "bg-orange-500 text-white shadow-md" : "bg-neutral-800 text-neutral-400 hover:text-white"}`}
              >
                4. Objection Playbook
              </button>
            </div>

            {/* Script Content Cards */}
            {scriptTab === "opener" && (
              <div className="space-y-2 text-xs text-neutral-200 leading-relaxed bg-black/40 p-4 rounded-xl border border-white/5">
                <p className="font-bold text-orange-400 uppercase tracking-wider text-[11px]">Opening Hook Script:</p>
                <p className="text-sm font-medium italic text-neutral-100">
                  "Hi <span className="text-orange-300 font-bold">[Contact First Name]</span>, my name is <span className="text-orange-300 font-bold">[Your Name]</span> with Titan Diamond Tooling. We manufacture high-performance diamond blades and core bits for concrete and asphalt contractors. I noticed your crew works out of <span className="text-orange-300 font-bold">[City/State]</span>—do you handle the tool purchasing for your jobsites?"
                </p>
              </div>
            )}

            {scriptTab === "specs" && (
              <div className="space-y-3 text-xs text-neutral-200 bg-black/40 p-4 rounded-xl border border-white/5">
                <p className="font-bold text-orange-400 uppercase tracking-wider text-[11px]">Fact Finding Questions:</p>
                <ul className="list-disc list-inside space-y-1.5 text-neutral-300">
                  <li><span className="font-bold text-white">Saw Specs:</span> "What size walk-behind or hand saws are your crews currently running on your active jobs?"</li>
                  <li><span className="font-bold text-white">Cutting Material:</span> "What material are you cutting most frequently—cured concrete, asphalt, green concrete, or reinforced block?"</li>
                  <li><span className="font-bold text-white">Current Lifespan:</span> "How many feet of cut are you typically getting per blade right now?"</li>
                </ul>
              </div>
            )}

            {scriptTab === "offer" && (
              <div className="space-y-2 text-xs text-neutral-200 bg-black/40 p-4 rounded-xl border border-white/5">
                <p className="font-bold text-orange-400 uppercase tracking-wider text-[11px]">Factory-Direct Pitch:</p>
                <p className="text-sm font-medium italic text-neutral-100">
                  "We manufacture our Medusa 14\" and Samurai 18\" blades to last <span className="text-emerald-400 font-bold">30% longer</span> than standard supply house blades because we sell factory-direct with zero distributor markups. If I ship out a trial blade for your crew to test on your next job, would you be open to giving it a run?"
                </p>
              </div>
            )}

            {scriptTab === "objections" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 bg-black/60 rounded-xl border border-white/10 space-y-1">
                  <div className="font-bold text-amber-400 text-xs">"We already have a vendor"</div>
                  <div className="text-[11px] text-neutral-300">"We completely respect that. We actually act as a secondary emergency supplier for contractors when local supply houses run out of specialty specs."</div>
                </div>
                <div className="p-3 bg-black/60 rounded-xl border border-white/10 space-y-1">
                  <div className="font-bold text-amber-400 text-xs">"Send me an email"</div>
                  <div className="text-[11px] text-neutral-300">"I'll send over our factory spec sheet right away! What’s the best direct email to send that to?"</div>
                </div>
                <div className="p-3 bg-black/60 rounded-xl border border-white/10 space-y-1">
                  <div className="font-bold text-amber-400 text-xs">"Price is too high"</div>
                  <div className="text-[11px] text-neutral-300">"Our cost-per-foot is guaranteed lower. If our blade doesn't outlast your current blade, we'll cover the difference."</div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Main Lead Queue Display */}
      {loading ? (
        <div className="text-center py-16">
          <div className="w-10 h-10 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-bold text-neutral-400">Loading campaign leads...</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-16 glass-panel rounded-2xl border border-white/10 p-8 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/10 text-orange-400 flex items-center justify-center mx-auto">
            <FiUsers size={28} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">No Active Claimed Leads</h3>
            <p className="text-xs text-neutral-400 max-w-md mx-auto mt-1">
              You currently have no unworked claimed leads in your workstation queue. Click below to claim a fresh 50-lead batch of confirmed company leads.
            </p>
          </div>
          <button
            onClick={() => fetchClaimedBatch(true)}
            className="px-5 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-xs hover:bg-orange-600 transition-colors shadow-lg cursor-pointer"
          >
            Get 50 Lead Batch
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
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                  >
                    <FiUserCheck size={14} /> Convert Company to Account
                  </button>
                </div>

                {/* Contacts List for Company */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {companyLeads.map((l: any) => (
                    <div key={l.id} className="bg-neutral-950/80 border border-white/5 rounded-xl p-3.5 space-y-2 hover:border-orange-500/30 transition-all">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            {[l.firstName, l.lastName].filter(Boolean).join(" ") || "Contact Person"}
                            {l.title && <span className="text-[10px] text-neutral-400 font-normal">({l.title})</span>}
                          </div>
                          <div className="text-[11px] text-neutral-400 mt-0.5 space-y-0.5">
                            {(l.phone || l.mobile) && <div className="flex items-center gap-1 font-mono text-neutral-300"><FiPhone size={11} className="text-orange-400" /> {l.phone || l.mobile}</div>}
                            {l.email && <div className="text-[10px] text-neutral-400">{l.email}</div>}
                          </div>
                        </div>

                        {l.disposition ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            ✓ {l.disposition.replace(/_/g, " ")}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                            Unworked
                          </span>
                        )}
                      </div>

                      {l.dispositionNotes && (
                        <div className="text-[10px] text-neutral-400 italic bg-black/40 p-2 rounded-lg border border-white/5">
                          "{l.dispositionNotes}"
                        </div>
                      )}

                      <div className="pt-1 flex justify-end">
                        <button
                          onClick={() => setActiveLead(l)}
                          className="px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500 text-orange-400 hover:text-white border border-orange-500/30 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <FiPhoneCall size={12} /> Log Call Outcome
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FiPhoneCall className="text-orange-500" /> Call Outcome: {activeLead.company}
              </h3>
              <button onClick={() => setActiveLead(null)} className="p-1 text-neutral-400 hover:text-white">
                <FiXCircle size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-neutral-400 block mb-1">Call Disposition Outcome</label>
                <select
                  value={disposition}
                  onChange={e => setDisposition(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="NO_ANSWER">📞 No Answer</option>
                  <option value="LEFT_VOICEMAIL">🗣️ Left Voicemail</option>
                  <option value="SCHEDULED_CALLBACK">📅 Scheduled Callback</option>
                  <option value="NOT_INTERESTED">❌ Not Interested</option>
                  <option value="WRONG_NUMBER">🚫 Wrong Number / Disconnected</option>
                </select>
              </div>

              {disposition === "SCHEDULED_CALLBACK" && (
                <div>
                  <label className="text-xs font-bold text-neutral-400 block mb-1">Callback Date & Time</label>
                  <input
                    type="datetime-local"
                    value={callbackDate}
                    onChange={e => setCallbackDate(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-neutral-400 block mb-1">Call Notes & Equipment Details</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Record blade sizes, equipment used, decision maker feedback..."
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setActiveLead(null)}
                className="px-4 py-2 bg-neutral-800 text-neutral-300 text-xs font-bold rounded-xl hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDisposition}
                disabled={savingDisp}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-xl transition-colors shadow-md flex items-center gap-1.5"
              >
                {savingDisp ? "Saving..." : "Save Outcome"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
