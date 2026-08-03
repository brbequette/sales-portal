"use client"

import { useState, useEffect } from "react"
import { toast } from "react-hot-toast"
import {
  FiAlertTriangle, FiCheckCircle, FiGitMerge, FiShuffle, FiSearch,
  FiRefreshCw, FiBriefcase, FiPhone, FiMapPin
} from "react-icons/fi"

export default function AdminLeadDiscrepanciesPage() {
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [processing, setProcessing] = useState(false)

  // Merge modal states
  const [selectedGroup, setSelectedGroup] = useState<any[] | null>(null)
  const [targetCompanyName, setTargetCompanyName] = useState("")

  useEffect(() => {
    fetchDiscrepancies(page)
  }, [page])

  const fetchDiscrepancies = async (p = 1) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/admin/lead-discrepancies?page=${p}&limit=50`)
      const data = await res.json()
      if (data.success && data.leads) {
        setLeads(data.leads)
        setTotalCount(data.totalCount || 0)
      } else {
        toast.error("Failed to load discrepancies: " + (data.error || "Unknown error"))
      }
    } catch (e) {
      toast.error("Failed to fetch lead discrepancies")
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmMerge = async (leadIds: string[], companyName: string) => {
    setProcessing(true)
    try {
      const res = await fetch("/api/admin/lead-discrepancies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm_merge",
          leadIds,
          targetCompanyName: companyName
        })
      })

      const data = await res.json()
      if (data.success) {
        toast.success(data.message || "Leads merged and confirmed!")
        setSelectedGroup(null)
        fetchDiscrepancies(page)
      } else {
        toast.error("Error: " + data.error)
      }
    } catch (e) {
      toast.error("Failed to merge leads")
    } finally {
      setProcessing(false)
    }
  }

  const handleSeparateLeads = async (leadIds: string[]) => {
    setProcessing(true)
    try {
      const res = await fetch("/api/admin/lead-discrepancies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "separate_leads",
          leadIds
        })
      })

      const data = await res.json()
      if (data.success) {
        toast.success(data.message || "Leads separated into independent company groups!")
        fetchDiscrepancies(page)
      } else {
        toast.error("Error: " + data.error)
      }
    } catch (e) {
      toast.error("Failed to separate leads")
    } finally {
      setProcessing(false)
    }
  }

  // Group questionable leads by phone or address discrepancy
  const groupedDiscrepancies = leads.reduce((acc: any, l: any) => {
    const key = l.phone || l.mobile || (l.street ? `${l.street}, ${l.city}` : "Unknown Discrepancy")
    if (!acc[key]) acc[key] = []
    acc[key].push(l)
    return acc
  }, {})

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <FiAlertTriangle className="text-amber-400" /> Admin Lead Discrepancies & Questionable Matches
          </h1>
          <p className="text-xs text-neutral-400 mt-1 font-medium">
            Review and resolve questionable leads matching on phone number or physical address with conflicting company names.
          </p>
        </div>

        <button
          onClick={() => fetchDiscrepancies(page)}
          className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 border border-white/10 transition-colors cursor-pointer shrink-0"
        >
          <FiRefreshCw size={14} /> Refresh Discrepancies
        </button>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">Questionable Lead Records</span>
          <span className="text-2xl font-black text-white mt-1 block">{totalCount}</span>
        </div>
        <div className="glass-panel p-4 rounded-xl border border-white/10">
          <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Discrepancy Groups</span>
          <span className="text-2xl font-black text-white mt-1 block">{Object.keys(groupedDiscrepancies).length}</span>
        </div>
        <div className="glass-panel p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">Matching Policy</span>
          <span className="text-xs font-bold text-neutral-300 mt-1 block">Reps only receive 100% confirmed matches until resolved.</span>
        </div>
      </div>

      {/* Discrepancies List */}
      {loading ? (
        <div className="text-center py-16">
          <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-bold text-neutral-400">Loading questionable lead groups...</p>
        </div>
      ) : Object.keys(groupedDiscrepancies).length === 0 ? (
        <div className="text-center py-16 glass-panel rounded-2xl border border-white/10 p-8">
          <FiCheckCircle size={36} className="text-emerald-400 mx-auto mb-2" />
          <h3 className="text-base font-bold text-white">No Lead Discrepancies Found</h3>
          <p className="text-xs text-neutral-400 mt-1">All leads in PostgreSQL have 100% confirmed company matching!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedDiscrepancies).map(([matchKey, groupLeads]: [string, any]) => (
            <div key={matchKey} className="glass-panel border border-amber-500/20 rounded-2xl p-5 space-y-4 shadow-xl">
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <div className="text-xs font-black text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                    <FiAlertTriangle size={13} /> Questionable Match Key: {matchKey}
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {groupLeads.length} Lead Records sharing phone/address with {new Set(groupLeads.map((l: any) => l.company)).size} different company names.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedGroup(groupLeads)
                      setTargetCompanyName(groupLeads[0].company)
                    }}
                    className="px-3.5 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                  >
                    <FiGitMerge size={14} /> Merge & Confirm
                  </button>
                  <button
                    onClick={() => handleSeparateLeads(groupLeads.map((l: any) => l.id))}
                    disabled={processing}
                    className="px-3.5 py-2 bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
                  >
                    <FiShuffle size={14} /> Separate Companies
                  </button>
                </div>
              </div>

              {/* Group Lead Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {groupLeads.map((l: any) => (
                  <div key={l.id} className="bg-black/50 border border-white/10 rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <FiBriefcase className="text-orange-400" /> {l.company}
                        </h4>
                        <div className="text-xs text-neutral-300 font-medium mt-0.5">
                          {[l.firstName, l.lastName].filter(Boolean).join(" ") || "Contact"} {l.title ? `(${l.title})` : ""}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {l.matchStatus}
                      </span>
                    </div>

                    <div className="text-xs text-neutral-400 space-y-0.5 pt-2 border-t border-white/5">
                      {l.phone || l.mobile ? <div className="flex items-center gap-1.5"><FiPhone size={12} /> {l.phone || l.mobile}</div> : null}
                      {l.street ? <div className="flex items-center gap-1.5"><FiMapPin size={12} /> {l.street}, {l.city} {l.state}</div> : null}
                    </div>

                    {l.matchReason && (
                      <p className="text-[11px] text-amber-400/90 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                        {l.matchReason}
                      </p>
                    )}
                  </div>
                ))}
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Merge Confirmation Modal */}
      {selectedGroup && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FiGitMerge className="text-emerald-400" /> Merge & Standardize Company Name
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">Unify {selectedGroup.length} leads under a single company name and unlock for sales reps.</p>
              </div>
              <button onClick={() => setSelectedGroup(null)} className="text-neutral-400 hover:text-white font-bold text-lg">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1.5">Standardized Target Company Name</label>
                <input
                  type="text"
                  value={targetCompanyName}
                  onChange={e => setTargetCompanyName(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="bg-black/40 border border-white/10 rounded-xl p-3 space-y-2">
                <span className="text-[11px] font-bold text-neutral-400 block uppercase">Leads to be merged:</span>
                {selectedGroup.map((l: any) => (
                  <div key={l.id} className="text-xs text-neutral-300 flex items-center justify-between">
                    <span>{[l.firstName, l.lastName].filter(Boolean).join(" ") || "Contact"}</span>
                    <span className="text-[10px] text-neutral-500">Currently: {l.company}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => setSelectedGroup(null)}
                className="px-4 py-2 bg-neutral-800 text-neutral-300 text-xs font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmMerge(selectedGroup.map((l: any) => l.id), targetCompanyName)}
                disabled={processing}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-lg flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {processing ? "Merging..." : "Confirm & Merge"}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
