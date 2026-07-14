"use client"

import { formatPhoneNumber } from "@/lib/formatters"


import { useState, useEffect, useRef } from "react"
import { 
  FiX, FiPhoneCall, FiUser, FiClock, FiCheckSquare, 
  FiArrowRight, FiBookOpen, FiActivity, FiTag, FiAlertCircle,
  FiChevronDown, FiChevronRight, FiMapPin, FiShoppingCart, FiZap,
  FiPackage, FiFileText, FiDollarSign, FiLoader, FiMail, FiCreditCard, FiTrendingUp
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

  // Account Intel States (purchase history + notes)
  const [accountPurchases, setAccountPurchases] = useState<any[]>([])
  const [accountNotes, setAccountNotes] = useState<any[]>([])
  const [isLoadingIntel, setIsLoadingIntel] = useState(false)
  const [intelTab, setIntelTab] = useState<'purchases' | 'notes' | 'invoices'>('purchases')

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
    
    // Copy number to clipboard for ZDialer - no tel: link to avoid native phone app
    navigator.clipboard?.writeText(phone).catch(() => {})
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

  // Fetch account intel (purchases + notes + address) on-demand per active account
  const [accountDetail, setAccountDetail] = useState<any>(null)
  useEffect(() => {
    if (!activeAccount?.zohoId) return
    let cancelled = false
    setIsLoadingIntel(true)
    setAccountPurchases([])
    setAccountNotes([])
    setAccountDetail(null)

    Promise.all([
      fetch(`/api/get-account-purchases?accountId=${activeAccount.zohoId}`).then(r => r.json()).catch(() => ({ products: [] })),
      fetch(`/api/get-account-details?id=${activeAccount.zohoId}`).then(r => r.json()).catch(() => ({ account: null }))
    ]).then(([purchaseData, detailData]) => {
      if (cancelled) return
      setAccountPurchases(purchaseData.purchasedProducts || purchaseData.products || [])
      setAccountNotes(detailData.account?.notes || detailData.notes || [])
      setAccountDetail(detailData.account || null)
    }).finally(() => {
      if (!cancelled) setIsLoadingIntel(false)
    })

    return () => { cancelled = true }
  }, [currentIndex, activeAccount?.zohoId])

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

  const renderPills = (options: string[], valueStr: string, setValueStr: (val: string) => void, compact = false) => {
    const selected = valueStr ? valueStr.split(',').map(s => s.trim()).filter(Boolean) : []
    return (
      <div className={`flex flex-wrap ${compact ? 'gap-1' : 'gap-2'}`}>
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
              className={`${compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2.5 py-1.5 text-[10px]'} rounded-lg font-bold border transition-all cursor-pointer ${
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
      return `Hey, ${contactName} this is ${repName} over at Titan Diamond USA. I'm giving you a call today because we have an early release on our brand new 2026 line-up of blades that we featured at the The World of Concrete and ConExpo shows in Las Vegas this year and what's great is with this new release, our manufacturer wants us to give away free blades to our new customers to build new relationships... I just have a quick couple questions to see which blade will work best for you and what you're cutting...\n
1) First off... what size blades do you run? 14"?
2) What are you guys cutting out there?
3) Where do you pick up your blades now, do you buy them retail or over the phone from a wholesaler like me?
4) How much are they charging you for a good 14" blade? $250? $300 Bucks?
5) How many crews do you have?
6) And how many blades do you normally pick up at a time.. 6.. 12.. 25?
7) Let me ask you one last question... if you could improve one thing about the blades you are using right now... what would it be... longer life... faster cutting... or cleaner cutting?`
    }

    // Update Account / Follow Up  --  personalized with purchase history
    let scriptText = `Hi ${contactName}, this is ${repName} with Titan Diamond USA! Hope you're having a great ${timeOfDay}.\n\n`

    if (accountPurchases.length > 0) {
      const topItems = accountPurchases.slice(0, 3)
      const totalSpent = accountPurchases.reduce((sum: number, p: any) => sum + (p.totalSpend || 0), 0)
      const totalQty = accountPurchases.reduce((sum: number, p: any) => sum + (p.quantity || 0), 0)
      const lastItemNames = topItems.map((p: any) => p.name).join(', ')

      scriptText += `I was looking at your account and saw that you've picked up ${totalQty} items from us totaling about $${totalSpent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}  --  including ${lastItemNames}. `

      if (totalQty >= 10) {
        scriptText += `You're one of our valued repeat customers, so I wanted to make sure you're taken care of first on our latest deals.\n\n`
      } else {
        scriptText += `I appreciate the business! I wanted to reach out and see how those are working out for you and if there's anything we can do better.\n\n`
      }

      const hasBlades = accountPurchases.some((p: any) => (p.name || '').toLowerCase().includes('blade'))
      const hasCoredrills = accountPurchases.some((p: any) => (p.name || '').toLowerCase().includes('core') || (p.name || '').toLowerCase().includes('drill'))
      const hasCupWheels = accountPurchases.some((p: any) => (p.name || '').toLowerCase().includes('cup') || (p.name || '').toLowerCase().includes('wheel') || (p.name || '').toLowerCase().includes('grind'))

      if (hasBlades && !hasCupWheels) {
        scriptText += `I also noticed you've been running our diamond blades  --  have you had a chance to try our cup wheels and grinding products? A lot of our blade customers end up loving them for surface prep and finishing work.\n\n`
      } else if (hasBlades && !hasCoredrills) {
        scriptText += `Since you're running our blades, I wanted to let you know we also carry core drill bits if you ever need them on the job. Same quality, same direct pricing.\n\n`
      } else {
        scriptText += `Are you getting close to needing a restock on any of those? I can get a quote together for you right now if you'd like.\n\n`
      }
    } else {
      scriptText += `I'm reaching out to check in on how your recent operations are going, and see if there are any specific diamond blades, cup wheels, or core drill bits you need stocked up for your upcoming projects. We have some great bulk markups available this month.\n\n`
    }

    // Check for missing fact finding
    const missing: string[] = []
    if (!ffBladeSizes) missing.push("what size blades you primarily run")
    if (!ffMaterialsCut) missing.push("what materials you guys are cutting most right now")
    if (!ffCrewCount) missing.push("how many crews you have out in the field")
    if (!ffBladesPerOrder) missing.push("how many blades you normally pick up at a time")
    if (!ffImprovementPriority) missing.push("what's the one thing you'd improve about your current blades (longer life, faster, or cleaner cutting)")
    
    if (missing.length > 0) {
      scriptText += `By the way, I was just updating your account profile and realized I didn't have it on file -- could you remind me ${missing[0]}?\n\n`
    }

    scriptText += `Is there anything we can quote or ship out for you today?`
    return scriptText
  }

  const getBladeRecommendation = () => {
    const mat = ffMaterialsCut.toLowerCase()
    const prio = ffImprovementPriority.toLowerCase()
    
    const recommendations = [];

    const pitches = {
      medusa: `Let me tell you about one of my best selling blades for the kind of work you are doing. It's called "The Medusa". What my customers all love about this blade is that it has a 12mm jumbo segment compared to most blades on the market that are just 10mm giving you longer blade life. This new blade is perfect for Cured Concrete, Brick, Block, Stone & Pavers. The segments are made under a higher heat and a lower pressure which makes the diamonds last longer without sacrificing speed. Each one of the segments are laser welded for reliability and safety and the core is speed tensioned to eliminate warping and wobbling.\n\nNow ${contactName}, retail stores in your city would sell a blade of this quality for $150 bucks all day long! I normally wholesale it for $100 bucks! Right now, like I said, we are giving this blade away for FREE! The way the promotion works is I send 6 blades out there  --  the first blade you pull out of the box is absolutely FREE! No matter how you feel about it! The other 5 blades are only $68 bucks each! If you do the math, you're getting 6 blades for $340 bucks! That's less than $57 bucks per blade! And at that price you're stealing them!`,
      kingTurbo: `Let me tell you about one of my best blades for what you are doing... it's called "THE KING TURBO BLADE". What my customers all love about this blade is that it has 24 serrated turbo segments which makes the blade cut super fast and super smooth through Hard Re-enforced Concrete and other hard materials. This premium soft bond blade will actually pull itself through the cut, so you don't have to put a lot of pressure on the saw  --  you just let the blade do the work for you. They form the diamond segments differently, making them under a higher heat and a lower pressure which makes the diamonds last longer without sacrificing speed.\n\nNow ${contactName}, retail stores will sell a blade of this quality for $250 bucks all day long! I normally wholesale it for $175 bucks! Right now, like I said, we are giving this blade away for FREE! The way the promotion works is I send three blades out there  --  the first blade you pull out of the box is absolutely FREE! No matter how you feel about it! The other two are only $175 each! If you do the math you're getting three blades for $350 bucks! That's $116 bucks per blade! And at that price you're stealing them!`,
      titan: `I want to tell you about one of my best blades for what you're doing. It's called "THE TITAN". This brand-new blade is designed to work great on a handheld or a walk-behind saw. It's versatile enough to cut everything from Re-enforced Concrete, Asphalt, Ductile Iron, Re-enforced Concrete Pipe and even Rebar! The major improvement over other blades on the market is when they make the diamond segments under a higher heat and a lower pressure which makes the diamonds last longer without sacrificing any speed. On top of all that, it has a speed tensioned Cobalt Core which prevents warping and wobbling, and the segments are laser welded!\n\n${contactName}, my customers are telling me that this is "The Best Blade" they've ever used, hands down! I don't expect you to take my word for it  --  I'll prove it to you! If you were able to find a blade of this quality at your local supplier it would cost $400 or more! Obviously, I'm not a retail store; I normally wholesale these blades for $299 each! Like I said, right now I am giving you one absolutely free of charge. What I'm gonna do is send you out my starter pack  --  the first blade you pull out of the box is absolutely free! The other two blades in the box are only $250 each! If you do the math, you're getting three blades for $500 bucks  --  that's only $166 bucks per blade! And at that price you're stealing them!`,
      darkKnight: `I want to tell you about one of my best blades for what you're doing. It's called my "Dark Knight Blade". This brand-new blade is designed to work great on a handheld or a walk-behind saw. It's versatile enough to cut everything from re-enforced concrete to asphalt, to brick, block & stone. The major improvement over other blades is that they make the diamond segments under a higher heat and a lower pressure which makes the diamonds last longer without sacrificing any speed. On top of all that, it has a speed tensioned Cobalt Core which prevents warping and wobbling, and the segments are laser welded!\n\n${contactName}, my customers are telling me that this is "The Best Blade" they've ever used, hands down! I don't expect you to take my word for it  --  I'll prove it to you! If you were able to find a blade of this quality at your local supplier it would cost $250 or more! Obviously, I'm not a retail store; I normally wholesale these blades for $175 each! Like I said, right now I am giving you one absolutely free of charge. What I'm gonna do is send you out my starter pack  --  the first blade you pull out of the box is absolutely free! The other 3 blades in the box are only $150 each! If you do the math, you're getting 4 blades for $450 bucks  --  that's less than $113 bucks per blade! And at that price you're stealing them!`,
      razor: `This blade is ideal for cutting Ceramic Tile, Marble, Granite & even Porcelain and it cuts through it like a hot knife through butter! The new "Razor Blade" has a reinforced core to prevent warping, wobbling and walking and runs super quiet. This blade cuts really clean & fast & the manufacturer claims 100% chip free cutting.\n\nNow ${contactName}, retail stores would sell a blade of this quality for $150 bucks all day long! I normally wholesale it for $120 bucks! Right now, like I said, we are giving this blade away for FREE! The way the promotion works is I send four blades out there  --  the first blade you pull out of the box is absolutely FREE! No matter how you feel about it! The next three are only $100 each!`,
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

  const displayEmail = primaryContact?.email || accountDetail?.booksContact?.email || activeAccount.booksContact?.email || ''

  return (
    <div className="fixed inset-0 z-[200] bg-[#06080f] flex flex-col">
      {/* --- COMPACT TOP BAR --- */}
      <header className="bg-[#0a0d14] border-b border-cyan-500/10 px-5 py-1.5 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full bg-cyan-500/10 flex items-center justify-center">
            <FiPhoneCall className="text-cyan-400 animate-pulse" size={12} />
          </div>
          <h1 className="text-white font-black text-xs tracking-wide">TITAN DIALER</h1>
          <span className="text-[9px] text-neutral-600 font-bold">{currentIndex + 1}/{accounts.length}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/40 border border-cyan-500/20">
            <FiClock className="text-cyan-500/60" size={11} />
            <span className="font-mono text-sm font-black text-cyan-400 tabular-nums tracking-wider">{formatTimer(timerSeconds)}</span>
          </div>
          <button
            onClick={() => setIsPowerDialerActive(!isPowerDialerActive)}
            className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold transition-all border cursor-pointer ${
              isPowerDialerActive
                ? 'bg-cyan-500 border-cyan-400 text-black shadow-lg shadow-cyan-500/30 animate-pulse'
                : 'bg-neutral-900/60 border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500'
            }`}
          >
            <FiZap size={10} />
            {isPowerDialerActive ? "\u26a1 AUTO" : "Power Dialer"}
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <FiX size={12} /> End
          </button>
        </div>
      </header>

      {/* --- MAIN 3-PANEL BODY --- */}
      <div className="flex-1 flex min-h-0">

        {/* === LEFT PANEL: ACCOUNT QUEUE === */}
        <div className="w-52 bg-[#080b12] border-r border-neutral-800/50 flex flex-col shrink-0">
          <div className="px-3 py-3 border-b border-neutral-800/40">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Queue ({accounts.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
            {accounts.map((acc: any, i: number) => {
              const isActive = i === currentIndex
              const isDone = i < currentIndex
              const hasOverdue = (acc.invoices || []).some((inv: any) => inv.status?.toLowerCase() === 'overdue')
              const hasPhone = acc.contacts?.some((c: any) => c.phone || c.mobilePhone)
              return (
                <button
                  key={acc.id}
                  onClick={() => setCurrentIndex(i)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer border ${
                    isActive
                      ? 'bg-cyan-500/10 border-cyan-500/30 shadow-lg shadow-cyan-500/5'
                      : isDone
                      ? 'bg-neutral-900/30 border-transparent opacity-50'
                      : 'bg-neutral-950/40 border-neutral-800/40 hover:bg-neutral-900/60 hover:border-neutral-700/60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isDone ? 'bg-neutral-600' : hasOverdue ? 'bg-red-500' : 'bg-emerald-500'}`} />
                    <span className={`font-bold truncate ${isActive ? 'text-cyan-300' : isDone ? 'text-neutral-500' : 'text-neutral-300'}`}>
                      {acc.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 ml-4">
                    {isDone && <span className="text-[9px] text-neutral-600">{'\u2713'} Done</span>}
                    {!isDone && hasPhone && <FiPhoneCall size={9} className="text-neutral-600" />}
                    {!isDone && hasOverdue && <span className="text-[8px] font-bold text-red-500/70 uppercase">Overdue</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* === CENTER PANEL: DIALER + SCRIPT + CLOSE + LOG === */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto scrollbar-thin">

          {/* STICKY ACCOUNT HUD - stays visible at all times */}
          <div className="sticky top-0 z-40 bg-[#06080f]/95 backdrop-blur-md border-b border-cyan-500/10 pb-3">
            {/* Row 1: Contact Name + Actions */}
            <div className="px-5 pt-3 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-black text-white leading-tight truncate">{contactName}</h2>
                <p className="text-xs text-neutral-400 font-semibold truncate">{activeAccount.name}</p>
              </div>
              <div className="flex gap-1.5 shrink-0 ml-3">
                {cleanPhone && (
                  <button
                    onClick={() => initiateCall(cleanPhone)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-[10px] rounded-lg shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                  >
                    <FiPhoneCall size={12} /> Call
                  </button>
                )}
                {cleanPhone && (
                  <a
                    href={`sms:${cleanPhone}`}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold text-[10px] rounded-lg border border-emerald-500/20 transition-all"
                  >
                    {'\ud83d\udcac'} SMS
                  </a>
                )}
                {displayEmail && (
                  <a
                    href={`mailto:${displayEmail}`}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-bold text-[10px] rounded-lg border border-blue-500/20 transition-all"
                  >
                    <FiMail size={12} /> Email
                  </a>
                )}
              </div>
            </div>

            {/* Row 2: Phone + Email + Address */}
            <div className="px-5 mt-1.5 flex flex-wrap items-center gap-3">
              {displayPhone && (
                <div className="flex items-center gap-1" title="Phone number for ZDialer">
                  <FiPhoneCall size={10} className="text-cyan-500" />
                  <span className="text-xs font-mono font-bold text-cyan-300 select-all">{formatPhoneNumber(displayPhone)}</span>
                </div>
              )}
              {displayEmail && (
                <div className="flex items-center gap-1 text-xs text-blue-400">
                  <FiMail size={10} />
                  <span className="font-mono font-bold truncate max-w-[180px]">{displayEmail}</span>
                </div>
              )}
              {(() => {
                const addr = accountDetail || activeAccount
                const ship = addr.shippingStreet || addr.shippingCity
                return ship ? (
                  <div className="flex items-center gap-1 text-[10px] text-neutral-400">
                    <FiMapPin size={10} className="text-neutral-500" />
                    <span>{addr.shippingStreet && `${addr.shippingStreet}, `}{addr.shippingCity && `${addr.shippingCity}, `}{addr.shippingState} {addr.shippingZip}</span>
                  </div>
                ) : null
              })()}
            </div>

            {/* Row 3: Stats Chips + Top 3 Products */}
            <div className="px-5 mt-2 flex items-center gap-2 flex-wrap">
              {accountPurchases.length > 0 && (
                <>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/5 border border-amber-500/15">
                    <FiDollarSign size={10} className="text-amber-500" />
                    <span className="text-[10px] font-black text-amber-400">${accountPurchases.reduce((s: number, p: any) => s + (p.totalSpend || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    <span className="text-[7px] font-bold text-neutral-600 uppercase">LTV</span>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/5 border border-blue-500/15">
                    <FiShoppingCart size={10} className="text-blue-500" />
                    <span className="text-[10px] font-black text-blue-400">{accountPurchases.reduce((s: number, p: any) => s + (p.quantity || 0), 0)}</span>
                    <span className="text-[7px] font-bold text-neutral-600 uppercase">Units</span>
                  </div>
                </>
              )}
              {(() => {
                const overdueInvs = (activeAccount.invoices || []).filter((inv: any) => inv.status?.toLowerCase() === 'overdue')
                const overdueTotal = overdueInvs.reduce((s: number, inv: any) => s + (Number(inv.balance) || Number(inv.total) || 0), 0)
                return overdueTotal > 0 ? (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/5 border border-red-500/20">
                    <FiAlertCircle size={10} className="text-red-500" />
                    <span className="text-[10px] font-black text-red-400">${overdueTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    <span className="text-[7px] font-bold text-neutral-600 uppercase">Due</span>
                  </div>
                ) : null
              })()}
              {/* Top 3 Products inline */}
              {accountPurchases.length > 0 && (
                <div className="flex items-center gap-1 pl-1.5 border-l border-neutral-800/60">
                  <FiPackage size={9} className="text-neutral-600" />
                  {accountPurchases.slice(0, 3).map((p: any, i: number) => (
                    <span key={i} className="flex items-center gap-0.5">
                      {i > 0 && <span className="text-neutral-800">{'\u00b7'}</span>}
                      <span className="text-[8px] text-neutral-400 font-bold truncate max-w-[90px]" title={p.name}>{p.name}</span>
                      <span className="text-[7px] font-black text-emerald-500">${(p.totalSpend || 0) >= 1000 ? ((p.totalSpend / 1000).toFixed(1) + 'k') : (p.totalSpend || 0).toFixed(0)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SCRIPT + FACT-FINDING FLOW (integrated) */}
          <div className="mx-5 mt-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <FiBookOpen size={11} /> Outreach Script
              </span>
              <div className="flex bg-neutral-900 border border-neutral-800 rounded text-[10px] font-bold p-0.5">
                <button onClick={() => setCallType("cold")} className={`px-2 py-1 rounded transition-colors cursor-pointer ${callType === "cold" ? "bg-cyan-600 text-black" : "text-neutral-500"}`}>Cold Call</button>
                <button onClick={() => setCallType("update")} className={`px-2 py-1 rounded transition-colors cursor-pointer ${callType === "update" ? "bg-cyan-600 text-black" : "text-neutral-500"}`}>Follow-Up</button>
              </div>
            </div>

            {/* Script with inline fact-finding */}
            <div className="space-y-3">
              {/* INTRO / OVERDUE / FOLLOW-UP SCRIPT TEXT */}
              {(() => {
                const timeOfDay = new Date().getHours() < 12 ? "morning" : "afternoon"
                const overdueInvoices = (activeAccount.invoices || []).filter((i: any) => i.status === "Overdue" || i.status?.toLowerCase() === "overdue")
                const overdueTotal = overdueInvoices.reduce((sum: number, i: any) => sum + (parseFloat(i.amount) || 0), 0)

                if (overdueTotal > 0) {
                  return (
                    <div className="bg-red-950/20 border border-red-900/40 p-4 rounded-xl text-sm text-red-200 leading-relaxed whitespace-pre-line select-text">
                      {`Hi ${contactName}, this is ${repName} with Titan Diamond USA! Hope you're having a great ${timeOfDay}.\n\nI wanted to check in on your account. We noticed there is a pending balance of $${overdueTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} on your oldest overdue statement, and I wanted to see if we could get that taken care of today, or if you needed any invoice copies emailed over to you.\n\nIs there anything else we can quote or ship out for you today?`}
                    </div>
                  )
                }

                if (callType === "cold") {
                  return (
                    <>
                      {/* Cold Call Intro */}
                      <div className="bg-neutral-950/60 border border-neutral-800 p-4 rounded-xl text-sm text-neutral-300 leading-relaxed whitespace-pre-line select-text">
                        {`Hey, ${contactName} this is ${repName} over at Titan Diamond USA. I'm giving you a call today because we have an early release on our brand new 2026 line-up of blades that we featured at the The World of Concrete and ConExpo shows in Las Vegas this year and what's great is with this new release, our manufacturer wants us to give away free blades to our new customers to build new relationships... I just have a quick couple questions to see which blade will work best for you and what you're cutting...`}
                      </div>

                      {/* Q1: Blade Sizes */}
                      <div className="bg-cyan-950/20 border border-cyan-800/30 rounded-xl p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">1</span>
                          <p className="text-sm text-cyan-100/90 leading-relaxed italic">{'"First off... what size blades do you run? 14"?'}</p>
                        </div>
                        <div className="pl-7">
                          {renderPills(['10"', '12"', '14"', '16"', '18"', '20"', '24"', '30"', '36"'], ffBladeSizes, setFfBladeSizes, true)}
                        </div>
                      </div>

                      {/* Q2: Materials */}
                      <div className="bg-cyan-950/20 border border-cyan-800/30 rounded-xl p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">2</span>
                          <p className="text-sm text-cyan-100/90 leading-relaxed italic">"What are you guys cutting out there?"</p>
                        </div>
                        <div className="pl-7">
                          {renderPills(['Concrete', 'Asphalt', 'Brick', 'Block', 'Stone', 'Pavers', 'Granite', 'Marble', 'Tile', 'Ductile Iron', 'Rebar', 'Green Concrete'], ffMaterialsCut, setFfMaterialsCut, true)}
                        </div>
                      </div>

                      {/* Q3: Supplier + Cost */}
                      <div className="bg-cyan-950/20 border border-cyan-800/30 rounded-xl p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">3</span>
                          <p className="text-sm text-cyan-100/90 leading-relaxed italic">"Where do you pick up your blades now, do you buy them retail or over the phone from a wholesaler like me?"</p>
                        </div>
                        <div className="pl-7">
                          {renderPills(['Home Depot', 'Lowes', 'Sunbelt', 'United Rentals', 'White Cap', 'HD Supply', 'Ace', 'Local Supplier', 'Online', 'Manufacturer Direct', 'Other'], ffCurrentSupplier, setFfCurrentSupplier, true)}
                        </div>
                      </div>

                      {/* Q4: Price */}
                      <div className="bg-cyan-950/20 border border-cyan-800/30 rounded-xl p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">4</span>
                          <p className="text-sm text-cyan-100/90 leading-relaxed italic">{`"How much are they charging you for a good 14" blade? $250? $300 Bucks?"`}</p>
                        </div>
                        <div className="pl-7">
                          {renderPills(['$25-50', '$50-75', '$75-100', '$100-150', '$150-200', '$200-300', '$300-400', '$400+'], ffAvgBladeCost, setFfAvgBladeCost, true)}
                        </div>
                      </div>

                      {/* Q5: Crews */}
                      <div className="bg-cyan-950/20 border border-cyan-800/30 rounded-xl p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">5</span>
                          <p className="text-sm text-cyan-100/90 leading-relaxed italic">"How many crews do you have?"</p>
                        </div>
                        <div className="pl-7">
                          {renderPills(['1', '2-3', '4-5', '6-10', '10+'], ffCrewCount, setFfCrewCount, true)}
                        </div>
                      </div>

                      {/* Q6: Blades Per Order */}
                      <div className="bg-cyan-950/20 border border-cyan-800/30 rounded-xl p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">6</span>
                          <p className="text-sm text-cyan-100/90 leading-relaxed italic">"And how many blades do you normally pick up at a time.. 6.. 12.. 25?"</p>
                        </div>
                        <div className="pl-7">
                          {renderPills(['1-3', '4-6', '6-10', '12-25', '25+'], ffBladesPerOrder, setFfBladesPerOrder, true)}
                        </div>
                      </div>

                      {/* Q7: Improvement Priority */}
                      <div className="bg-cyan-950/20 border border-cyan-800/30 rounded-xl p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">7</span>
                          <p className="text-sm text-cyan-100/90 leading-relaxed italic">"Let me ask you one last question... if you could improve one thing about the blades you are using right now... what would it be... longer life... faster cutting... or cleaner cutting?"</p>
                        </div>
                        <div className="pl-7 flex gap-1.5">
                          {['Longer life', 'Faster cutting', 'Cleaner cutting', 'Lower price'].map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setFfImprovementPriority(ffImprovementPriority === opt ? '' : opt)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                                ffImprovementPriority === opt
                                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                  : 'bg-neutral-900 border-neutral-700 text-neutral-500 hover:border-neutral-600 hover:text-neutral-400'
                              }`}
                            >
                              {ffImprovementPriority === opt ? '\u2713 ' : ''}{opt}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Fact-Finding Summary Badge */}
                      <div className="flex items-center justify-between bg-neutral-900/40 border border-neutral-800/40 rounded-lg px-3 py-1.5">
                        <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                          <FiActivity size={10} /> Fact-Finding Progress
                        </span>
                        <div className="flex items-center gap-1">
                          {[ffBladeSizes, ffMaterialsCut, ffCurrentSupplier, ffAvgBladeCost, ffCrewCount, ffBladesPerOrder, ffImprovementPriority].map((v, i) => (
                            <div key={i} className={`w-2 h-2 rounded-full ${v ? 'bg-amber-400' : 'bg-neutral-800'}`} />
                          ))}
                          <span className="text-[9px] font-black text-amber-400 ml-1">
                            {[ffBladeSizes, ffMaterialsCut, ffCurrentSupplier, ffAvgBladeCost, ffCrewCount, ffBladesPerOrder, ffImprovementPriority].filter(Boolean).length}/7
                          </span>
                        </div>
                      </div>
                    </>
                  )
                }

                // Follow-up script - show generated text + inline fact-finding for any missing fields
                return (
                  <>
                    <div className="bg-neutral-950/60 border border-neutral-800 p-4 rounded-xl text-sm text-neutral-300 leading-relaxed whitespace-pre-line select-text">
                      {generateScript()}
                    </div>

                    {/* Inline fact-finding for follow-ups (for any missing data) */}
                    {(() => {
                      const fields = [
                        { label: 'Blade Sizes', q: '"What size blades are you running?"', filled: !!ffBladeSizes, render: () => renderPills(['10"', '12"', '14"', '16"', '18"', '20"', '24"', '30"', '36"'], ffBladeSizes, setFfBladeSizes, true) },
                        { label: 'Materials', q: '"What materials are you cutting?"', filled: !!ffMaterialsCut, render: () => renderPills(['Concrete', 'Asphalt', 'Brick', 'Block', 'Stone', 'Pavers', 'Granite', 'Marble', 'Tile', 'Ductile Iron', 'Rebar', 'Green Concrete'], ffMaterialsCut, setFfMaterialsCut, true) },
                        { label: 'Supplier', q: '"Where do you pick up your blades?"', filled: !!ffCurrentSupplier, render: () => renderPills(['Home Depot', 'Lowes', 'Sunbelt', 'United Rentals', 'White Cap', 'HD Supply', 'Ace', 'Local Supplier', 'Online', 'Manufacturer Direct', 'Other'], ffCurrentSupplier, setFfCurrentSupplier, true) },
                        { label: 'Avg Cost', q: '"How much are they charging you?"', filled: !!ffAvgBladeCost, render: () => renderPills(['$25-50', '$50-75', '$75-100', '$100-150', '$150-200', '$200-300', '$300-400', '$400+'], ffAvgBladeCost, setFfAvgBladeCost, true) },
                        { label: 'Crews', q: '"How many crews do you have?"', filled: !!ffCrewCount, render: () => renderPills(['1', '2-3', '4-5', '6-10', '10+'], ffCrewCount, setFfCrewCount, true) },
                        { label: 'Blades/Order', q: '"How many blades do you pick up at a time?"', filled: !!ffBladesPerOrder, render: () => renderPills(['1-3', '4-6', '6-10', '12-25', '25+'], ffBladesPerOrder, setFfBladesPerOrder, true) },
                        { label: 'Priority', q: '"What would you improve about your blades?"', filled: !!ffImprovementPriority, render: () => (
                          <div className="flex gap-1.5">
                            {['Longer life', 'Faster cutting', 'Cleaner cutting', 'Lower price'].map(opt => (
                              <button key={opt} type="button" onClick={() => setFfImprovementPriority(ffImprovementPriority === opt ? '' : opt)} className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${ffImprovementPriority === opt ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-neutral-900 border-neutral-700 text-neutral-500 hover:border-neutral-600'}`}>
                                {ffImprovementPriority === opt ? '\u2713 ' : ''}{opt}
                              </button>
                            ))}
                          </div>
                        )}
                      ]
                      const missing = fields.filter(f => !f.filled)
                      if (missing.length === 0) return null
                      return (
                        <div className="bg-amber-950/20 border border-amber-800/30 rounded-xl p-3 space-y-2">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                            <FiActivity size={10} /> Missing Fact-Finding ({missing.length} of 7)
                          </span>
                          {missing.map((f, i) => (
                            <div key={i} className="space-y-1.5">
                              <p className="text-xs text-amber-200/80 italic pl-1">{f.q}</p>
                              <div className="pl-1">{f.render()}</div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </>
                )
              })()}
            </div>
          </div>

          {/* BLADE PITCH RECOMMENDATIONS */}
          <div className="mx-5 mt-4 bg-emerald-950/20 border border-emerald-900/50 p-5 rounded-2xl space-y-4">
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

          {/* SALES CLOSE SCRIPT */}
          <div className="mx-5 mt-4 bg-sky-950/20 border border-sky-900/50 p-5 rounded-2xl space-y-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5 mb-1">
              <FiCreditCard /> Move to Close
            </span>

            {/* Step 1: Verify Address */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 text-[10px] font-black flex items-center justify-center">1</span>
                <h4 className="text-white font-bold text-sm">Verify Shipping Address</h4>
              </div>
              <p className="text-xs text-sky-100/70 leading-relaxed pl-7">
                {(() => {
                  const addr = accountDetail || activeAccount
                  const hasAddr = addr.billingStreet || addr.billingCity || addr.shippingStreet || addr.shippingCity
                  const shipAddr = addr.shippingStreet || addr.billingStreet
                  const shipCity = addr.shippingCity || addr.billingCity
                  const shipState = addr.shippingState || addr.billingState
                  const shipZip = addr.shippingZip || addr.billingZip
                  return hasAddr
                    ? `"Now to get these blades in your hands... you're still out there at ${shipAddr}${shipCity ? ', ' + shipCity : ''}${shipState ? ', ' + shipState : ''} ${shipZip || ''}... is that correct?"`
                    : '"Now to get these blades in your hands... what\'s the best shipping address for you?"'
                })()}
              </p>
            </div>

            {/* Step 2: Payment */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 text-[10px] font-black flex items-center justify-center">2</span>
                <h4 className="text-white font-bold text-sm">Take Payment</h4>
              </div>
              <p className="text-xs text-sky-100/70 leading-relaxed pl-7">
                "Perfect  --  we'll take care of everything right now and get your confirmation sent out today. Should we mark this to your attention, or do I need a PO Number?"
              </p>
              <p className="text-xs text-sky-100/70 leading-relaxed pl-7 mt-1">
                "What's easiest for you  --  do you want us to bill you later, or do you wanna throw this on a card and get it out of the way?"
              </p>
              <p className="text-xs text-neutral-500 pl-7 mt-1 italic">
                If card: "Perfect, go ahead and read the number from left to right, 4 digits at a time."
              </p>
              <div className="pl-7 mt-2 grid grid-cols-2 gap-2">
                <div className="bg-sky-500/5 border border-sky-500/10 rounded-lg px-3 py-1.5 text-[10px] text-sky-300 font-bold">💳 Full card number</div>
                <div className="bg-sky-500/5 border border-sky-500/10 rounded-lg px-3 py-1.5 text-[10px] text-sky-300 font-bold">📅 Expiration date</div>
                <div className="bg-sky-500/5 border border-sky-500/10 rounded-lg px-3 py-1.5 text-[10px] text-sky-300 font-bold">🔒 CVV code</div>
                <div className="bg-sky-500/5 border border-sky-500/10 rounded-lg px-3 py-1.5 text-[10px] text-sky-300 font-bold">📍 Billing ZIP code</div>
              </div>
              <p className="text-xs text-neutral-500 pl-7 mt-2 italic">
                Or Net 30: "Great  --  I'll get everything rolling and email your invoice with Net 30 terms. Who's the best contact for billing on your end?"
              </p>
            </div>

            {/* Step 3: Confirm Email */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 text-[10px] font-black flex items-center justify-center">3</span>
                <h4 className="text-white font-bold text-sm">Confirm Email</h4>
              </div>
              <p className="text-xs text-sky-100/70 leading-relaxed pl-7">
                {displayEmail
                  ? `"Got it  --  I'm submitting that now through our secure processor. You'll receive an email receipt and full tracking info shortly. Just confirming  --  should I send everything to ${displayEmail}?"`
                  : '"Got it  --  I\'m submitting that now through our secure processor. You\'ll receive an email receipt and full tracking info shortly. What\'s the best email address to send everything to?"'}
              </p>
            </div>

            {/* Step 4: Final Close */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black flex items-center justify-center">✓</span>
                <h4 className="text-white font-bold text-sm">Final Close</h4>
              </div>
              <p className="text-xs text-sky-100/70 leading-relaxed pl-7">
                "You're all set, {contactName}  --  we'll have your blades on the way within 3-5 business days. If anything comes up, you can reach me directly at this number  --  and again, I really appreciate your trust in us and look forward to building a long relationship with you."
              </p>
            </div>
          </div>

          {/* LOG OUTCOME */}
          <div className="mx-5 mt-4 mb-5 bg-neutral-950/40 border border-neutral-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <FiActivity className="text-cyan-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Log Outreach Outcome</h3>
            </div>

            {/* Contact reached toggle */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-neutral-400">Did you reach a contact?</label>
              <div className="flex bg-neutral-950 p-0.5 rounded-lg border border-neutral-800">
                <button type="button" onClick={() => setContactReached(true)} className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${contactReached ? 'bg-cyan-500 text-black' : 'text-neutral-500 hover:text-neutral-300'}`}>Yes</button>
                <button type="button" onClick={() => setContactReached(false)} className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${!contactReached ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>No</button>
              </div>
            </div>

            {contactReached && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">Spoke With</label>
                  <input type="text" placeholder="Name of contact" value={spokeTo} onChange={e => setSpokeTo(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">Outcome</label>
                  <select value={outcome} onChange={e => setOutcome(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer">
                    <option value="check_in">General Check-in</option>
                    <option value="pitch">Product Pitch</option>
                    <option value="order_placed">Order Placed</option>
                    <option value="follow_up">Request Callback / Follow Up</option>
                    <option value="other">Other / Account Audit</option>
                  </select>
                </div>
              </div>
            )}

            {!contactReached && (
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">Outcome</label>
                <select value={outcome} onChange={e => setOutcome(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer">
                  <option value="left_voicemail">Left Voicemail</option>
                  <option value="no_answer">No Answer / Busy</option>
                  <option value="other">Other / Closed</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">Notes</label>
              <textarea rows={3} placeholder="Product interest, pricing feedback, follow-up notes..." value={notes} onChange={e => setNotes(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors resize-none" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">Follow-up Date (Optional)</label>
              <input type="date" value={followUpDate} min={new Date().toISOString().split('T')[0]} onChange={e => setFollowUpDate(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors" />
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={handleNext} className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-300 font-bold text-xs rounded-xl transition-all cursor-pointer">
                Skip Account
              </button>
              <button type="button" onClick={handleLogAndNext} className="flex-1 flex items-center justify-center gap-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-black font-extrabold text-xs rounded-xl shadow-lg shadow-cyan-950/20 transition-all cursor-pointer">
                <span>Log Outcome & Next</span>
                <FiArrowRight size={13} />
              </button>
            </div>
          </div>

        </div>

        {/* === RIGHT PANEL: ACCOUNT INTEL === */}
        <div className="w-[340px] bg-[#080b12] border-l border-neutral-800/50 overflow-y-auto scrollbar-thin p-4 space-y-4 shrink-0">

          {isLoadingIntel && (
            <div className="flex items-center justify-center py-10 text-neutral-500">
              <FiLoader className="animate-spin mr-2" size={18} />
              <span className="text-xs font-bold">Loading account intel...</span>
            </div>
          )}

          {/* PROFILE */}
          <div className="bg-neutral-950/40 border border-neutral-800/60 rounded-xl p-3 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5"><FiUser size={11} /> Profile</span>
            {(() => {
              const addr = accountDetail || activeAccount
              return (
                <div className="space-y-1.5">
                  {(addr.billingStreet || addr.billingCity) && (
                    <div>
                      <span className="text-[9px] font-bold text-neutral-600 uppercase">Billing</span>
                      <p className="text-xs text-neutral-300">{addr.billingStreet && `${addr.billingStreet}, `}{addr.billingCity && `${addr.billingCity}, `}{addr.billingState} {addr.billingZip}</p>
                    </div>
                  )}
                  {(addr.shippingStreet || addr.shippingCity) && (
                    <div>
                      <span className="text-[9px] font-bold text-neutral-600 uppercase">Shipping</span>
                      <p className="text-xs text-neutral-300">{addr.shippingStreet && `${addr.shippingStreet}, `}{addr.shippingCity && `${addr.shippingCity}, `}{addr.shippingState} {addr.shippingZip}</p>
                    </div>
                  )}
                  {activeAccount.industry && <div className="flex items-center gap-1.5"><span className="text-[9px] font-bold text-neutral-600">Industry:</span><span className="text-xs text-neutral-300">{activeAccount.industry}</span></div>}
                  {activeAccount.tags && <div className="flex items-center gap-1.5"><FiTag size={10} className="text-neutral-600" /><span className="text-xs text-neutral-300">{activeAccount.tags}</span></div>}
                  {activeAccount.owner?.name && <div className="flex items-center gap-1.5"><span className="text-[9px] font-bold text-neutral-600">Owner:</span><span className="text-xs text-neutral-300">{activeAccount.owner.name}</span></div>}
                  {accountDetail?.booksContact?.website && <div className="flex items-center gap-1.5"><span className="text-[9px] font-bold text-neutral-600">Web:</span><a href={accountDetail.booksContact.website.startsWith('http') ? accountDetail.booksContact.website : `https://${accountDetail.booksContact.website}`} target="_blank" rel="noopener" className="text-xs text-blue-400 hover:underline truncate">{accountDetail.booksContact.website}</a></div>}
                </div>
              )
            })()}
          </div>

          {/* PRODUCT LTV */}
          {(() => {
            const giftKeywords = ['shirt', 'knife', 'knives', 'hat', 'cap', 'tracking', 'adjustment', 'credit', 'discount', 'shipping', 'freight', 'free', 'promo', 'gift', 'sample', 'return']
            const isGift = (name: string) => giftKeywords.some(k => name.toLowerCase().includes(k))
            const products = accountPurchases.filter((p: any) => !isGift(p.name || ''))
            const gifts = accountPurchases.filter((p: any) => isGift(p.name || ''))
            const maxSpend = Math.max(...accountPurchases.map((x: any) => x.totalSpend || 0), 1)

            const renderCard = (p: any, i: number, color: string) => {
              const pct = maxSpend > 0 ? ((p.totalSpend || 0) / maxSpend) * 100 : 0
              const avgOrder = p.quantity > 0 ? (p.totalSpend || 0) / p.quantity : 0
              return (
                <div key={i} className="bg-neutral-900/60 border border-neutral-800/40 rounded-lg p-2">
                  <div className="flex items-start justify-between mb-0.5">
                    <span className="text-[11px] text-white font-bold leading-tight pr-2 flex-1">{p.name}</span>
                    <span className={`text-[11px] font-black shrink-0 ${color}`}>${(p.totalSpend || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                  </div>
                  {p.sku && p.sku !== 'N/A' && (
                    <span className="text-[8px] font-bold text-neutral-600 uppercase">SKU: {p.sku}</span>
                  )}
                  <div className="w-full bg-neutral-800/60 rounded-full h-1 mt-1 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${color === 'text-amber-400' ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-gradient-to-r from-purple-500 to-purple-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[8px] text-neutral-500">
                      <span className="text-neutral-400 font-bold">{p.quantity}</span> units
                    </span>
                    <span className="text-[8px] text-neutral-500">
                      avg <span className="text-neutral-400 font-bold">${avgOrder.toFixed(0)}</span>/unit
                    </span>
                  </div>
                </div>
              )
            }

            return (
              <>
                {/* Products Section */}
                <div className="bg-gradient-to-b from-amber-950/20 to-neutral-950/40 border border-amber-500/20 rounded-xl p-3 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <FiTrendingUp size={11} /> Products
                    {products.length > 0 && (
                      <span className="ml-auto text-[9px] font-black text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full">
                        ${products.reduce((s: number, p: any) => s + (p.totalSpend || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} LTV
                      </span>
                    )}
                  </span>
                  {products.length === 0 ? (
                    <p className="text-xs text-neutral-500 text-center py-2">No products purchased yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {products.map((p: any, i: number) => renderCard(p, i, 'text-amber-400'))}
                    </div>
                  )}
                </div>

                {/* Gifts & Promos Section */}
                {gifts.length > 0 && (
                  <div className="bg-gradient-to-b from-purple-950/20 to-neutral-950/40 border border-purple-500/20 rounded-xl p-3 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                      <FiTag size={11} /> Gifts & Promos
                      <span className="ml-auto text-[9px] font-black text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded-full">
                        {gifts.length} items
                      </span>
                    </span>
                    <div className="space-y-1.5">
                      {gifts.map((p: any, i: number) => renderCard(p, i, 'text-purple-400'))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          {/* DEALS */}
          {activeAccount.deals && activeAccount.deals.length > 0 && (
            <div className="bg-neutral-950/40 border border-neutral-800/60 rounded-xl p-3 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5"><FiDollarSign size={11} /> Deals ({activeAccount.deals.length})</span>
              <div className="space-y-1.5">
                {activeAccount.deals.slice(0, 10).map((deal: any, i: number) => (
                  <div key={deal.id || i} className="flex items-center justify-between bg-neutral-900/50 border border-neutral-800/40 rounded-lg px-2.5 py-1.5">
                    <div>
                      <span className="text-xs text-white font-bold">{deal.name || `Deal ${i+1}`}</span>
                      {deal.stage && <span className="ml-1.5 text-[9px] font-bold text-purple-400">{deal.stage}</span>}
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-neutral-300">${(deal.amount || 0).toLocaleString()}</span>
                      {deal.closingDate && <span className="text-[9px] text-neutral-500 ml-1.5">{new Date(deal.closingDate).toLocaleDateString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* INVOICES */}
          <div className="bg-neutral-950/40 border border-neutral-800/60 rounded-xl p-3 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5"><FiFileText size={11} /> Invoices ({(activeAccount.invoices || []).length})</span>
            {!activeAccount.invoices || activeAccount.invoices.length === 0 ? (
              <p className="text-xs text-neutral-500 text-center py-2">No invoices</p>
            ) : (
              <div className="space-y-1">
                {(activeAccount.invoices || []).slice(0, 20).map((inv: any, i: number) => {
                  const items = inv.items || {}
                  return (
                    <div key={inv.id || i} className="flex items-center justify-between bg-neutral-900/50 border border-neutral-800/40 rounded-lg px-2.5 py-1.5">
                      <div>
                        <span className="text-xs text-white font-bold">{items.invoiceNumber || items.invoice_number || `INV-${i+1}`}</span>
                        <span className={`ml-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${inv.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : inv.status === 'overdue' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>{inv.status}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-neutral-300">${(inv.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span className="text-[9px] text-neutral-500 ml-1.5">{inv.issueDate ? new Date(inv.issueDate).toLocaleDateString() : ''}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* SALES ORDERS */}
          {activeAccount.salesOrders && activeAccount.salesOrders.length > 0 && (
            <div className="bg-neutral-950/40 border border-neutral-800/60 rounded-xl p-3 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5"><FiShoppingCart size={11} /> Sales Orders ({activeAccount.salesOrders.length})</span>
              <div className="space-y-1">
                {activeAccount.salesOrders.slice(0, 15).map((so: any, i: number) => {
                  const items = so.items || {}
                  return (
                    <div key={so.id || i} className="flex items-center justify-between bg-neutral-900/50 border border-neutral-800/40 rounded-lg px-2.5 py-1.5">
                      <div>
                        <span className="text-xs text-white font-bold">{items.salesorder_number || items.salesOrderNumber || `SO-${i+1}`}</span>
                        <span className={`ml-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${so.status === 'fulfilled' || so.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{so.status}</span>
                      </div>
                      <span className="text-xs font-bold text-neutral-300">${(so.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* NOTES / CALL LOG */}
          <div className="bg-neutral-950/40 border border-neutral-800/60 rounded-xl p-3 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5"><FiFileText size={11} /> Notes ({accountNotes.length})</span>
            {accountNotes.length === 0 ? (
              <p className="text-xs text-neutral-500 text-center py-2">No notes</p>
            ) : (
              <div className="space-y-1.5">
                {accountNotes.map((note: any, i: number) => (
                  <div key={note.id || i} className="bg-neutral-900/50 border border-neutral-800/40 rounded-lg p-2">
                    <div className="flex justify-between items-start mb-0.5">
                      <span className="text-[10px] font-bold text-neutral-400">
                        {note.author?.name || 'System'}
                        {note.sentiment && <span className={`ml-1 px-1 py-0.5 rounded text-[8px] uppercase ${note.sentiment === 'positive' ? 'bg-emerald-500/10 text-emerald-400' : note.sentiment === 'negative' ? 'bg-red-500/10 text-red-400' : 'bg-neutral-500/10 text-neutral-400'}`}>{note.sentiment}</span>}
                      </span>
                      <span className="text-[9px] text-neutral-600">{note.createdAt ? new Date(note.createdAt).toLocaleDateString() : ''}</span>
                    </div>
                    <p className="text-[11px] text-neutral-300 leading-relaxed whitespace-pre-wrap line-clamp-3">{note.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>


        </div>

      </div>
    </div>
  )
}

