"use client"

import { useState, useEffect, useRef } from "react"
import { 
  FiX, FiPhoneCall, FiUser, FiClock, FiCheckSquare, 
  FiArrowRight, FiBookOpen, FiActivity, FiTag, FiAlertCircle,
  FiChevronDown, FiChevronRight 
} from "react-icons/fi"
import { useZoho } from "@/components/ZohoProvider"

interface SalesCallCampaignModalProps {
  accounts: any[]
  onClose: () => void
  onRefresh: () => void
}

export function SalesCallCampaignModal({ accounts, onClose, onRefresh }: SalesCallCampaignModalProps) {
  const { zohoContext: currentUser } = useZoho()
  
  const [currentIndex, setCurrentIndex] = useState(0)
  const [outcome, setOutcome] = useState("check_in")
  const [spokeTo, setSpokeTo] = useState("")
  const [notes, setNotes] = useState("")
  const [followUpDate, setFollowUpDate] = useState("")
  const [contactReached, setContactReached] = useState(true)
  
  // Fact-Finding States
  const [ffBladeSizes, setFfBladeSizes] = useState('')
  const [ffMaterialsCut, setFfMaterialsCut] = useState('')
  const [ffCurrentSupplier, setFfCurrentSupplier] = useState('')
  const [ffAvgBladeCost, setFfAvgBladeCost] = useState('')
  const [ffProductInterest, setFfProductInterest] = useState<string[]>([])
  const [ffReadyToBuy, setFfReadyToBuy] = useState('')
  const [ffPainPoints, setFfPainPoints] = useState('')
  const [ffJobTypes, setFfJobTypes] = useState('')
  const [showFactFinding, setShowFactFinding] = useState(false)

  // Timer States
  const [timerSeconds, setTimerSeconds] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const activeAccount = accounts[currentIndex]
  const repName = currentUser?.name || "your sales rep"

  // Reset timer and form for new active account
  useEffect(() => {
    if (!activeAccount) return

    // Pre-fill Spoke To with primary contact name
    const primaryContact = activeAccount.contacts?.find((c: any) => c.isPrimary) || activeAccount.contacts?.[0]
    setSpokeTo(primaryContact ? `${primaryContact.firstName || ""} ${primaryContact.lastName || ""}`.trim() : "")
    setNotes("")
    setFollowUpDate("")
    setOutcome("check_in")
    setContactReached(true)

    // Reset and pre-fill fact-finding from account data
    setFfBladeSizes(activeAccount.bladeSizes || '')
    setFfMaterialsCut(activeAccount.materialsCut || '')
    setFfCurrentSupplier(activeAccount.currentSupplier || '')
    setFfAvgBladeCost(activeAccount.avgBladeCost || '')
    setFfProductInterest(activeAccount.productInterest || [])
    setFfReadyToBuy(activeAccount.readyToBuy || '')
    setFfPainPoints(activeAccount.painPoints || '')
    setFfJobTypes(activeAccount.jobTypes || '')
    setShowFactFinding(false)

    // Reset and start timer
    setTimerSeconds(0)
    if (timerRef.current) clearInterval(timerRef.current)
    
    timerRef.current = setInterval(() => {
      setTimerSeconds(prev => prev + 1)
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [currentIndex, activeAccount])

  if (!activeAccount) {
    return (
      <div className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-center max-w-sm">
          <FiAlertCircle className="mx-auto text-amber-500 mb-3" size={36} />
          <h3 className="text-white font-bold text-base mb-1">No Accounts Selected</h3>
          <p className="text-xs text-neutral-400 mb-4">Please select at least one account to start the call campaign.</p>
          <button onClick={onClose} className="px-4 py-2 bg-neutral-800 text-white rounded-lg text-xs font-bold hover:bg-neutral-700">Close</button>
        </div>
      </div>
    )
  }

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const primaryContact = activeAccount.contacts?.find((c: any) => c.isPrimary) || activeAccount.contacts?.[0]
  const displayPhone = primaryContact?.phone || primaryContact?.mobilePhone || ''
  const cleanPhone = displayPhone ? displayPhone.replace(/[^0-9+]/g, '') : ''
  const contactName = spokeTo || (primaryContact ? `${primaryContact.firstName || ""} ${primaryContact.lastName || ""}`.trim() : "there")

  // Script Generator
  const generateScript = () => {
    const timeOfDay = new Date().getHours() < 12 ? "morning" : "afternoon"
    
    // Check if they have overdue invoices
    const overdueInvoices = (activeAccount.invoices || []).filter((i: any) => i.status === "Overdue" || i.status?.toLowerCase() === "overdue")
    const overdueTotal = overdueInvoices.reduce((sum: number, i: any) => sum + (parseFloat(i.amount) || 0), 0)

    let scriptText = `Hi ${contactName}, this is ${repName} with Titan Diamond USA! Hope you're having a great ${timeOfDay}.\n\n`
    
    if (overdueTotal > 0) {
      scriptText += `I wanted to check in on your account. We noticed there is a pending balance of $${overdueTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} on your oldest overdue statement, and I wanted to see if we could get that taken care of today, or if you needed any invoice copies emailed over to you.\n\n`
    } else {
      scriptText += `I'm reaching out to check in on how your recent operations are going, and see if there are any specific diamond blades, cup wheels, or core drill bits you need stocked up for your upcoming projects. We have some great bulk markups available this month.\n\n`
    }

    scriptText += `Is there anything we can quote or ship out for you today?`
    return scriptText
  }

  const handleNext = () => {
    if (currentIndex < accounts.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      alert("Campaign completed!")
      onRefresh()
      onClose()
    }
  }

  const handleLogAndNext = async () => {
    try {
      const response = await fetch("/api/log-sales-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: activeAccount.id,
          outcome,
          notes,
          callerName: repName,
          contactReached,
          spokeTo: contactReached ? spokeTo : "",
          followUpDate: followUpDate || null,
          durationMinutes: Math.max(1, Math.ceil(timerSeconds / 60)),
          userId: currentUser?.id,
          factFinding: {
            bladeSizes: ffBladeSizes || undefined,
            materialsCut: ffMaterialsCut || undefined,
            currentSupplier: ffCurrentSupplier || undefined,
            averageBladeCost: ffAvgBladeCost || undefined,
            productInterest: ffProductInterest.length > 0 ? ffProductInterest : undefined,
            readyToBuy: ffReadyToBuy || undefined,
            painPoints: ffPainPoints || undefined,
            jobTypes: ffJobTypes || undefined,
          }
        })
      })
      const data = await response.json()
      if (data.success) {
        handleNext()
      } else {
        alert(data.error || "Failed to log call outcome.")
      }
    } catch (e: any) {
      alert("Error logging call: " + e.message)
    }
  }

  return (
    <div className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-5xl h-[90vh] rounded-3xl flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <header className="bg-neutral-950 px-6 py-4 border-b border-neutral-850 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-white font-black text-base flex items-center gap-2">
              <FiPhoneCall className="text-sky-400 animate-pulse" />
              <span>Dashboard Sales Outreach Campaign</span>
            </h2>
            <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mt-0.5">
              Account {currentIndex + 1} of {accounts.length} &bull; Spoke with {accounts.filter((_, i) => i < currentIndex).length} so far
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Call Timer */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 font-mono text-xs font-bold text-sky-400">
              <FiClock className="animate-spin text-neutral-500" style={{ animationDuration: '4s' }} />
              <span>{formatTimer(timerSeconds)}</span>
            </div>
            
            <button 
              onClick={onClose}
              className="text-neutral-400 hover:text-white p-1 hover:bg-neutral-800 rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer"
            >
              &times;
            </button>
          </div>
        </header>

        {/* Content Body Grid */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-neutral-800">
          
          {/* Left Side: Client Summary & Script (3 Cols) */}
          <div className="lg:col-span-3 flex flex-col p-6 space-y-6 overflow-y-auto scrollbar-thin">
            
            {/* Account Card */}
            <div className="bg-neutral-950/40 border border-neutral-800/80 p-5 rounded-2xl space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-black text-white leading-tight">{activeAccount.name}</h3>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                      <FiTag size={10} /> {activeAccount.tags || "General"}
                    </span>
                    <span className="text-[10px] font-semibold text-neutral-500">{activeAccount.timeZone || "No Timezone"}</span>
                  </div>
                </div>

                {cleanPhone && (
                  <button 
                    onClick={() => {
                      // Trigger Zoho Voice Call Initiation log in backend
                      fetch('/api/zoho-voice', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          action: 'INITIATE_CALL',
                          accountId: activeAccount.id,
                          userId: currentUser?.id,
                          userEmail: currentUser?.email
                        })
                      }).catch(err => console.error("Error logging call initiation:", err));

                      // Dispatch the custom event to notify any softphone component in-app
                      const event = new CustomEvent("inAppDial", {
                        detail: { 
                          phone: cleanPhone,
                          accountId: activeAccount.id,
                          accountName: activeAccount.name
                        }
                      });
                      window.dispatchEvent(event);

                      // Standard dialer fallback
                      window.location.href = `zdialer:${cleanPhone}`;
                    }}
                    className="p-3 bg-sky-500 hover:bg-sky-400 text-black rounded-full flex items-center justify-center hover:scale-105 transition-all shadow-lg shadow-sky-500/10 cursor-pointer"
                    title={`Dial ${cleanPhone}`}
                  >
                    <FiPhoneCall size={18} />
                  </button>
                )}
              </div>

              {/* Contacts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-neutral-800/60 pt-4">
                <div className="space-y-1">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-neutral-500 block">Contact Name</span>
                  <div className="flex items-center gap-1.5 text-xs text-neutral-300 font-semibold">
                    <FiUser size={12} className="text-neutral-500" />
                    <span>{primaryContact ? `${primaryContact.firstName || ""} ${primaryContact.lastName || ""}`.trim() : "No Contact Found"}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-neutral-500 block">Phone Details</span>
                  {displayPhone ? (
                    <a href={`zdialer:${cleanPhone}`} className="text-xs text-blue-400 hover:text-blue-300 hover:underline font-bold font-mono">{displayPhone}</a>
                  ) : (
                    <p className="text-xs text-neutral-500 font-mono">—</p>
                  )}
                </div>
              </div>
            </div>

            {/* Script Box */}
            <div className="space-y-2 flex-1 flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                <FiBookOpen /> Outreach Script Guidance
              </span>
              <div className="bg-neutral-950/60 border border-neutral-800 p-5 rounded-2xl text-sm text-neutral-300 leading-relaxed font-sans whitespace-pre-line select-text flex-1">
                {generateScript()}
              </div>
            </div>

            {/* Fact-Finding Collapsible Section */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowFactFinding(!showFactFinding)}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
              >
                {showFactFinding ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                <span>📋 Fact-Finding</span>
              </button>

              {showFactFinding && (
                <div className="bg-neutral-950/60 border border-neutral-800 p-5 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Blade Sizes */}
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Blade Sizes</label>
                      <input
                        type="text"
                        value={ffBladeSizes}
                        onChange={e => setFfBladeSizes(e.target.value)}
                        placeholder='4", 7", 14"'
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500 transition-colors"
                      />
                    </div>
                    {/* Materials Cut */}
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Materials Cut</label>
                      <input
                        type="text"
                        value={ffMaterialsCut}
                        onChange={e => setFfMaterialsCut(e.target.value)}
                        placeholder="Concrete, Granite, Marble"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500 transition-colors"
                      />
                    </div>
                    {/* Current Supplier */}
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Current Supplier</label>
                      <input
                        type="text"
                        value={ffCurrentSupplier}
                        onChange={e => setFfCurrentSupplier(e.target.value)}
                        placeholder="Current blade supplier"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500 transition-colors"
                      />
                    </div>
                    {/* Avg Blade Cost */}
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Avg Blade Cost</label>
                      <input
                        type="text"
                        value={ffAvgBladeCost}
                        onChange={e => setFfAvgBladeCost(e.target.value)}
                        placeholder="$45-65"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Product Interest - Multi-select checkboxes */}
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Product Interest</label>
                    <div className="flex flex-wrap gap-2">
                      {['Turbo Blades', 'Continuous Rim', 'Segmented', 'Core Bits', 'Cup Wheels', 'Polishing Pads'].map(product => {
                        const isChecked = ffProductInterest.includes(product)
                        return (
                          <button
                            key={product}
                            type="button"
                            onClick={() => {
                              setFfProductInterest(prev =>
                                isChecked ? prev.filter(p => p !== product) : [...prev, product]
                              )
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                              isChecked
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                : 'bg-neutral-900 border-neutral-700 text-neutral-500 hover:border-neutral-600 hover:text-neutral-400'
                            }`}
                          >
                            {isChecked ? '✓ ' : ''}{product}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Ready to Buy */}
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Ready to Buy</label>
                    <select
                      value={ffReadyToBuy}
                      onChange={e => setFfReadyToBuy(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
                    >
                      <option value="">-- Select --</option>
                      <option value="Immediate">Immediate</option>
                      <option value="Next Month">Next Month</option>
                      <option value="Evaluating">Evaluating</option>
                      <option value="Not Now">Not Now</option>
                    </select>
                  </div>

                  {/* Pain Points */}
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Pain Points</label>
                    <textarea
                      rows={2}
                      value={ffPainPoints}
                      onChange={e => setFfPainPoints(e.target.value)}
                      placeholder="Quality issues, delivery delays, pricing concerns..."
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                    />
                  </div>

                  {/* Job Types */}
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Job Types</label>
                    <input
                      type="text"
                      value={ffJobTypes}
                      onChange={e => setFfJobTypes(e.target.value)}
                      placeholder="Residential, Commercial"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Right Side: Log Outcome Form (2 Cols) */}
          <div className="lg:col-span-2 p-6 flex flex-col space-y-5 overflow-y-auto scrollbar-thin bg-neutral-900/60 justify-between">
            
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <FiActivity className="text-sky-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Log Outreach Outcome</h3>
              </div>

              {/* Contact reached selector */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-neutral-400">Did you reach a contact?</label>
                <div className="flex bg-neutral-950 p-0.5 rounded-lg border border-neutral-800">
                  <button 
                    type="button"
                    onClick={() => setContactReached(true)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${contactReached ? 'bg-sky-500 text-black' : 'text-neutral-500 hover:text-neutral-300'}`}
                  >
                    Yes
                  </button>
                  <button 
                    type="button"
                    onClick={() => setContactReached(false)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${!contactReached ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                  >
                    No
                  </button>
                </div>
              </div>

              {contactReached && (
                <>
                  {/* Spoke With */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">Spoke With</label>
                    <input 
                      type="text"
                      placeholder="Name of contact spoken to"
                      value={spokeTo}
                      onChange={e => setSpokeTo(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors"
                    />
                  </div>

                  {/* Outcome selection */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">Outreach Outcome</label>
                    <select
                      value={outcome}
                      onChange={e => setOutcome(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors cursor-pointer"
                    >
                      <option value="check_in">General Check-in</option>
                      <option value="pitch">Product Pitch</option>
                      <option value="order_placed">Order Placed</option>
                      <option value="follow_up">Request Callback / Follow Up</option>
                      <option value="other">Other / Account Audit</option>
                    </select>
                  </div>
                </>
              )}

              {!contactReached && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">Outreach Attempt Outcome</label>
                  <select
                    value={outcome}
                    onChange={e => setOutcome(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors cursor-pointer"
                  >
                    <option value="left_voicemail">Left Voicemail</option>
                    <option value="no_answer">No Answer / Busy</option>
                    <option value="other">Other / Closed</option>
                  </select>
                </div>
              )}

              {/* Call Notes */}
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">Outreach Details &amp; Notes</label>
                <textarea
                  rows={4}
                  placeholder="Enter details about product interest, pricing feedback, follow-up notes..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors resize-none"
                />
              </div>

              {/* Follow-up Date */}
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">Schedule Follow-up Action (Optional)</label>
                <input 
                  type="date"
                  value={followUpDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setFollowUpDate(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors"
                />
              </div>
            </div>

            {/* Campaign Actions */}
            <div className="pt-4 border-t border-neutral-800 flex gap-2">
              <button
                type="button"
                onClick={handleNext}
                className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-300 font-bold text-xs rounded-xl transition-all"
              >
                Skip Account
              </button>
              
              <button
                type="button"
                onClick={handleLogAndNext}
                className="flex-1 flex items-center justify-center gap-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-black font-extrabold text-xs rounded-xl shadow-lg shadow-sky-950/20 hover:shadow-sky-950/40 transition-all"
              >
                <span>Log Outcome &amp; Next</span>
                <FiArrowRight size={13} />
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  )
}
