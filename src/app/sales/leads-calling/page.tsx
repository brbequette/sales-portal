"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "react-hot-toast"
import {
  FiPhone, FiPhoneCall, FiCheckCircle, FiRefreshCw, FiUserCheck,
  FiXCircle, FiClock, FiPlus, FiBriefcase, FiUsers, FiAlertCircle, FiArrowRight,
  FiFileText, FiChevronDown, FiChevronUp, FiRepeat, FiHelpCircle, FiSend,
  FiUserPlus, FiUserX, FiStar, FiChevronLeft, FiChevronRight, FiGrid, FiList, FiSlash
} from "react-icons/fi"
import { PhoneLink } from "@/components/PhoneLink"

export default function LeadsCallingPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [releasing, setReleasing] = useState(false)

  // View Mode: Focus (1 call at a time) vs Queue (all companies)
  const [viewMode, setViewMode] = useState<"focus" | "queue">("focus")
  const [currentCompanyIndex, setCurrentCompanyIndex] = useState(0)

  // Re-up & Progress Metrics
  const [canReUp, setCanReUp] = useState(false)
  const [processedCount, setProcessedCount] = useState(0)
  const [unprocessedCount, setUnprocessedCount] = useState(0)

  // Cold Call Script Drawer
  const [showScript, setShowScript] = useState(true)
  const [scriptTab, setScriptTab] = useState<"opener" | "specs" | "offer" | "objections">("opener")

  // Primary Buyer & Excluded Contacts State per Company (companyName -> buyerLeadId)
  const [primaryBuyers, setPrimaryBuyers] = useState<Record<string, string>>({})
  // companyName -> Set<leadId>
  const [excludedContacts, setExcludedContacts] = useState<Record<string, string[]>>({})

  // Disposition Modal States
  const [activeLead, setActiveLead] = useState<any | null>(null)
  const [disposition, setDisposition] = useState("NO_ANSWER")
  const [notes, setNotes] = useState("")
  const [callbackDate, setCallbackDate] = useState("")
  const [savingDisp, setSavingDisp] = useState(false)

  // Add Contact Modal State
  const [addContactModal, setAddContactModal] = useState<{ company: string } | null>(null)
  const [newFirstName, setNewFirstName] = useState("")
  const [newLastName, setNewLastName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newTitle, setNewTitle] = useState("")
  const [isNewBuyer, setIsNewBuyer] = useState(true)
  const [addingContact, setAddingContact] = useState(false)

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
        body: JSON.stringify({ targetBatchSize: 50, forceReUp }),
      })

      const data = await res.json()
      if (data.success && data.leads) {
        setLeads(data.leads)
        setCanReUp(data.canReUp)
        setProcessedCount(data.processedCount || 0)
        setUnprocessedCount(data.unprocessedCount || 0)

        // Initialize primary buyers default to first contact of each company
        const defaultBuyers: Record<string, string> = {}
        const defaultExcluded: Record<string, string[]> = {}

        data.leads.forEach((l: any) => {
          const comp = (l.company || "Individual Lead").trim()
          if (!defaultBuyers[comp] && l.disposition === "PRIMARY_BUYER") {
            defaultBuyers[comp] = l.id
          }
          if (["NO_LONGER_WITH_COMPANY", "OUT_OF_BUSINESS", "WRONG_NUMBER", "DO_NOT_CALL", "LEFT_COMPANY", "EXCLUDED"].includes(l.disposition || "")) {
            if (!defaultExcluded[comp]) defaultExcluded[comp] = []
            defaultExcluded[comp].push(l.id)
          }
        })

        setPrimaryBuyers(prev => ({ ...defaultBuyers, ...prev }))
        setExcludedContacts(prev => ({ ...defaultExcluded, ...prev }))

        if (data.leads.length > 0) {
          toast.success(data.message || "Loaded 50-lead cold call campaign batch")
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
    if (!confirm("Are you sure you want to release your unconverted leads back to the pool? Other reps will be able to claim them.")) return
    setReleasing(true)
    try {
      const res = await fetch("/api/leads/release-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseAllUnconverted: true }),
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

  // Handle Contact Disposition / Exclude
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
          callbackDate: disposition === "SCHEDULED_CALLBACK" ? callbackDate : null,
        }),
      })

      const data = await res.json()
      if (data.success) {
        toast.success(`Contact status '${disposition.replace(/_/g, " ")}' saved!`)
        const comp = (activeLead.company || "Individual Lead").trim()

        // Update local state
        setLeads(prev => prev.map(l => l.id === activeLead.id ? { ...l, disposition, dispositionNotes: notes } : l))

        // If Primary Buyer selected, set as primary buyer for this company
        if (disposition === "PRIMARY_BUYER") {
          setPrimaryBuyers(prev => ({ ...prev, [comp]: activeLead.id }))
        }

        // If Excluded status selected, add to excluded contacts
        if (["NOT_THE_BUYER", "NO_LONGER_WITH_COMPANY", "OUT_OF_BUSINESS", "WRONG_NUMBER", "DO_NOT_CALL", "LEFT_COMPANY", "EXCLUDED"].includes(disposition)) {
          setExcludedContacts(prev => ({
            ...prev,
            [comp]: Array.from(new Set([...(prev[comp] || []), activeLead.id]))
          }))
        }

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

  // Add new Contact to Company
  const handleAddContactSubmit = async () => {
    if (!addContactModal?.company) return
    if (!newFirstName && !newLastName) return toast.error("Please enter a contact name.")
    if (!newPhone && !newEmail) return toast.error("Please enter a phone or email.")

    setAddingContact(true)
    try {
      const res = await fetch("/api/leads/add-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: addContactModal.company,
          firstName: newFirstName,
          lastName: newLastName,
          phone: newPhone,
          email: newEmail,
          title: newTitle,
          isBuyer: isNewBuyer,
        }),
      })

      const data = await res.json()
      if (data.success && data.lead) {
        toast.success(data.message || "New contact added!")
        setLeads(prev => [data.lead, ...prev])

        if (isNewBuyer) {
          setPrimaryBuyers(prev => ({ ...prev, [addContactModal.company]: data.lead.id }))
        }

        setAddContactModal(null)
        setNewFirstName("")
        setNewLastName("")
        setNewPhone("")
        setNewEmail("")
        setNewTitle("")
      } else {
        toast.error("Failed to add contact: " + data.error)
      }
    } catch (e) {
      toast.error("Failed to add contact")
    } finally {
      setAddingContact(false)
    }
  }

  // Convert Company to Account & Redirect immediately to Account Screen
  const handleConvertCompany = async (companyName: string, companyLeads: any[]) => {
    const buyerId = primaryBuyers[companyName] || companyLeads[0]?.id
    const buyerLead = companyLeads.find((l: any) => l.id === buyerId) || companyLeads[0]
    const excludedIds = excludedContacts[companyName] || []

    try {
      setLoading(true)
      const res = await fetch("/api/leads/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          leadId: buyerLead?.id,
          buyerLeadId: buyerLead?.id,
          excludedLeadIds: excludedIds,
          contactFirstName: buyerLead?.firstName,
          contactLastName: buyerLead?.lastName,
          phone: buyerLead?.phone || buyerLead?.mobile,
          email: buyerLead?.email,
        }),
      })

      const data = await res.json()
      if (data.success && data.accountId) {
        toast.success(`Company '${companyName}' converted! Redirecting to Account screen to process order...`)
        router.push(`/account?id=${data.accountId}`)
      } else {
        toast.error("Conversion failed: " + (data.error || "Unknown error"))
      }
    } catch (e) {
      toast.error("Failed to convert company")
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

  const companyKeys = Object.keys(companyGroups)
  const totalLeadsCount = leads.length
  const progressPct = totalLeadsCount > 0 ? Math.round((processedCount / totalLeadsCount) * 100) : 0

  const currentCompany = companyKeys[currentCompanyIndex] || ""
  const currentCompanyLeads: any[] = companyGroups[currentCompany] || []

  // Active vs Excluded contacts for current company
  const currentExcludedSet = new Set(excludedContacts[currentCompany] || [])
  const activeContacts = currentCompanyLeads.filter(
    l => !currentExcludedSet.has(l.id) && !["NO_LONGER_WITH_COMPANY", "OUT_OF_BUSINESS", "WRONG_NUMBER", "DO_NOT_CALL", "LEFT_COMPANY", "EXCLUDED"].includes(l.disposition || "")
  )
  const excludedContactList = currentCompanyLeads.filter(
    l => currentExcludedSet.has(l.id) || ["NO_LONGER_WITH_COMPANY", "OUT_OF_BUSINESS", "WRONG_NUMBER", "DO_NOT_CALL", "LEFT_COMPANY", "EXCLUDED"].includes(l.disposition || "")
  )

  return (
    <div className="page-content">
      {/* ─── Header ─────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center justify-center">
            <FiPhoneCall className="text-orange-400" size={17} />
          </div>
          <div>
            <h1 className="page-title">Cold Call Campaign Workstation</h1>
            <p className="page-subtitle">Identify the buyer, weed out non-buyers &amp; convert directly into Accounts &amp; Orders</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex bg-black/40 border border-white/10 rounded-xl p-1 text-xs">
            <button
              onClick={() => setViewMode("focus")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${viewMode === "focus" ? "bg-orange-500 text-white shadow-md" : "text-neutral-400 hover:text-white"}`}
            >
              <FiPhoneCall size={13} /> Focus Campaign (1 Call at a Time)
            </button>
            <button
              onClick={() => setViewMode("queue")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${viewMode === "queue" ? "bg-orange-500 text-white shadow-md" : "text-neutral-400 hover:text-white"}`}
            >
              <FiGrid size={13} /> All Companies Queue ({companyKeys.length})
            </button>
          </div>

          <button
            onClick={() => fetchClaimedBatch(true)}
            disabled={claiming || (!canReUp && leads.length > 0)}
            className="td-btn td-btn-warning td-btn-sm disabled:opacity-40"
          >
            <FiRefreshCw className={claiming ? "animate-spin" : ""} size={13} />
            {claiming ? "Re-upping..." : "Re-up Batch (Top Off to 50)"}
          </button>
          <button
            onClick={handleReleaseBatch}
            disabled={releasing || leads.length === 0}
            className="td-btn td-btn-ghost td-btn-sm disabled:opacity-40"
            title="Recirculate unconverted leads back into the pool for other reps"
          >
            <FiRepeat size={13} className={releasing ? "animate-spin" : ""} />
            Recirculate to Pool
          </button>
        </div>
      </div>

      {/* ─── Body ───────────────────────────────────── */}
      <div className="page-body animate-fade-in space-y-4">

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
                Official Titan Diamond Cold Call Script &amp; Objection Playbook
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-orange-400">
              <span>{showScript ? "Hide Script" : "Show Call Script"}</span>
              {showScript ? <FiChevronUp /> : <FiChevronDown />}
            </div>
          </div>

          {showScript && (
            <div className="p-5 space-y-4 bg-neutral-950/80">
              <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
                <button
                  onClick={() => setScriptTab("opener")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${scriptTab === "opener" ? "bg-orange-500 text-white shadow-md" : "bg-neutral-800 text-neutral-400 hover:text-white"}`}
                >
                  1. Opener &amp; Hook
                </button>
                <button
                  onClick={() => setScriptTab("specs")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${scriptTab === "specs" ? "bg-orange-500 text-white shadow-md" : "bg-neutral-800 text-neutral-400 hover:text-white"}`}
                >
                  2. Fact Finding &amp; Buyer Intro
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

              {scriptTab === "opener" && (
                <div className="space-y-2 text-xs text-neutral-200 leading-relaxed bg-black/40 p-4 rounded-xl border border-white/5">
                  <p className="font-bold text-orange-400 uppercase tracking-wider text-[11px]">Opening Hook Script:</p>
                  <p className="text-sm font-medium italic text-neutral-100">
                    "Hi <span className="text-orange-300 font-bold">[Contact Name]</span>, my name is <span className="text-orange-300 font-bold">[Your Name]</span> with Titan Diamond Tooling. We manufacture high-performance diamond blades and core bits for concrete contractors. I noticed your crew works out of <span className="text-orange-300 font-bold">[City/State]</span>—are you the person who handles tool and blade purchasing for your jobsites?"
                  </p>
                </div>
              )}

              {scriptTab === "specs" && (
                <div className="space-y-3 text-xs text-neutral-200 bg-black/40 p-4 rounded-xl border border-white/5">
                  <p className="font-bold text-orange-400 uppercase tracking-wider text-[11px]">Identifying the Buyer:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-neutral-300">
                    <li><span className="font-bold text-white">Not the Buyer?</span> "Got it! Who handles purchasing or blade orders for your field crews? Could you patch me through or give me their direct line?"</li>
                    <li><span className="font-bold text-white">Saw Specs:</span> "What size walk-behind or hand saws are your crews currently running on your active jobs?"</li>
                    <li><span className="font-bold text-white">Cutting Material:</span> "What material are you cutting most frequently—cured concrete, asphalt, or reinforced block?"</li>
                  </ul>
                </div>
              )}

              {scriptTab === "offer" && (
                <div className="space-y-2 text-xs text-neutral-200 bg-black/40 p-4 rounded-xl border border-white/5">
                  <p className="font-bold text-orange-400 uppercase tracking-wider text-[11px]">Factory-Direct Pitch:</p>
                  <p className="text-sm font-medium italic text-neutral-100">
                    "We manufacture our Medusa 14\" and Samurai 18\" blades to last <span className="text-emerald-400 font-bold">30% longer</span> than standard supply house blades because we sell factory-direct with zero distributor markups. If I set up your account today with 30-day terms, would you be open to running a test order on your next job?"
                  </p>
                </div>
              )}

              {scriptTab === "objections" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-black/60 rounded-xl border border-white/10 space-y-1">
                    <div className="font-bold text-amber-400 text-xs">"We already have a vendor"</div>
                    <div className="text-[11px] text-neutral-300">"We completely respect that. We actually act as a primary factory supplier for contractors when local supply houses markup prices."</div>
                  </div>
                  <div className="p-3 bg-black/60 rounded-xl border border-white/10 space-y-1">
                    <div className="font-bold text-amber-400 text-xs">"Send me an email"</div>
                    <div className="text-[11px] text-neutral-300">"I'll send over our factory spec sheet right away! What’s the best direct email for your purchasing manager?"</div>
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

        {/* ─── Main Workstation Queue Display ─────────────────── */}
        {loading ? (
          <div className="text-center py-16">
            <div className="w-10 h-10 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-neutral-400">Loading campaign workstation leads...</p>
          </div>
        ) : companyKeys.length === 0 ? (
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
        ) : viewMode === "focus" ? (
          /* ─── 1. FOCUS CAMPAIGN MODE (ONE CALL AT A TIME) ─── */
          <div className="space-y-4">
            
            {/* Focus Navigator Toolbar */}
            <div className="glass-panel border border-white/10 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xl">
              <div className="flex items-center gap-3">
                <span className="text-xs font-black uppercase tracking-widest text-orange-400">
                  Company {currentCompanyIndex + 1} of {companyKeys.length}
                </span>
                <span className="text-xs text-neutral-500">|</span>
                <span className="text-sm font-bold text-white">{currentCompany}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentCompanyIndex(p => Math.max(0, p - 1))}
                  disabled={currentCompanyIndex === 0}
                  className="px-3 py-1.5 rounded-xl bg-neutral-800 text-neutral-300 hover:text-white text-xs font-bold border border-white/10 disabled:opacity-40 transition-all flex items-center gap-1 cursor-pointer"
                >
                  <FiChevronLeft /> Previous
                </button>
                <button
                  onClick={() => setCurrentCompanyIndex(p => Math.min(companyKeys.length - 1, p + 1))}
                  disabled={currentCompanyIndex >= companyKeys.length - 1}
                  className="px-3 py-1.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 text-xs font-bold border border-orange-500/30 disabled:opacity-40 transition-all flex items-center gap-1 cursor-pointer"
                >
                  Next Company <FiChevronRight />
                </button>
              </div>
            </div>

            {/* Active Company Focus Card */}
            <div className="glass-panel border border-orange-500/40 rounded-2xl p-6 space-y-6 shadow-2xl bg-gradient-to-b from-neutral-900 to-black">
              
              {/* Header & Convert Button */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center font-black text-xl shadow-xl">
                    {currentCompany.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white tracking-tight">{currentCompany}</h2>
                    <div className="text-xs text-neutral-400 mt-1 flex items-center gap-3">
                      <span className="text-emerald-400 font-bold">{activeContacts.length} Active Contact{activeContacts.length !== 1 ? "s" : ""}</span>
                      {excludedContactList.length > 0 && <span className="text-rose-400">({excludedContactList.length} Excluded)</span>}
                      {currentCompanyLeads[0]?.city && (
                        <span>• {currentCompanyLeads[0].city}, {currentCompanyLeads[0].state}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    onClick={() => setAddContactModal({ company: currentCompany })}
                    className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-white/10 transition-all cursor-pointer"
                  >
                    <FiUserPlus size={14} className="text-orange-400" /> + Add Buyer / Contact
                  </button>

                  <button
                    onClick={() => handleConvertCompany(currentCompany, currentCompanyLeads)}
                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs font-black rounded-xl flex items-center gap-2 transition-all shadow-xl cursor-pointer hover:scale-[1.02] active:scale-95"
                  >
                    <FiUserCheck size={16} /> Convert Company to Account &amp; Order
                  </button>
                </div>
              </div>

              {/* Active Contacts Grid for Focus Mode */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-neutral-400">
                  <span className="uppercase tracking-wider">Select Buyer &amp; Call Contacts:</span>
                  <span className="text-[11px] text-neutral-500">Determine the buyer to set primary contact on account conversion</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeContacts.map((l: any) => {
                    const isSelectedBuyer = (primaryBuyers[currentCompany] || activeContacts[0]?.id) === l.id

                    return (
                      <div
                        key={l.id}
                        className={`rounded-2xl p-4 space-y-3 border transition-all ${
                          isSelectedBuyer
                            ? "bg-emerald-950/20 border-emerald-500/50 shadow-lg"
                            : "bg-neutral-950/80 border-white/10 hover:border-orange-500/30"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-3">
                            {/* Primary Buyer Radio Selector */}
                            <input
                              type="radio"
                              name={`buyer_${currentCompany}`}
                              checked={isSelectedBuyer}
                              onChange={() => setPrimaryBuyers(prev => ({ ...prev, [currentCompany]: l.id }))}
                              className="mt-1 accent-emerald-500 w-4 h-4 cursor-pointer"
                              title="Set as Primary Buyer for Company Account Conversion"
                            />
                            <div>
                              <div className="text-sm font-bold text-white flex items-center gap-2">
                                {[l.firstName, l.lastName].filter(Boolean).join(" ") || "Contact Person"}
                                {isSelectedBuyer && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-black flex items-center gap-1">
                                    <FiStar size={10} /> PRIMARY BUYER
                                  </span>
                                )}
                              </div>
                              {l.title && <div className="text-xs text-neutral-400">{l.title}</div>}
                            </div>
                          </div>

                          {l.disposition && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-800 text-neutral-300 border border-white/10">
                              {l.disposition.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>

                        {/* Phone & Dialing */}
                        <div className="flex items-center justify-between pt-1 border-t border-white/5">
                          <div>
                            {(l.phone || l.mobile) ? (
                              <PhoneLink phone={l.phone || l.mobile} className="text-xs font-mono font-bold text-orange-400" icon />
                            ) : (
                              <span className="text-xs text-neutral-500 italic">No phone number</span>
                            )}
                            {l.email && <div className="text-[10px] text-neutral-400 truncate">{l.email}</div>}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setActiveLead(l)}
                              className="px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500 text-orange-400 hover:text-white border border-orange-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                              <FiPhoneCall size={12} /> Status &amp; Notes
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Collapsed Excluded Contacts list if any */}
              {excludedContactList.length > 0 && (
                <div className="pt-4 border-t border-white/10">
                  <div className="text-xs font-bold text-neutral-500 flex items-center gap-2 mb-2">
                    <FiUserX className="text-rose-400" /> Excluded Contacts ({excludedContactList.length}) — Fell off calling queue:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {excludedContactList.map((el: any) => (
                      <span key={el.id} className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-white/10 text-neutral-400 text-xs flex items-center gap-2">
                        <span>{[el.firstName, el.lastName].filter(Boolean).join(" ") || "Contact"}</span>
                        <span className="text-[10px] text-rose-400 font-bold">({el.disposition?.replace(/_/g, " ") || "Excluded"})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        ) : (
          /* ─── 2. ALL COMPANIES QUEUE VIEW ─── */
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-neutral-400 font-bold px-1">
              <span>Showing {companyKeys.length} Company Groups ({leads.length} Total Lead Contacts)</span>
              <span className="text-emerald-400">✓ 100% Confirmed Company Matches</span>
            </div>

            <div className="space-y-4">
              {companyKeys.map((compName: string) => {
                const compLeads = companyGroups[compName] || []
                const compBuyerId = primaryBuyers[compName] || compLeads[0]?.id

                return (
                  <div key={compName} className="glass-panel border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center font-black text-base shadow-md">
                          {compName.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white tracking-tight">{compName}</h3>
                          <div className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-2">
                            <span className="text-orange-400 font-bold uppercase tracking-wider">{compLeads.length} Verified Contact{compLeads.length > 1 ? "s" : ""}</span>
                            {compLeads[0]?.city && <span>• {compLeads[0].city}, {compLeads[0].state}</span>}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleConvertCompany(compName, compLeads)}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                      >
                        <FiUserCheck size={14} /> Convert Company to Account &amp; Order
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {compLeads.map((l: any) => {
                        const isBuyer = compBuyerId === l.id
                        return (
                          <div key={l.id} className={`border rounded-xl p-3.5 space-y-2 ${isBuyer ? "bg-emerald-950/20 border-emerald-500/40" : "bg-neutral-950/80 border-white/5"}`}>
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="text-xs font-bold text-white flex items-center gap-2">
                                  {[l.firstName, l.lastName].filter(Boolean).join(" ") || "Contact Person"}
                                  {isBuyer && <span className="text-[10px] text-emerald-400 font-bold">★ BUYER</span>}
                                  {l.title && <span className="text-[10px] text-neutral-400 font-normal">({l.title})</span>}
                                </div>
                                <div className="text-[11px] text-neutral-400 mt-0.5 space-y-0.5">
                                  {(l.phone || l.mobile) && (
                                    <PhoneLink phone={l.phone || l.mobile} className="text-orange-400 font-mono" icon />
                                  )}
                                  {l.email && <div className="text-[10px] text-neutral-400">{l.email}</div>}
                                </div>
                              </div>

                              {l.disposition ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-800 text-neutral-300 border border-white/10">
                                  {l.disposition.replace(/_/g, " ")}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                  Unworked
                                </span>
                              )}
                            </div>

                            <div className="pt-1 flex justify-end">
                              <button
                                onClick={() => setActiveLead(l)}
                                className="px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500 text-orange-400 hover:text-white border border-orange-500/30 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                              >
                                <FiPhoneCall size={12} /> Status &amp; Notes
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      {/* Disposition / Exclude Contact Modal */}
      {activeLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/15 p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FiPhoneCall className="text-orange-500" /> Contact Outcome: {[activeLead.firstName, activeLead.lastName].filter(Boolean).join(" ")}
              </h3>
              <button onClick={() => setActiveLead(null)} className="p-1 text-neutral-400 hover:text-white">
                <FiXCircle size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-neutral-400 block mb-1">Contact Role &amp; Exclusion Disposition</label>
                <select
                  value={disposition}
                  onChange={e => setDisposition(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="PRIMARY_BUYER">⭐ Primary Buyer / Decision Maker</option>
                  <option value="NO_ANSWER">📞 No Answer</option>
                  <option value="LEFT_VOICEMAIL">🗣️ Left Voicemail</option>
                  <option value="SCHEDULED_CALLBACK">📅 Scheduled Callback</option>
                  <option value="NOT_THE_BUYER">❌ Not The Buyer (Still with company)</option>
                  <option value="NO_LONGER_WITH_COMPANY">🚫 No Longer With Company (Exclude)</option>
                  <option value="OUT_OF_BUSINESS">🏚️ Company Out of Business (Exclude)</option>
                  <option value="WRONG_NUMBER">☎️ Wrong Number / Disconnected (Exclude)</option>
                  <option value="DO_NOT_CALL">🛑 Do Not Call - DNC (Exclude)</option>
                  <option value="NOT_INTERESTED">👎 Not Interested</option>
                </select>
              </div>

              {disposition === "SCHEDULED_CALLBACK" && (
                <div>
                  <label className="text-xs font-bold text-neutral-400 block mb-1">Callback Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    value={callbackDate}
                    onChange={e => setCallbackDate(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-neutral-400 block mb-1">Call Notes &amp; Equipment Details</label>
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

      {/* Add Contact Modal */}
      {addContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/15 p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FiUserPlus className="text-orange-500" /> Add Buyer / Contact for {addContactModal.company}
              </h3>
              <button onClick={() => setAddContactModal(null)} className="p-1 text-neutral-400 hover:text-white">
                <FiXCircle size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-neutral-400 block mb-1">First Name</label>
                  <input
                    type="text"
                    value={newFirstName}
                    onChange={e => setNewFirstName(e.target.value)}
                    placeholder="John"
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-neutral-400 block mb-1">Last Name</label>
                  <input
                    type="text"
                    value={newLastName}
                    onChange={e => setNewLastName(e.target.value)}
                    placeholder="Smith"
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-neutral-400 block mb-1">Title / Role</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Purchasing Manager / Field Superintendent"
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-neutral-400 block mb-1">Phone Number</label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  placeholder="(602) 555-0199"
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-neutral-400 block mb-1">Email Address</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="john@construction.com"
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="chkNewBuyer"
                  checked={isNewBuyer}
                  onChange={e => setIsNewBuyer(e.target.checked)}
                  className="accent-emerald-500 rounded"
                />
                <label htmlFor="chkNewBuyer" className="text-xs font-bold text-emerald-400 cursor-pointer">
                  Set as Primary Buyer for this Company
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setAddContactModal(null)}
                className="px-4 py-2 bg-neutral-800 text-neutral-300 text-xs font-bold rounded-xl hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddContactSubmit}
                disabled={addingContact}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors shadow-md flex items-center gap-1.5"
              >
                {addingContact ? "Adding..." : "Add Contact"}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  )
}
