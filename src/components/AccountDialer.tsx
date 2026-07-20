"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { formatPhoneNumber } from "@/lib/formatters"
import { useZoho } from "@/components/ZohoProvider"
import { FactFindingPanel, FactFindingSummary, EMPTY_FACT_FINDING, type FactFindingValues } from "@/components/FactFindingPanel"
import {
  FiPhoneCall, FiClock, FiCheckSquare, FiBookOpen, FiActivity, FiTag, FiAlertCircle,
  FiChevronDown, FiChevronRight, FiMapPin, FiShoppingCart, FiZap,
  FiPackage, FiFileText, FiDollarSign, FiLoader, FiMail, FiTrendingUp,
  FiSearch, FiPlus, FiX, FiArrowRight, FiCreditCard, FiUser
} from "react-icons/fi"
import Link from "next/link"
import { OrderBuilder, type OrderLine } from "@/components/OrderBuilder"
import { PhoneLink } from "@/components/PhoneLink"
import { toast } from 'react-hot-toast';

interface AccountDialerProps {
  accountId: string
  account: any
  contacts: any[]
}

export function AccountDialer({ accountId, account, contacts }: AccountDialerProps) {
  const { zohoContext: currentUser } = useZoho()
  
  const [outcome, setOutcome] = useState("check_in")
  const [spokeTo, setSpokeTo] = useState("")
  const [notes, setNotes] = useState("")
  const [followUpDate, setFollowUpDate] = useState("")
  const [contactReached, setContactReached] = useState(true)
  
  const [factFinding, setFactFinding] = useState<FactFindingValues>(EMPTY_FACT_FINDING)
  const [callType, setCallType] = useState<"cold" | "update">("cold")

  const [aiViewMode, setAiViewMode] = useState<"dialer" | "ai">("dialer")
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiType, setAiType] = useState<"text" | "image">("text")
  const [aiChannel, setAiChannel] = useState("SMS")
  const [aiResult, setAiResult] = useState<string | null>(null)
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [showAiMagic, setShowAiMagic] = useState(false)

  const [orderLines, setOrderLines] = useState<OrderLine[]>([])
  const [catalogProducts, setCatalogProducts] = useState<any[]>([])
  const [defaultVigRate, setDefaultVigRate] = useState(1.3)
  const [commissionPct, setCommissionPct] = useState(50)

  const [timerSeconds, setTimerSeconds] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const [accountPurchases, setAccountPurchases] = useState<any[]>([])
  const [accountNotes, setAccountNotes] = useState<any[]>([])
  const [isLoadingIntel, setIsLoadingIntel] = useState(false)
  const [intelTab, setIntelTab] = useState<'purchases' | 'notes' | 'invoices'>('purchases')
  const [accountDetail, setAccountDetail] = useState<any>(null)

  const repName = currentUser?.name || "your sales rep"

  const initiateCall = (phone: string) => {
    if (!phone) return
    fetch('/api/calls/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'INITIATE_CALL', accountId: account?.id, userId: currentUser?.id,
        userEmail: currentUser?.email
      })
    }).catch(err => console.error("Error logging call initiation:", err))
    
    navigator.clipboard?.writeText(phone).catch(() => {})
  }

  useEffect(() => {
    fetch('/api/get-products').then(r => r.json()).then(d => {
      if (d.success) setCatalogProducts(d.products || [])
    }).catch(() => {})

    fetch('/api/admin/settings').then(r => r.json()).then(d => {
      if (d.success && d.settings) {
        if (d.settings.default_vig_rate) setDefaultVigRate(d.settings.default_vig_rate)
        if (d.settings.commission_rate_pct) setCommissionPct(d.settings.commission_rate_pct)
      }
    }).catch(() => {})
  }, [])



  useEffect(() => {
    if (!account?.zohoId) return
    let cancelled = false
    setIsLoadingIntel(true)
    setAccountPurchases([])
    setAccountNotes([])
    setAccountDetail(null)

    Promise.all([
      fetch(`/api/get-account-purchases?accountId=${account.zohoId}`).then(r => r.json()).catch(() => ({ products: [] })),
      fetch(`/api/get-account-details?id=${account.zohoId}`).then(r => r.json()).catch(() => ({ account: null }))
    ]).then(([purchaseData, detailData]) => {
      if (cancelled) return
      setAccountPurchases(purchaseData.purchasedProducts || purchaseData.products || [])
      setAccountNotes(detailData.account?.notes || detailData.notes || [])
      setAccountDetail(detailData.account || null)
    }).finally(() => {
      if (!cancelled) setIsLoadingIntel(false)
    })

    return () => { cancelled = true }
  }, [account?.zohoId])

  useEffect(() => {
    if (!account) return

    const primaryContact = contacts?.find((c: any) => c.isPrimary) || contacts?.[0] || account.contacts?.find((c: any) => c.isPrimary) || account.contacts?.[0]
    setSpokeTo(primaryContact ? `${primaryContact.firstName || ""} ${primaryContact.lastName || ""}`.trim() : "")
    setNotes("")
    setFollowUpDate("")
    setOutcome("check_in")
    setContactReached(true)

    setFactFinding({
      bladeSizes: account.bladeSizes || '',
      materialsCut: account.materialsCut || '',
      currentSupplier: account.currentSupplier || '',
      avgBladeCost: account.averageBladeCost || account.avgBladeCost || '',
      crewCount: account.crewCount || '',
      bladesPerOrder: account.bladesPerOrder || '',
      improvementPriority: account.improvementPriority || '',
      readyToBuy: account.readyToBuy || '',
      jobTypes: account.jobTypes || '',
      painPoints: account.painPoints || '',
      productInterest: account.productInterest || [],
    })
    setOrderLines([])

    if (account.lastCalledAt) {
      setCallType("update")
    } else {
      setCallType("cold")
    }

    setAiPrompt("")
    setAiResult(null)
    setShowAiMagic(false)

    setTimerSeconds(0)
    if (timerRef.current) clearInterval(timerRef.current)
    
    timerRef.current = setInterval(() => {
      setTimerSeconds(prev => prev + 1)
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [account, contacts])

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const primaryContact = contacts?.find((c: any) => c.isPrimary) || contacts?.[0] || account?.contacts?.find((c: any) => c.isPrimary) || account?.contacts?.[0]
  const displayPhone = primaryContact?.phone || primaryContact?.mobilePhone || ''
  const cleanPhone = displayPhone ? displayPhone.replace(/[^0-9+]/g, '') : ''
  const contactName = spokeTo || (primaryContact ? `${primaryContact.firstName || ""} ${primaryContact.lastName || ""}`.trim() : "there")

  const generateScript = () => {
    const timeOfDay = new Date().getHours() < 12 ? "morning" : "afternoon"
    const overdueInvoices = (account?.invoices || []).filter((i: any) => i.status === "Overdue" || i.status?.toLowerCase() === "overdue")
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

    const missing: string[] = []
    if (!factFinding.bladeSizes) missing.push("what size blades you primarily run")
    if (!factFinding.materialsCut) missing.push("what materials you guys are cutting most right now")
    if (!factFinding.crewCount) missing.push("how many crews you have out in the field")
    if (!factFinding.bladesPerOrder) missing.push("how many blades you normally pick up at a time")
    if (!factFinding.improvementPriority) missing.push("what's the one thing you'd improve about your current blades (longer life, faster, or cleaner cutting)")
    
    if (missing.length > 0) {
      scriptText += `By the way, I was just updating your account profile and realized I didn't have it on file -- could you remind me ${missing[0]}?\n\n`
    }

    scriptText += `Is there anything we can quote or ship out for you today?`
    return scriptText
  }

  const getBladeRecommendation = () => {
    const mat = (factFinding.materialsCut || '').toLowerCase()
    const prio = (factFinding.improvementPriority || '').toLowerCase()
    
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
        toast.error("Failed to generate AI content: " + data.message);
      }
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setIsGeneratingAi(false);
    }
  }

  const handleLogCall = async () => {
    try {
      const response = await fetch("/api/log-sales-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: account?.id || accountId,
          outcome,
          notes,
          callerName: repName,
          contactReached,
          spokeTo: contactReached ? spokeTo : "",
          followUpDate: followUpDate || null,
          durationMinutes: Math.max(1, Math.ceil(timerSeconds / 60)),
          userId: currentUser?.id,
          factFinding: {
            bladeSizes: factFinding.bladeSizes || undefined,
            materialsCut: factFinding.materialsCut || undefined,
            currentSupplier: factFinding.currentSupplier || undefined,
            averageBladeCost: factFinding.avgBladeCost || undefined,
            productInterest: factFinding.productInterest.length > 0 ? factFinding.productInterest : undefined,
            readyToBuy: factFinding.readyToBuy || undefined,
            painPoints: factFinding.painPoints || undefined,
            jobTypes: factFinding.jobTypes || undefined,
            crewCount: factFinding.crewCount || undefined,
            bladesPerOrder: factFinding.bladesPerOrder || undefined,
            improvementPriority: factFinding.improvementPriority || undefined,
          },
          orderLines: orderLines.length > 0 ? orderLines.map(l => ({
            name: l.name,
            sku: l.sku,
            quantity: l.quantity,
            isPromo: l.isPromo,
            unitPrice: l.unitPrice,
            lineTotal: l.quantity * l.unitPrice
          })) : undefined
        })
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Call logged successfully!")
        setNotes("")
        setFollowUpDate("")
        setOrderLines([])
      } else {
        toast.error(data.error || "Failed to log call outcome.")
      }
    } catch (e: any) {
      toast.error("Error logging call: " + e.message)
    }
  }

  const displayEmail = primaryContact?.email || accountDetail?.booksContact?.email || account?.booksContact?.email || ''

  if (!account) return null

  return (
    <div className="flex flex-col h-full bg-[#06080f]">
      {/* --- COMPACT TOP BAR --- */}
      <header className="bg-[#0a0d14] border-b border-cyan-500/10 px-4 py-1.5 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full bg-cyan-500/10 flex items-center justify-center">
            <FiPhoneCall className="text-cyan-400 animate-pulse" size={12} />
          </div>
          <h1 className="text-white font-black text-xs tracking-wide">TITAN DIALER</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/40 border border-cyan-500/20">
            <FiClock className="text-cyan-500/60" size={11} />
            <span className="font-mono text-sm font-black text-cyan-400 tabular-nums tracking-wider">{formatTimer(timerSeconds)}</span>
          </div>
          <button
            onClick={() => setAiViewMode(aiViewMode === "ai" ? "dialer" : "ai")}
            className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold transition-all border cursor-pointer ${
              aiViewMode === "ai"
                ? 'bg-purple-500 border-purple-400 text-white shadow-lg shadow-purple-500/30'
                : 'bg-neutral-900/60 border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500'
            }`}
          >
            <FiZap size={10} />
            {aiViewMode === "ai" ? "Close AI" : "AI Copilot"}
          </button>
        </div>
      </header>

      {/* --- MAIN 2-PANEL BODY (center + intel) --- */}
      <div className="flex-1 flex min-h-0">

        {/* === CENTER PANEL: DIALER + SCRIPT + CLOSE + LOG === */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto scrollbar-thin">

          {aiViewMode === "ai" ? (
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">AI Magic Tool</h2>
              <div className="space-y-4 max-w-2xl">
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Prompt</label>
                  <textarea 
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-3 text-sm text-white focus:border-purple-500 h-24"
                    placeholder="e.g. Write a quick follow-up text for a customer who bought Medusa blades last month."
                  />
                </div>
                <button
                  onClick={handleGenerateAi}
                  disabled={isGeneratingAi || !aiPrompt}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold text-sm disabled:opacity-50 cursor-pointer"
                >
                  {isGeneratingAi ? "Generating..." : "Generate with AI"}
                </button>
                {aiResult && (
                  <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded mt-4">
                    <p className="text-sm text-purple-100 whitespace-pre-wrap">{aiResult}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* STICKY ACCOUNT HUD */}
              <div className="sticky top-0 z-40 bg-[#06080f]/95 backdrop-blur-md border-b border-cyan-500/10 pb-3">
                <div className="px-5 pt-3 flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-black text-white leading-tight truncate">{contactName}</h2>
                    <p className="text-xs text-neutral-400 font-semibold truncate">{account?.name}</p>
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
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold text-[10px] rounded-lg border border-emerald-500/20 transition-all cursor-pointer"
                      >
                        {'\ud83d\udcac'} SMS
                      </a>
                    )}
                    {displayEmail && (
                      <a
                        href={`mailto:${displayEmail}`}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-bold text-[10px] rounded-lg border border-blue-500/20 transition-all cursor-pointer"
                      >
                        <FiMail size={12} /> Email
                      </a>
                    )}
                  </div>
                </div>

                <div className="px-5 mt-1.5 flex flex-wrap items-center gap-3">
                  {displayPhone && (
                    <PhoneLink
                      phone={cleanPhone}
                      className="flex items-center gap-1"
                      onBeforeCall={(ph) => navigator.clipboard?.writeText(ph).catch(() => {})}
                    >
                      <FiPhoneCall size={10} className="text-cyan-500" />
                      <span className="text-xs font-mono font-bold text-cyan-300 select-all" title="Phone number for ZDialer">{formatPhoneNumber(displayPhone)}</span>
                    </PhoneLink>
                  )}
                  {displayEmail && (
                    <div className="flex items-center gap-1 text-xs text-blue-400">
                      <FiMail size={10} />
                      <span className="font-mono font-bold truncate max-w-[180px]">{displayEmail}</span>
                    </div>
                  )}
                  {(() => {
                    const addr = accountDetail || account
                    const ship = addr?.shippingStreet || addr?.shippingCity
                    return ship ? (
                      <div className="flex items-center gap-1 text-[10px] text-neutral-400">
                        <FiMapPin size={10} className="text-neutral-500" />
                        <span>{addr.shippingStreet && `${addr.shippingStreet}, `}{addr.shippingCity && `${addr.shippingCity}, `}{addr.shippingState} {addr.shippingZip}</span>
                      </div>
                    ) : null
                  })()}
                </div>

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
                    const overdueInvs = (account?.invoices || []).filter((inv: any) => inv.status?.toLowerCase() === 'overdue')
                    const overdueTotal = overdueInvs.reduce((s: number, inv: any) => s + (Number(inv.balance) || Number(inv.total) || 0), 0)
                    return overdueTotal > 0 ? (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/5 border border-red-500/20">
                        <FiAlertCircle size={10} className="text-red-500" />
                        <span className="text-[10px] font-black text-red-400">${overdueTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span className="text-[7px] font-bold text-neutral-600 uppercase">Due</span>
                      </div>
                    ) : null
                  })()}
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

                {Object.values(factFinding).some(v => Array.isArray(v) ? v.length > 0 : !!v) && (
                  <div className="px-5 mt-1.5">
                    <FactFindingSummary values={factFinding} />
                  </div>
                )}

                <div className="px-5 mt-2.5 pt-2.5 border-t border-neutral-800/60 flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-bold text-neutral-400">Reached:</span>
                    <div className="flex bg-neutral-950 p-0.5 rounded border border-neutral-800">
                      <button type="button" onClick={() => { setContactReached(true); setOutcome("check_in"); }} className={`px-2 py-0.5 rounded-[3px] text-[10px] font-bold transition-all cursor-pointer ${contactReached ? 'bg-cyan-500 text-black' : 'text-neutral-500 hover:text-neutral-300'}`}>Yes</button>
                      <button type="button" onClick={() => { setContactReached(false); setOutcome("left_voicemail"); }} className={`px-2 py-0.5 rounded-[3px] text-[10px] font-bold transition-all cursor-pointer ${!contactReached ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>No</button>
                    </div>
                  </div>

                  {contactReached && (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] font-bold text-neutral-400">Spoke With:</span>
                      <input 
                        type="text" 
                        placeholder="Name" 
                        value={spokeTo} 
                        onChange={e => setSpokeTo(e.target.value)} 
                        className="w-28 bg-neutral-950 border border-neutral-800 rounded px-2 py-0.5 text-[10px] text-white focus:outline-none focus:border-cyan-500" 
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-bold text-neutral-400">Outcome:</span>
                    <select 
                      value={outcome} 
                      onChange={e => setOutcome(e.target.value)} 
                      className="bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none focus:border-cyan-500 cursor-pointer max-w-[120px]"
                    >
                      {contactReached ? (
                        <>
                          <option value="check_in">Check-in</option>
                          <option value="pitch">Pitch</option>
                          <option value="order_placed">Order Placed</option>
                          <option value="follow_up">Follow Up</option>
                          <option value="other">Other</option>
                        </>
                      ) : (
                        <>
                          <option value="left_voicemail">Voicemail</option>
                          <option value="no_answer">No Answer</option>
                          <option value="other">Other</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-bold text-neutral-400">Follow-up:</span>
                    <input 
                      type="date" 
                      value={followUpDate} 
                      min={new Date().toISOString().split('T')[0]} 
                      onChange={e => setFollowUpDate(e.target.value)} 
                      className="bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none focus:border-cyan-500 w-24" 
                    />
                  </div>

                  <div className="flex-1 min-w-[150px] flex items-center gap-1">
                    <span className="text-[10px] font-bold text-neutral-400">Notes:</span>
                    <input 
                      type="text" 
                      placeholder="Pricing feedback, next steps..." 
                      value={notes} 
                      onChange={e => setNotes(e.target.value)} 
                      className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-2.5 py-0.5 text-[10px] text-white focus:outline-none focus:border-cyan-500" 
                    />
                  </div>

                  <div className="flex gap-1.5 shrink-0 ml-auto items-center">
                    <button 
                      type="button" 
                      onClick={handleLogCall} 
                      className="flex items-center gap-0.5 px-3.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-black font-extrabold text-[9px] rounded shadow-sm shadow-cyan-950/20 transition-all cursor-pointer uppercase tracking-wider"
                    >
                      <span>Log Call</span>
                    </button>
                  </div>
                </div>
              </div>

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

                <div className="space-y-3">
                  {(() => {
                    const timeOfDay = new Date().getHours() < 12 ? "morning" : "afternoon"
                    const overdueInvoices = (account?.invoices || []).filter((i: any) => i.status === "Overdue" || i.status?.toLowerCase() === "overdue")
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
                          <div className="bg-neutral-950/60 border border-neutral-800 p-4 rounded-xl text-sm text-neutral-300 leading-relaxed whitespace-pre-line select-text">
                            {`Hey, ${contactName} this is ${repName} over at Titan Diamond USA. I'm giving you a call today because we have an early release on our brand new 2026 line-up of blades that we featured at the The World of Concrete and ConExpo shows in Las Vegas this year and what's great is with this new release, our manufacturer wants us to give away free blades to our new customers to build new relationships... I just have a quick couple questions to see which blade will work best for you and what you're cutting...`}
                          </div>
                          <FactFindingPanel
                            values={factFinding}
                            onChange={setFactFinding}
                            mode="dialer-cold"
                            questionCount={7}
                            accentColor="cyan"
                            updatedAt={account?.factFindingUpdatedAt || account?.bladeSizesUpdatedAt || undefined}
                            updatedBy={account?.factFindingUpdatedBy || account?.bladeSizesUpdatedBy || undefined}
                          />
                        </>
                      )
                    }

                    return (
                      <>
                        <div className="bg-neutral-950/60 border border-neutral-800 p-4 rounded-xl text-sm text-neutral-300 leading-relaxed whitespace-pre-line select-text">
                          {generateScript()}
                        </div>
                        <FactFindingPanel
                          values={factFinding}
                          onChange={setFactFinding}
                          mode="dialer-followup"
                          questionCount={7}
                          accentColor="amber"
                          updatedAt={account?.factFindingUpdatedAt || account?.bladeSizesUpdatedAt || undefined}
                          updatedBy={account?.factFindingUpdatedBy || account?.bladeSizesUpdatedBy || undefined}
                        />
                      </>
                    )
                  })()}
                </div>
              </div>

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

              {/* ORDER BUILDER */}
              <div className="mx-5 mt-4 bg-violet-950/20 border border-violet-900/50 p-5 rounded-2xl">
                <OrderBuilder
                  orderLines={orderLines}
                  setOrderLines={setOrderLines}
                  catalogProducts={catalogProducts}
                  vigRate={defaultVigRate}
                  commissionPct={commissionPct}
                  accountName={account?.name}
                  accountDetail={accountDetail}
                  accent="cyan"
                />
              </div>

            </>
          )}

        </div>

        {/* === RIGHT PANEL: ACCOUNT INTEL === */}
        <div className="w-[340px] bg-[#080b12] border-l border-neutral-800/50 overflow-y-auto scrollbar-thin p-4 space-y-4 shrink-0">
          {isLoadingIntel && (
            <div className="flex items-center justify-center py-10 text-neutral-500">
              <FiLoader className="animate-spin mr-2" size={18} />
              <span className="text-xs font-bold">Loading account intel...</span>
            </div>
          )}

          <div className="bg-neutral-950/40 border border-neutral-800/60 rounded-xl p-3 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5"><FiUser size={11} /> Profile</span>
            {(() => {
              const addr = accountDetail || account
              return (
                <div className="space-y-1.5">
                  {(addr?.billingStreet || addr?.billingCity) && (
                    <div>
                      <span className="text-[9px] font-bold text-neutral-600 uppercase">Billing</span>
                      <p className="text-xs text-neutral-300">{addr.billingStreet && `${addr.billingStreet}, `}{addr.billingCity && `${addr.billingCity}, `}{addr.billingState} {addr.billingZip}</p>
                    </div>
                  )}
                  {(addr?.shippingStreet || addr?.shippingCity) && (
                    <div>
                      <span className="text-[9px] font-bold text-neutral-600 uppercase">Shipping</span>
                      <p className="text-xs text-neutral-300">{addr.shippingStreet && `${addr.shippingStreet}, `}{addr.shippingCity && `${addr.shippingCity}, `}{addr.shippingState} {addr.shippingZip}</p>
                    </div>
                  )}
                  {account?.industry && <div className="flex items-center gap-1.5"><span className="text-[9px] font-bold text-neutral-600">Industry:</span><span className="text-xs text-neutral-300">{account.industry}</span></div>}
                  {account?.tags && <div className="flex items-center gap-1.5"><FiTag size={10} className="text-neutral-600" /><span className="text-xs text-neutral-300">{account.tags}</span></div>}
                  {account?.owner?.name && <div className="flex items-center gap-1.5"><span className="text-[9px] font-bold text-neutral-600">Owner:</span><span className="text-xs text-neutral-300">{account.owner.name}</span></div>}
                </div>
              )
            })()}
          </div>

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
          
          {account?.deals && account.deals.length > 0 && (
            <div className="bg-neutral-950/40 border border-neutral-800/60 rounded-xl p-3 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5"><FiDollarSign size={11} /> Deals ({account.deals.length})</span>
              <div className="space-y-1.5">
                {account.deals.slice(0, 10).map((deal: any, i: number) => (
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

          <div className="bg-neutral-950/40 border border-neutral-800/60 rounded-xl p-3 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5"><FiFileText size={11} /> Invoices ({(account?.invoices || []).length})</span>
            {!account?.invoices || account.invoices.length === 0 ? (
              <p className="text-xs text-neutral-500 text-center py-2">No invoices</p>
            ) : (
              <div className="space-y-1">
                {(account.invoices || []).slice(0, 20).map((inv: any, i: number) => {
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

