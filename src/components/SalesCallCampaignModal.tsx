"use client"

import { useState, useEffect, useRef } from "react"
import { 
  FiX, FiPhoneCall, FiUser, FiClock, FiCheckSquare, 
  FiArrowRight, FiBookOpen, FiActivity, FiTag, FiAlertCircle,
  FiChevronDown, FiChevronRight, FiShoppingCart, FiZap
} from "react-icons/fi"
import Link from "next/link"
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
  const [ffCrewCount, setFfCrewCount] = useState('')
  const [ffBladesPerOrder, setFfBladesPerOrder] = useState('')
  const [ffImprovementPriority, setFfImprovementPriority] = useState('')
  const [showFactFinding, setShowFactFinding] = useState(false)
  const [callType, setCallType] = useState<"cold" | "update">("cold")

  // AI States
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiType, setAiType] = useState<"text" | "image">("text")
  const [aiChannel, setAiChannel] = useState("SMS")
  const [aiResult, setAiResult] = useState<string | null>(null)
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [showAiMagic, setShowAiMagic] = useState(false)

  // Power Dialer States
  const [isPowerDialerActive, setIsPowerDialerActive] = useState(false)

  // Timer States
  const [timerSeconds, setTimerSeconds] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const activeAccount = accounts[currentIndex]
  const repName = currentUser?.name || "your sales rep"

  const initiateCall = (phone: string) => {
    if (!phone) return
    fetch('/api/calls/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'INITIATE_CALL', accountId: activeAccount?.id, userId: currentUser?.id,
        userEmail: currentUser?.email
      })
    }).catch(err => console.error("Error logging call initiation:", err))
    
    const link = document.createElement('a')
    link.href = `tel:${phone}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Power Dialer Auto-Dial Effect
  useEffect(() => {
    if (isPowerDialerActive && activeAccount) {
      const primaryContact = activeAccount.contacts?.find((c: any) => c.isPrimary) || activeAccount.contacts?.[0]
      const displayPhone = primaryContact?.phone || primaryContact?.mobilePhone || ''
      const cleanPhone = displayPhone ? displayPhone.replace(/[^0-9+]/g, '') : ''
      if (cleanPhone) {
        const t = setTimeout(() => initiateCall(cleanPhone), 1000)
        return () => clearTimeout(t)
      } else {
        setIsPowerDialerActive(false)
        alert(`Power Dialer paused: No valid phone number for ${activeAccount.name}`)
      }
    }
  }, [currentIndex, isPowerDialerActive, activeAccount])

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
    setFfCrewCount(activeAccount.crewCount || '')
    setFfBladesPerOrder(activeAccount.bladesPerOrder || '')
    setFfImprovementPriority(activeAccount.improvementPriority || '')
    setShowFactFinding(false)

    // Auto-detect call type
    if (activeAccount.lastCalledAt) {
      setCallType("update")
    } else {
      setCallType("cold")
    }

    // Reset AI states
    setAiPrompt("")
    setAiResult(null)
    setShowAiMagic(false)

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

  const renderPills = (options: string[], valueStr: string, setValueStr: (val: string) => void) => {
    const selected = valueStr ? valueStr.split(',').map(s => s.trim()).filter(Boolean) : []
    return (
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const isChecked = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                const newSelected = isChecked 
                  ? selected.filter(s => s !== opt) 
                  : [...selected, opt]
                setValueStr(newSelected.join(', '))
              }}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                isChecked
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-500 hover:border-neutral-600 hover:text-neutral-400'
              }`}
            >
              {isChecked ? '✓ ' : ''}{opt}
            </button>
          )
        })}
      </div>
    )
  }

  // Script Generator
  const generateScript = () => {
    const timeOfDay = new Date().getHours() < 12 ? "morning" : "afternoon"
    
    // Check if they have overdue invoices
    const overdueInvoices = (activeAccount.invoices || []).filter((i: any) => i.status === "Overdue" || i.status?.toLowerCase() === "overdue")
    const overdueTotal = overdueInvoices.reduce((sum: number, i: any) => sum + (parseFloat(i.amount) || 0), 0)

    if (overdueTotal > 0) {
      return `Hi ${contactName}, this is ${repName} with Titan Diamond USA! Hope you're having a great ${timeOfDay}.\n\nI wanted to check in on your account. We noticed there is a pending balance of $${overdueTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} on your oldest overdue statement, and I wanted to see if we could get that taken care of today, or if you needed any invoice copies emailed over to you.\n\nIs there anything else we can quote or ship out for you today?`
    }

    if (callType === "cold") {
      return `Hey, ${contactName} this is ${repName} over at Titan Diamond USA. I’m giving you a call today because we have an early release on our brand new 2026 line-up of blades that we featured at the The World of Concrete and ConExpo shows in Las Vegas this year and what’s great is with this new release, our manufacturer wants us to give away free blades to our new customers to build new relationships… I just have a quick couple questions to see which blade will work best for you and what you’re cutting...\n
1) First off… what size blades do you run? 14”?
2) What are you guys cutting out there?
3) Where do you pick up your blades now, do you buy them retail or over the phone from a wholesaler like me?
4) How much are they charging you for a good 14” blade? $250? $300 Bucks?
5) How many crews do you have?
6) And how many blades do you normally pick up at a time.. 6.. 12.. 25?
7) Let me ask you one last question… if you could improve one thing about the blades you are using right now… what would it be… longer life… faster cutting… or cleaner cutting?`
    }

    // Update Account / Follow Up
    let scriptText = `Hi ${contactName}, this is ${repName} with Titan Diamond USA! Hope you're having a great ${timeOfDay}.\n\nI'm reaching out to check in on how your recent operations are going, and see if there are any specific diamond blades, cup wheels, or core drill bits you need stocked up for your upcoming projects. We have some great bulk markups available this month.\n\n`
    
    // Check for missing fact finding
    const missing = []
    if (!ffBladeSizes) missing.push("what size blades you primarily run")
    if (!ffMaterialsCut) missing.push("what materials you guys are cutting most right now")
    if (!ffCrewCount) missing.push("how many crews you have out in the field")
    if (!ffBladesPerOrder) missing.push("how many blades you normally pick up at a time")
    if (!ffImprovementPriority) missing.push("what's the one thing you'd improve about your current blades (longer life, faster, or cleaner cutting)")
    
    if (missing.length > 0) {
      scriptText += `By the way, I was just updating your account profile and realized I didn't have it on file—could you remind me ${missing[0]}?\n\n`
    }

    scriptText += `Is there anything we can quote or ship out for you today?`
    return scriptText
  }

  const getBladeRecommendation = () => {
    const mat = ffMaterialsCut.toLowerCase()
    const prio = ffImprovementPriority.toLowerCase()
    
    const recommendations = [];

    const pitches = {
      medusa: "Let me tell you about one of my best selling blades for the kind of work you are doing. It's called 'The Medusa'. What my customers all love about this blade is that it has a 12mm jumbo segment compared to most blades on the market that are just 10mm giving you longer blade life. This new blade is perfect for Cured Concrete, Brick, Block, Stone & Pavers. The segments are made under a higher heat and a lower pressure which makes the diamonds last longer without sacrificing speed. Each one of the segments are laser welded for reliability and safety and the core is speed tensioned to eliminate warping and wobbling.",
      kingTurbo: "Let me tell you about one of my best blades for what you are doing... it's called 'THE KING TURBO BLADE'. What my customers all love about this blade is that it has 24 serrated turbo segments which makes the blade cut super fast and super smooth through Hard Re-enforced Concrete and other hard materials. This premium soft bond blade will actually pull itself through the cut, so you don't have to put a lot of pressure on the saw you just let the blade do the work for you. They form the diamond segments differently, making them under a higher heat and a lower pressure which makes the diamonds last longer without sacrificing speed.",
      titan: "I want to tell you about one of my best blades for what you're doing. It's called 'THE TITAN'. This brand-new blade is designed to work great on a handheld or a walk-behind saw. It's versatile enough to cut everything from Re-enforced Concrete, Asphalt, Ductile Iron, Re-enforced Concrete Pipe and even Rebar! The major improvement over other blades on the market is when they make the diamond segments under a higher heat and a lower pressure which makes the diamonds last longer without sacrificing any speed. On top of all that, it has a speed tensioned Cobalt Core which prevents warping and wobbling, and the segments are laser welded!",
      darkKnight: "I want to tell you about one of my best blades for what you're doing. It's called my 'Dark Knight Blade'. This brand-new blade is designed to work great on a handheld or a walk-behind saw. It's versatile enough to cut everything from re-enforced concrete to asphalt, to brick, block & stone. The major improvement over other blades is that they make the diamond segments under a higher heat and a lower pressure which makes the diamonds last longer without sacrificing any speed. On top of all that, it has a speed tensioned Cobalt Core which prevents warping and wobbling, and the segments are laser welded!",
      razor: "This blade is ideal for cutting Ceramic Tile, Marble, Granite & even Porcelain and it cuts through it like a hot knife through butter! The new 'Razor Blade' has a reinforced core to prevent warping, wobbling and walking and runs super quiet. This blade cuts really clean & fast & the manufacturer claims 100% chip free cutting.",
      generic: "With direct-from-manufacturer pricing and higher quality products, we only offer the best of the best based upon your application."
    };

    if (mat.includes('marble') || mat.includes('tile') || mat.includes('glass') || mat.includes('granite')) {
      recommendations.push({ tier: 'Good', blade: '10" / 14" Continuous Rim Blade', pitch: pitches.generic });
      recommendations.push({ tier: 'Best', blade: 'Titan Razor Blade', pitch: pitches.razor });
    } else if (mat.includes('asphalt') || mat.includes('green concrete')) {
      recommendations.push({ tier: 'Good', blade: 'Asphalt Pro / Green Concrete Blade', pitch: pitches.generic });
      recommendations.push({ tier: 'Best', blade: 'The Titan', pitch: pitches.titan });
    } else {
      recommendations.push({ tier: 'Good', blade: 'The Medusa Blade', pitch: pitches.medusa });
      recommendations.push({ tier: 'Better', blade: 'The King Turbo', pitch: pitches.kingTurbo });
      recommendations.push({ tier: 'Best', blade: 'The Dark Knight Blade', pitch: pitches.darkKnight });
    }
    
    let priorityAddon = '';
    if (prio.includes('life')) {
      priorityAddon = " We laser-weld our segments and use a 30% higher diamond concentration, so our blades easily outlast the standard stuff you get at retail.";
    } else if (prio.includes('fast')) {
      priorityAddon = " Our turbo segment design reduces drag and clears debris instantly, so it won't bind up when you're cutting deep.";
    } else if (prio.includes('clean')) {
      priorityAddon = " Our continuous rim technology ensures a true zero-chip finish every single time.";
    } else if (prio.includes('price') || prio.includes('lower')) {
      priorityAddon = " Because we manufacture and distribute directly, we cut out the middleman, saving you 20-30% compared to local suppliers.";
    }
    
    return recommendations.map(rec => ({
      ...rec,
      pitch: rec.pitch + priorityAddon
    }));
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

  const handleGenerateAi = async () => {
    if (!aiPrompt) return;
    setIsGeneratingAi(true);
    setAiResult(null);
    try {
      const res = await fetch("/api/generate-campaign-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          type: aiType,
          channel: aiChannel
        })
      });
      const data = await res.json();
      if (data.success) {
        setAiResult(data.result);
      } else {
        alert("Failed to generate AI content: " + data.message);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsGeneratingAi(false);
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
            crewCount: ffCrewCount || undefined,
            bladesPerOrder: ffBladesPerOrder || undefined,
            improvementPriority: ffImprovementPriority || undefined,
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
            {/* Power Dialer Toggle */}
            <button
              onClick={() => setIsPowerDialerActive(!isPowerDialerActive)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                isPowerDialerActive 
                  ? 'bg-sky-500 border-sky-400 text-black shadow-lg shadow-sky-500/20 animate-pulse' 
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              <FiZap className={isPowerDialerActive ? "text-black" : "text-sky-400"} />
              {isPowerDialerActive ? "Power Dialer ON" : "Start Power Dialer"}
            </button>

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

                <div className="flex items-center gap-2">
                  <Link 
                    href={`/account?id=${activeAccount.zohoId}&pos=true`}
                    className="p-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-full flex items-center justify-center hover:scale-105 transition-all shadow-lg shadow-emerald-500/10 cursor-pointer"
                    title={`Start Quote / Order for ${activeAccount.name}`}
                  >
                    <FiShoppingCart size={18} />
                  </Link>

                  {cleanPhone && (
                    <button 
                      onClick={() => initiateCall(cleanPhone)}
                      className="p-3 bg-sky-500 hover:bg-sky-400 text-black rounded-full flex items-center justify-center hover:scale-105 transition-all shadow-lg shadow-sky-500/10 cursor-pointer"
                      title={`Dial ${cleanPhone}`}
                    >
                      <FiPhoneCall size={18} />
                    </a>
                  )}
                </div>
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
                    <a href={"tel:" + cleanPhone } className="text-xs text-blue-400 hover:text-blue-300 hover:underline font-bold font-mono">{displayPhone}</a>
                  ) : (
                    <p className="text-xs text-neutral-500 font-mono">—</p>
                  )}
                </div>
              </div>
            </div>

            {/* Script Box */}
            <div className="space-y-2 flex-1 flex flex-col">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                  <FiBookOpen /> Outreach Script Guidance
                </span>
                <div className="flex bg-neutral-900 border border-neutral-800 rounded text-[10px] font-bold p-0.5">
                  <button onClick={() => setCallType("cold")} className={`px-2 py-1 rounded transition-colors ${callType === "cold" ? "bg-sky-600 text-black" : "text-neutral-500"}`}>Cold Call</button>
                  <button onClick={() => setCallType("update")} className={`px-2 py-1 rounded transition-colors ${callType === "update" ? "bg-sky-600 text-black" : "text-neutral-500"}`}>Follow-Up</button>
                </div>
              </div>
              <div className="bg-neutral-950/60 border border-neutral-800 p-5 rounded-2xl text-sm text-neutral-300 leading-relaxed font-sans whitespace-pre-line select-text flex-1">
                {generateScript()}
              </div>
            </div>

            {/* AI Campaign Magic Collapsible Section */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowAiMagic(!showAiMagic)}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
              >
                {showAiMagic ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                <span>✨ AI Campaign Magic</span>
              </button>

              {showAiMagic && (
                <div className="bg-neutral-950/60 border border-purple-900/30 p-5 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Type</label>
                      <select
                        value={aiType}
                        onChange={e => setAiType(e.target.value as "text" | "image")}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors cursor-pointer"
                      >
                        <option value="text">Copywriting (Text)</option>
                        <option value="image">Ad Creative (Image)</option>
                      </select>
                    </div>
                    {aiType === "text" && (
                      <div>
                        <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Channel</label>
                        <select
                          value={aiChannel}
                          onChange={e => setAiChannel(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors cursor-pointer"
                        >
                          <option value="SMS">SMS / Text</option>
                          <option value="Email">Email Blast</option>
                          <option value="Social Media">Social Media</option>
                        </select>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Prompt / Instructions</label>
                    <textarea
                      rows={2}
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      placeholder={aiType === "text" ? "e.g., Write a promo for 14-inch concrete blades" : "e.g., A diamond blade cutting concrete, cinematic lighting"}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-purple-500 transition-colors resize-none"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={isGeneratingAi || !aiPrompt}
                    onClick={handleGenerateAi}
                    className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 text-white font-bold py-2 rounded-xl transition-colors text-xs flex justify-center items-center gap-2"
                  >
                    {isGeneratingAi ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Generating Magic...
                      </>
                    ) : "Generate Magic"}
                  </button>

                  {aiResult && (
                    <div className="mt-4 pt-4 border-t border-purple-900/30 animate-in fade-in duration-300">
                      <label className="block text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2">Generated Result:</label>
                      {aiType === "text" ? (
                        <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-xl text-xs text-neutral-300 whitespace-pre-wrap select-text leading-relaxed">
                          {aiResult}
                        </div>
                      ) : (
                        <div className="rounded-xl overflow-hidden border border-neutral-800 relative group">
                          <img src={aiResult} alt="Generated Ad Creative" className="w-full h-auto object-cover" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-sm">
                            <a href={aiResult} target="_blank" rel="noreferrer" className="bg-white text-black px-4 py-2 rounded-lg text-xs font-bold hover:scale-105 transition-transform">
                              Open Full Image
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
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
                      {renderPills(['4"', '4.5"', '7"', '9"', '10"', '12"', '14"', '16"', '18"', '20"'], ffBladeSizes, setFfBladeSizes)}
                    </div>
                    {/* Materials Cut */}
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Materials Cut</label>
                      {renderPills(['Concrete', 'Green Concrete', 'Asphalt', 'Granite', 'Marble', 'Tile', 'Block', 'Brick', 'Glass', 'Metal'], ffMaterialsCut, setFfMaterialsCut)}
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
                    {renderPills(['Residential', 'Commercial', 'Industrial', 'Highway/Road', 'Government'], ffJobTypes, setFfJobTypes)}
                  </div>

                  {/* Crew Count */}
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Crew Count</label>
                    {renderPills(['1', '2-3', '4-5', '6-10', '11+'], ffCrewCount, setFfCrewCount)}
                  </div>

                  {/* Blades Per Order */}
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Blades Per Order</label>
                    {renderPills(['1-5', '6-10', '11-20', '21-50', '50+'], ffBladesPerOrder, setFfBladesPerOrder)}
                  </div>

                  {/* Improvement Priority */}
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Improvement Priority</label>
                    <select
                      value={ffImprovementPriority}
                      onChange={e => setFfImprovementPriority(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
                    >
                      <option value="">-- Select --</option>
                      <option value="Longer life">Longer Life</option>
                      <option value="Faster cutting">Faster Cutting</option>
                      <option value="Cleaner cutting">Cleaner Cutting</option>
                      <option value="Lower price">Lower Price</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Recommendation Box */}
            <div className="bg-emerald-950/20 border border-emerald-900/50 p-5 rounded-2xl space-y-4 mt-4 animate-in fade-in duration-300">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5 mb-1">
                <FiCheckSquare /> Pitch Recommendations
              </span>
              {getBladeRecommendation().map((rec, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-900 text-emerald-300">{rec.tier}</span>
                    <h4 className="text-white font-bold text-sm">{rec.blade}</h4>
                  </div>
                  <p className="text-xs text-emerald-100/70 leading-relaxed">{rec.pitch}</p>
                </div>
              ))}
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

