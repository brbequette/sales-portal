"use client"

import { formatPhoneNumber } from "@/lib/formatters"


import { useState, useEffect, useRef, useMemo } from "react"
import { 
  FiX, FiPhoneCall, FiUser, FiClock, FiCheckSquare, 
  FiArrowRight, FiBookOpen, FiActivity, FiTag, FiAlertCircle,
  FiChevronDown, FiChevronRight, FiMapPin, FiShoppingCart, FiZap,
  FiPackage, FiFileText, FiDollarSign, FiLoader, FiMail, FiCreditCard, FiTrendingUp,
  FiSearch, FiPlus
} from "react-icons/fi"
import Link from "next/link"
import { useZoho } from "@/components/ZohoProvider"
import { FactFindingPanel, FactFindingSummary, EMPTY_FACT_FINDING, type FactFindingValues } from "@/components/FactFindingPanel"

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
  
  // Fact-Finding — single unified object (replaces 11 individual ff* states)
  const [factFinding, setFactFinding] = useState<FactFindingValues>(EMPTY_FACT_FINDING)
  const [callType, setCallType] = useState<"cold" | "update">("cold")

  // AI States
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiType, setAiType] = useState<"text" | "image">("text")
  const [aiChannel, setAiChannel] = useState("SMS")
  const [aiResult, setAiResult] = useState<string | null>(null)
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [showAiMagic, setShowAiMagic] = useState(false)

  // Order Builder States
  type OrderLine = { id: string; name: string; sku: string; paidQty: number; freeQty: number; unitPrice: number; cost: number }
  const [orderLines, setOrderLines] = useState<OrderLine[]>([])
  const [catalogProducts, setCatalogProducts] = useState<any[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [showMockOrder, setShowMockOrder] = useState(false)
  const productSearchRef = useRef<HTMLDivElement>(null)
  const DEFAULT_VIG_RATE = 1.3
  const COMMISSION_PCT = 50

  // Top 10 selling blades from catalog (by Zoho Books name)
  const topBladeProducts = useMemo(() => {
    if (catalogProducts.length === 0) return []
    return catalogProducts
      .filter(p => {
        const cat = (p.category || '').toLowerCase()
        const status = (() => { try { return JSON.parse(p.description || '{}').status } catch { return 'active' } })()
        return cat.includes('blade') && status !== 'inactive'
      })
      .map(p => {
        const desc = (() => { try { return JSON.parse(p.description || '{}') } catch { return {} } })()
        return { name: p.name, sku: p.sku, price: p.price || 0, cost: desc.cost || 0 }
      })
      .slice(0, 10)
  }, [catalogProducts])

  // Financial calculations derived from order lines
  const orderFinancials = (() => {
    if (orderLines.length === 0) return null
    const subTotal = orderLines.reduce((s, l) => s + (l.paidQty * l.unitPrice), 0)
    // Dead cost = cost × total qty (paid + free)
    const deadCostTotal = orderLines.reduce((s, l) => s + (l.cost * (l.paidQty + l.freeQty)), 0)
    // Paid items are subject to VIG, free items are NOT subject to VIG (gift bucket)
    const deadCostSubjectToVig = orderLines.reduce((s, l) => s + (l.cost * l.paidQty), 0)
    const deadCostNoVig = orderLines.reduce((s, l) => s + (l.cost * l.freeQty), 0)
    const deadCostPlusVig = (deadCostSubjectToVig * DEFAULT_VIG_RATE) + deadCostNoVig
    const deadProfit = subTotal - deadCostTotal
    const profitAfterVig = subTotal - deadCostPlusVig
    const salesCommission = profitAfterVig > 0 ? profitAfterVig * (COMMISSION_PCT / 100) : 0
    const marginPct = subTotal > 0 ? (profitAfterVig / subTotal) * 100 : 0
    return { subTotal, deadCostTotal, deadCostSubjectToVig, deadCostNoVig, deadCostPlusVig, deadProfit, profitAfterVig, salesCommission, marginPct }
  })()

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

  // Fetch catalog products once
  useEffect(() => {
    fetch('/api/get-products').then(r => r.json()).then(d => {
      if (d.success) setCatalogProducts(d.products || [])
    }).catch(() => {})
  }, [])

  // Click outside to close product dropdown
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (productSearchRef.current && !productSearchRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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
    setFactFinding({
      bladeSizes: activeAccount.bladeSizes || '',
      materialsCut: activeAccount.materialsCut || '',
      currentSupplier: activeAccount.currentSupplier || '',
      avgBladeCost: activeAccount.averageBladeCost || activeAccount.avgBladeCost || '',
      crewCount: activeAccount.crewCount || '',
      bladesPerOrder: activeAccount.bladesPerOrder || '',
      improvementPriority: activeAccount.improvementPriority || '',
      readyToBuy: activeAccount.readyToBuy || '',
      jobTypes: activeAccount.jobTypes || '',
      painPoints: activeAccount.painPoints || '',
      productInterest: activeAccount.productInterest || [],
    })
    setOrderLines([])

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
            paidQty: l.paidQty,
            freeQty: l.freeQty,
            unitPrice: l.unitPrice,
            lineTotal: l.paidQty * l.unitPrice
          })) : undefined
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
        <div className="w-80 bg-[#080b12] border-r border-neutral-800/50 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-neutral-800/40">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Queue ({accounts.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
            {accounts.map((acc: any, i: number) => {
              const isActive = i === currentIndex
              const isDone = i < currentIndex
              const hasOverdue = (acc.invoices || []).some((inv: any) => inv.status?.toLowerCase() === 'overdue')
              const primaryContact = acc.contacts?.find((c: any) => c.isPrimary) || acc.contacts?.[0]
              const contactName = primaryContact ? `${primaryContact.firstName || ""} ${primaryContact.lastName || ""}`.trim() : ""
              const displayPhone = primaryContact?.phone || primaryContact?.mobilePhone || ""
              const hasPhone = !!displayPhone

              const ltv = acc.totalSales || 0
              const overdueBalance = acc.overdueBalance || 0
              const location = [acc.billingCity, acc.billingState].filter(Boolean).join(", ")
              const tz = acc.timeZone || ""

              return (
                <button
                  key={acc.id}
                  onClick={() => setCurrentIndex(i)}
                  className={`w-full text-left px-3 py-3 rounded-xl text-xs transition-all cursor-pointer border flex flex-col gap-1.5 ${
                    isActive
                      ? 'bg-cyan-500/10 border-cyan-500/30 shadow-lg shadow-cyan-500/5'
                      : isDone
                      ? 'bg-neutral-900/30 border-transparent opacity-50'
                      : 'bg-neutral-950/40 border-neutral-800/40 hover:bg-neutral-900/60 hover:border-neutral-700/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isDone ? 'bg-neutral-600' : hasOverdue ? 'bg-red-500' : 'bg-emerald-500'}`} />
                      <span className={`font-black text-[12px] leading-snug break-words ${isActive ? 'text-cyan-300' : isDone ? 'text-neutral-500' : 'text-neutral-200'}`}>
                        {acc.name}
                      </span>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      {isDone ? (
                        <span className="text-[8px] font-black uppercase text-neutral-600 bg-neutral-950 px-1 py-0.5 rounded border border-neutral-800">✓ Done</span>
                      ) : (
                        acc.quality && acc.quality !== 'NEVER_STATUSED' && (
                          <span className={`text-[8px] font-black uppercase px-1 py-0.5 rounded border ${
                            acc.quality === 'HOT' 
                              ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                              : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          }`}>
                            {acc.quality}
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  {/* Primary Contact Name & Phone */}
                  {contactName && (
                    <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 font-bold ml-[18px]">
                      <FiUser size={10} className="text-neutral-500 shrink-0" />
                      <span className="truncate">{contactName}</span>
                      {hasPhone && <span className="text-neutral-600">·</span>}
                      {hasPhone && <span className="text-neutral-500 font-normal truncate">{displayPhone}</span>}
                    </div>
                  )}

                  {/* Financial Stats (LTV, Overdue Balance) */}
                  {(ltv > 0 || overdueBalance > 0) && (
                    <div className="flex items-center gap-2 ml-[18px] text-[9px] font-semibold">
                      {ltv > 0 && (
                        <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/15 font-black">
                          LTV: ${ltv >= 1000000 ? `${(ltv / 1000000).toFixed(1)}M` : ltv >= 1000 ? `${(ltv / 1000).toFixed(1)}k` : ltv.toFixed(0)}
                        </span>
                      )}
                      {overdueBalance > 0 && (
                        <span className="text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/15 font-black">
                          Overdue: ${overdueBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Location / Timezone */}
                  {(location || tz) && (
                    <div className="flex items-center justify-between ml-[18px] text-[9px] text-neutral-500 font-bold">
                      <span className="truncate max-w-[170px]">{location || "No Location"}</span>
                      {tz && (
                        <span className="text-[8px] font-black text-cyan-400 bg-cyan-500/10 px-1.5 py-0.2 rounded border border-cyan-500/15 uppercase">
                          {tz}
                        </span>
                      )}
                    </div>
                  )}
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

            {/* Row 4: Fact-Finding Summary (appears as answers come in) */}
            {Object.values(factFinding).some(v => Array.isArray(v) ? v.length > 0 : !!v) && (
              <div className="px-5 mt-1.5">
                <FactFindingSummary values={factFinding} />
              </div>
            )}

            {/* Row 5: Call Outcome Logging Bar */}
            <div className="px-5 mt-2.5 pt-2.5 border-t border-neutral-800/60 flex items-center gap-3 flex-wrap">
              {/* Reached Toggle */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-bold text-neutral-400">Reached:</span>
                <div className="flex bg-neutral-950 p-0.5 rounded border border-neutral-800">
                  <button type="button" onClick={() => { setContactReached(true); setOutcome("check_in"); }} className={`px-2 py-0.5 rounded-[3px] text-[10px] font-bold transition-all cursor-pointer ${contactReached ? 'bg-cyan-500 text-black' : 'text-neutral-500 hover:text-neutral-300'}`}>Yes</button>
                  <button type="button" onClick={() => { setContactReached(false); setOutcome("left_voicemail"); }} className={`px-2 py-0.5 rounded-[3px] text-[10px] font-bold transition-all cursor-pointer ${!contactReached ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>No</button>
                </div>
              </div>

              {/* Spoke With */}
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

              {/* Outcome Dropdown */}
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

              {/* Follow-up Date */}
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

              {/* Notes Input */}
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

              {/* Actions buttons inline */}
              <div className="flex gap-1.5 shrink-0 ml-auto items-center">
                <button 
                  type="button" 
                  onClick={handleNext} 
                  className="px-2.5 py-1 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 font-bold text-[9px] rounded transition-all cursor-pointer uppercase tracking-wider"
                >
                  Skip
                </button>
                <button 
                  type="button" 
                  onClick={handleLogAndNext} 
                  className="flex items-center gap-0.5 px-3.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-black font-extrabold text-[9px] rounded shadow-sm shadow-cyan-950/20 transition-all cursor-pointer uppercase tracking-wider"
                >
                  <span>Log & Next</span>
                  <FiArrowRight size={10} />
                </button>
              </div>
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
                      {/* Fact-Finding Questions — shared FactFindingPanel component */}
                      <FactFindingPanel
                        values={factFinding}
                        onChange={setFactFinding}
                        mode="dialer-cold"
                        questionCount={7}
                        accentColor="cyan"
                      />
                    </>
                  )
                }

                // Follow-up script - show generated text + inline fact-finding for any missing fields
                return (
                  <>
                    <div className="bg-neutral-950/60 border border-neutral-800 p-4 rounded-xl text-sm text-neutral-300 leading-relaxed whitespace-pre-line select-text">
                      {generateScript()}
                    </div>

                    {/* Fact-finding for follow-ups — shared FactFindingPanel component */}
                    <FactFindingPanel
                      values={factFinding}
                      onChange={setFactFinding}
                      mode="dialer-followup"
                      questionCount={7}
                      accentColor="amber"
                    />
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

          {/* ORDER BUILDER */}
          <div className="mx-5 mt-4 bg-violet-950/20 border border-violet-900/50 p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400 flex items-center gap-1.5">
                <FiShoppingCart /> Build Order
              </span>
              {orderLines.length > 0 && (
                <span className="text-[10px] font-black text-violet-300">
                  {orderLines.length} item{orderLines.length !== 1 ? 's' : ''} · ${orderLines.reduce((s, l) => s + (l.paidQty * l.unitPrice), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>

            {/* Product Search */}
            <div ref={productSearchRef} className="relative">
              <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 focus-within:border-violet-500 transition-colors">
                <FiSearch size={12} className="text-neutral-500 shrink-0" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true) }}
                  onFocus={() => setShowProductDropdown(true)}
                  placeholder="Search products to add..."
                  className="flex-1 bg-transparent text-xs text-white placeholder-neutral-600 outline-none"
                />
                {productSearch && (
                  <button type="button" onClick={() => { setProductSearch(''); setShowProductDropdown(false) }} className="text-neutral-500 hover:text-white cursor-pointer">
                    <FiX size={12} />
                  </button>
                )}
              </div>
              {showProductDropdown && productSearch.length >= 2 && (() => {
                const term = productSearch.toLowerCase()
                const filtered = catalogProducts
                  .filter(p => {
                    const desc = (() => { try { return JSON.parse(p.description || '{}') } catch { return {} } })()
                    return (desc.status !== 'inactive') && (
                      p.name?.toLowerCase().includes(term) ||
                      p.sku?.toLowerCase().includes(term) ||
                      p.category?.toLowerCase().includes(term)
                    )
                  })
                  .slice(0, 8)
                if (filtered.length === 0) return null
                return (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {filtered.map(p => {
                      const already = orderLines.some(l => l.sku === p.sku)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={already}
                          onClick={() => {
                            const desc = (() => { try { return JSON.parse(p.description || '{}') } catch { return {} } })()
                            setOrderLines(prev => [...prev, {
                              id: Date.now().toString() + p.sku,
                              name: p.name,
                              sku: p.sku,
                              paidQty: 1,
                              freeQty: 0,
                              unitPrice: p.price || 0,
                              cost: desc.cost || 0
                            }])
                            setProductSearch('')
                            setShowProductDropdown(false)
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-neutral-800 transition-colors border-b border-neutral-800/50 last:border-0 ${already ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <FiPlus size={12} className={already ? 'text-neutral-600' : 'text-violet-400'} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-white truncate">{p.name}</p>
                            <p className="text-[9px] text-neutral-500">{p.sku} · {p.category}</p>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-amber-400 shrink-0">${(p.price || 0).toFixed(2)}</span>
                          {already && <span className="text-[8px] text-violet-400 font-bold">ADDED</span>}
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            {/* Quick-add top blades */}
            {topBladeProducts.length > 0 && (
            <div>
              <p className="text-[9px] text-neutral-600 uppercase tracking-wider font-bold mb-1.5">Quick Add — Top Blades</p>
              <div className="flex flex-wrap gap-1.5">
                {topBladeProducts.map(bp => {
                  const already = orderLines.some(l => l.sku === bp.sku)
                  return (
                    <button
                      key={bp.sku}
                      type="button"
                      disabled={already}
                      onClick={() => setOrderLines(prev => [...prev, {
                        id: Date.now().toString() + bp.sku,
                        name: bp.name,
                        sku: bp.sku,
                        paidQty: 1,
                        freeQty: 0,
                        unitPrice: bp.price,
                        cost: bp.cost
                      }])}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                        already
                          ? 'bg-violet-500/10 border-violet-500/30 text-violet-400 opacity-50 cursor-not-allowed'
                          : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-violet-500/50 hover:text-violet-300'
                      }`}
                    >
                      {already ? '✓ ' : '⚡ '}{bp.name}
                    </button>
                  )
                })}
              </div>
            </div>
            )}

            {/* Line Items */}
            {orderLines.length > 0 && (
              <div className="space-y-2">
                {/* Header */}
                <div className="grid grid-cols-[1fr_60px_60px_70px_70px_28px] gap-1.5 px-2 text-[8px] font-bold text-neutral-600 uppercase tracking-wider">
                  <span>Item</span>
                  <span className="text-center">Paid</span>
                  <span className="text-center">Free</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">Line $</span>
                  <span></span>
                </div>

                {orderLines.map((line) => {
                  const lineTotal = line.paidQty * line.unitPrice
                  return (
                    <div key={line.id} className="grid grid-cols-[1fr_60px_60px_70px_70px_28px] gap-1.5 items-center bg-neutral-900/50 border border-neutral-800/50 rounded-lg px-2 py-1.5">
                      <div className="min-w-0">
                        <span className="text-[11px] font-bold text-white truncate block">{line.name}</span>
                        {line.sku && <span className="text-[8px] text-neutral-600 block">{line.sku}</span>}
                      </div>
                      
                      {/* Paid Qty */}
                      <div className="flex items-center justify-center gap-0.5">
                        <button type="button" onClick={() => setOrderLines(prev => prev.map(l => l.id === line.id ? { ...l, paidQty: Math.max(0, l.paidQty - 1) } : l))} className="w-5 h-5 rounded bg-neutral-800 text-neutral-400 text-[10px] font-bold flex items-center justify-center hover:bg-neutral-700 cursor-pointer">-</button>
                        <span className="text-[11px] font-black text-white w-5 text-center">{line.paidQty}</span>
                        <button type="button" onClick={() => setOrderLines(prev => prev.map(l => l.id === line.id ? { ...l, paidQty: l.paidQty + 1 } : l))} className="w-5 h-5 rounded bg-neutral-800 text-neutral-400 text-[10px] font-bold flex items-center justify-center hover:bg-neutral-700 cursor-pointer">+</button>
                      </div>

                      {/* Free Qty */}
                      <div className="flex items-center justify-center gap-0.5">
                        <button type="button" onClick={() => setOrderLines(prev => prev.map(l => l.id === line.id ? { ...l, freeQty: Math.max(0, l.freeQty - 1) } : l))} className="w-5 h-5 rounded bg-emerald-900/30 text-emerald-400 text-[10px] font-bold flex items-center justify-center hover:bg-emerald-900/50 cursor-pointer">-</button>
                        <span className="text-[11px] font-black text-emerald-400 w-5 text-center">{line.freeQty}</span>
                        <button type="button" onClick={() => setOrderLines(prev => prev.map(l => l.id === line.id ? { ...l, freeQty: l.freeQty + 1 } : l))} className="w-5 h-5 rounded bg-emerald-900/30 text-emerald-400 text-[10px] font-bold flex items-center justify-center hover:bg-emerald-900/50 cursor-pointer">+</button>
                      </div>

                      {/* Unit Price */}
                      <div className="text-right">
                        <input
                          type="number"
                          value={line.unitPrice}
                          onChange={(e) => setOrderLines(prev => prev.map(l => l.id === line.id ? { ...l, unitPrice: parseFloat(e.target.value) || 0 } : l))}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold text-white text-right focus:border-violet-500 outline-none"
                          step="0.01"
                        />
                      </div>

                      {/* Line Total */}
                      <span className="text-[11px] font-black text-amber-400 text-right">${lineTotal.toFixed(2)}</span>

                      {/* Remove */}
                      <button type="button" onClick={() => setOrderLines(prev => prev.filter(l => l.id !== line.id))} className="w-5 h-5 rounded bg-red-900/20 text-red-400 text-[10px] font-bold flex items-center justify-center hover:bg-red-900/40 cursor-pointer ml-auto">×</button>
                    </div>
                  )
                })}

                {/* Order Summary */}
                <div className="border-t border-violet-500/20 pt-2 mt-2 space-y-1">
                  <div className="flex justify-between px-2">
                    <span className="text-[10px] text-neutral-400">Paid Items</span>
                    <span className="text-[11px] font-bold text-white">{orderLines.reduce((s, l) => s + l.paidQty, 0)} items</span>
                  </div>
                  <div className="flex justify-between px-2">
                    <span className="text-[10px] text-emerald-400">Free Items</span>
                    <span className="text-[11px] font-bold text-emerald-400">{orderLines.reduce((s, l) => s + l.freeQty, 0)} items</span>
                  </div>
                  <div className="flex justify-between px-2 pt-1 border-t border-neutral-800">
                    <span className="text-xs font-bold text-violet-300">Order Total</span>
                    <span className="text-sm font-black text-amber-400">${orderLines.reduce((s, l) => s + (l.paidQty * l.unitPrice), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Financial Estimates */}
                {orderFinancials && (
                  <div className="border-t border-amber-500/20 pt-2 mt-1 space-y-1">
                    <p className="text-[8px] font-bold uppercase tracking-wider text-amber-500/60 px-2 mb-1">💰 Profit Estimates</p>
                    <div className="flex justify-between px-2">
                      <span className="text-[10px] text-neutral-500">Dead Cost</span>
                      <span className="text-[10px] font-bold text-red-400">-${orderFinancials.deadCostTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between px-2">
                      <span className="text-[10px] text-neutral-500">Dead Profit <span className="text-[8px] text-neutral-600">(Rev − Cost)</span></span>
                      <span className={`text-[10px] font-bold ${orderFinancials.deadProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${orderFinancials.deadProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between px-2">
                      <span className="text-[10px] text-neutral-500">VIG Adjustment <span className="text-[8px] text-neutral-600">({DEFAULT_VIG_RATE}×)</span></span>
                      <span className="text-[10px] font-bold text-red-400">-${orderFinancials.deadCostPlusVig.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between px-2 pt-1 border-t border-neutral-800">
                      <span className="text-[10px] font-bold text-amber-300">Profit after VIG</span>
                      <span className={`text-[11px] font-black ${orderFinancials.profitAfterVig >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${orderFinancials.profitAfterVig.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between px-2">
                      <span className="text-[10px] text-neutral-500">Sales Commission <span className="text-[8px] text-neutral-600">({COMMISSION_PCT}%)</span></span>
                      <span className="text-[11px] font-black text-green-400">${orderFinancials.salesCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between px-2">
                      <span className="text-[9px] text-neutral-600">Margin</span>
                      <span className={`text-[9px] font-bold ${orderFinancials.marginPct >= 30 ? 'text-emerald-500' : orderFinancials.marginPct >= 15 ? 'text-amber-500' : 'text-red-500'}`}>{orderFinancials.marginPct.toFixed(1)}%</span>
                    </div>
                  </div>
                )}

                {/* Submit Order Button */}
                <button
                  type="button"
                  onClick={() => setShowMockOrder(true)}
                  className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-black uppercase tracking-wider hover:from-violet-500 hover:to-purple-500 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <FiFileText size={14} /> Preview Sales Order
                </button>
              </div>
            )}

            {orderLines.length === 0 && (
              <p className="text-[10px] text-neutral-600 italic text-center py-2">Search for a product or tap a promo blade to start building the order</p>
            )}
          </div>

          {/* MOCK SALES ORDER PREVIEW */}
          {showMockOrder && orderLines.length > 0 && (
            <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4" onClick={() => setShowMockOrder(false)}>
              <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                  <div>
                    <h3 className="text-white font-black text-base">Sales Order Preview</h3>
                    <p className="text-[10px] text-neutral-500 mt-0.5">
                      {activeAccount.name} · {new Date().toLocaleDateString()}
                    </p>
                  </div>
                  <button type="button" onClick={() => setShowMockOrder(false)} className="text-neutral-500 hover:text-white cursor-pointer">
                    <FiX size={18} />
                  </button>
                </div>

                <div className="px-6 py-4 space-y-5">
                  {/* Customer Info */}
                  <div className="grid grid-cols-2 gap-3 text-[10px]">
                    <div>
                      <p className="text-neutral-500 uppercase tracking-wider font-bold mb-0.5">Bill To</p>
                      <p className="text-white font-bold">{activeAccount.name}</p>
                      {(accountDetail?.billingStreet || activeAccount.billingStreet) && (
                        <p className="text-neutral-400">{accountDetail?.billingStreet || activeAccount.billingStreet}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-neutral-500 uppercase tracking-wider font-bold mb-0.5">Ship To</p>
                      <p className="text-white font-bold">{activeAccount.name}</p>
                      {(accountDetail?.shippingStreet || activeAccount.shippingStreet) && (
                        <p className="text-neutral-400">{accountDetail?.shippingStreet || activeAccount.shippingStreet}</p>
                      )}
                    </div>
                  </div>

                  {/* Paid Line Items */}
                  {orderLines.some(l => l.paidQty > 0) && (
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 mb-2 flex items-center gap-1.5">
                        <FiDollarSign size={10} /> Paid Items
                      </p>
                      <div className="border border-neutral-800 rounded-lg overflow-hidden">
                        <div className="grid grid-cols-[1fr_50px_70px_80px] gap-2 px-3 py-1.5 bg-neutral-800/50 text-[8px] font-bold text-neutral-500 uppercase tracking-wider">
                          <span>Item</span>
                          <span className="text-center">Qty</span>
                          <span className="text-right">Unit Price</span>
                          <span className="text-right">Amount</span>
                        </div>
                        {orderLines.filter(l => l.paidQty > 0).map((line, i) => (
                          <div key={`paid-${line.id}`} className={`grid grid-cols-[1fr_50px_70px_80px] gap-2 px-3 py-2 ${i % 2 === 0 ? 'bg-neutral-900/50' : ''}`}>
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold text-white truncate">{line.name}</p>
                              {line.sku && <p className="text-[8px] text-neutral-600">{line.sku}</p>}
                            </div>
                            <span className="text-[11px] font-black text-white text-center">{line.paidQty}</span>
                            <span className="text-[10px] font-mono text-neutral-400 text-right">${line.unitPrice.toFixed(2)}</span>
                            <span className="text-[11px] font-black text-white text-right">${(line.paidQty * line.unitPrice).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Free / Gift Line Items */}
                  {orderLines.some(l => l.freeQty > 0) && (
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-500 mb-2 flex items-center gap-1.5">
                        <FiTag size={10} /> Free / Gift Items
                      </p>
                      <div className="border border-emerald-900/50 rounded-lg overflow-hidden">
                        <div className="grid grid-cols-[1fr_50px_70px_80px] gap-2 px-3 py-1.5 bg-emerald-950/30 text-[8px] font-bold text-emerald-600 uppercase tracking-wider">
                          <span>Item</span>
                          <span className="text-center">Qty</span>
                          <span className="text-right">Unit Price</span>
                          <span className="text-right">Amount</span>
                        </div>
                        {orderLines.filter(l => l.freeQty > 0).map((line, i) => (
                          <div key={`free-${line.id}`} className={`grid grid-cols-[1fr_50px_70px_80px] gap-2 px-3 py-2 ${i % 2 === 0 ? 'bg-emerald-950/10' : ''}`}>
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold text-emerald-300 truncate">{line.name}</p>
                              {line.sku && <p className="text-[8px] text-emerald-700">{line.sku}</p>}
                              <p className="text-[8px] text-emerald-500 font-bold">PROMOTIONAL — FREE</p>
                            </div>
                            <span className="text-[11px] font-black text-emerald-400 text-center">{line.freeQty}</span>
                            <span className="text-[10px] font-mono text-emerald-600 text-right">$0.00</span>
                            <span className="text-[11px] font-black text-emerald-400 text-right">$0.00</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Order Totals */}
                  <div className="border-t border-neutral-800 pt-3 space-y-1.5">
                    <div className="flex justify-between px-1">
                      <span className="text-[10px] text-neutral-500">Subtotal (Paid)</span>
                      <span className="text-xs font-bold text-white">${orderLines.reduce((s, l) => s + (l.paidQty * l.unitPrice), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between px-1">
                      <span className="text-[10px] text-emerald-500">Free Items Value</span>
                      <span className="text-xs font-bold text-emerald-400">$0.00</span>
                    </div>
                    <div className="flex justify-between px-1">
                      <span className="text-[10px] text-neutral-500">Total Items Shipping</span>
                      <span className="text-xs font-bold text-white">{orderLines.reduce((s, l) => s + l.paidQty + l.freeQty, 0)} items</span>
                    </div>
                    <div className="flex justify-between px-1 pt-2 border-t border-neutral-800">
                      <span className="text-sm font-black text-white">ORDER TOTAL</span>
                      <span className="text-lg font-black text-amber-400">${orderLines.reduce((s, l) => s + (l.paidQty * l.unitPrice), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  {/* Financial Breakdown */}
                  {orderFinancials && (
                    <div className="border-t border-amber-500/30 pt-3 space-y-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5 mb-1">
                        <FiTrendingUp size={10} /> Profit Breakdown
                      </p>
                      <div className="bg-neutral-800/50 rounded-lg p-3 space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-[10px] text-neutral-500">Dead Cost (All Items)</span>
                          <span className="text-[10px] font-bold text-red-400">-${orderFinancials.deadCostTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[10px] text-neutral-500">Dead Profit</span>
                          <span className={`text-[10px] font-bold ${orderFinancials.deadProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${orderFinancials.deadProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[10px] text-neutral-500">
                            Cost + VIG <span className="text-[8px] text-neutral-600">({DEFAULT_VIG_RATE}× paid, 1× free)</span>
                          </span>
                          <span className="text-[10px] font-bold text-red-400">-${orderFinancials.deadCostPlusVig.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between pt-1.5 border-t border-neutral-700">
                          <span className="text-xs font-bold text-amber-300">Profit after VIG</span>
                          <span className={`text-sm font-black ${orderFinancials.profitAfterVig >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            ${orderFinancials.profitAfterVig.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            <span className={`text-[9px] ml-1 ${orderFinancials.marginPct >= 30 ? 'text-emerald-500' : orderFinancials.marginPct >= 15 ? 'text-amber-500' : 'text-red-500'}`}>({orderFinancials.marginPct.toFixed(1)}%)</span>
                          </span>
                        </div>
                        <div className="flex justify-between pt-1.5 border-t border-neutral-700">
                          <span className="text-xs font-bold text-green-300">Sales Commission ({COMMISSION_PCT}%)</span>
                          <span className="text-sm font-black text-green-400">${orderFinancials.salesCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sales Rep */}
                  <div className="text-[9px] text-neutral-600 border-t border-neutral-800 pt-3">
                    <p>Sales Rep: <span className="text-neutral-400 font-bold">{repName}</span></p>
                    <p>Created: <span className="text-neutral-400">{new Date().toLocaleString()}</span></p>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="sticky bottom-0 bg-neutral-900 border-t border-neutral-800 px-6 py-3 flex gap-2 rounded-b-2xl">
                  <button type="button" onClick={() => setShowMockOrder(false)} className="flex-1 py-2 rounded-lg bg-neutral-800 text-neutral-400 text-xs font-bold hover:bg-neutral-700 transition-colors cursor-pointer">
                    Edit Order
                  </button>
                  <button type="button" onClick={() => { setShowMockOrder(false) }} className="flex-1 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-black hover:from-violet-500 hover:to-purple-500 transition-all cursor-pointer">
                    Confirm Order
                  </button>
                </div>
              </div>
            </div>
          )}

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

