"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { EMPTY_FACT_FINDING, type FactFindingValues } from "@/components/FactFindingPanel"
import { type OrderLine } from "@/components/OrderBuilder"
import { toast } from 'react-hot-toast'
import { makeZohoVoiceCall } from '@/lib/zoho-voice-websdk'

interface UseSalesCampaignDataProps {
  accounts: any[]
  onClose: () => void
  onRefresh: () => void
}

export function useSalesCampaignData({ accounts, onClose, onRefresh }: UseSalesCampaignDataProps) {
  const { zohoContext: currentUser } = useZoho()
  const repName = currentUser?.name || "your sales rep"

  const [currentIndex, setCurrentIndex] = useState(0)
  const [outcome, setOutcome] = useState("check_in")
  const [spokeTo, setSpokeTo] = useState("")
  const [notes, setNotes] = useState("")
  const [followUpDate, setFollowUpDate] = useState("")
  const [contactReached, setContactReached] = useState(true)
  
  const [factFinding, setFactFinding] = useState<FactFindingValues>(EMPTY_FACT_FINDING)
  const [callType, setCallType] = useState<"cold" | "update">("cold")

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

  const [isPowerDialerActive, setIsPowerDialerActive] = useState(false)

  const [timerSeconds, setTimerSeconds] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const [accountPurchases, setAccountPurchases] = useState<any[]>([])
  const [accountNotes, setAccountNotes] = useState<any[]>([])
  const [isLoadingIntel, setIsLoadingIntel] = useState(false)
  const [intelTab, setIntelTab] = useState<'purchases' | 'notes' | 'invoices'>('purchases')
  const [accountDetail, setAccountDetail] = useState<any>(null)

  const activeAccount = accounts[currentIndex]
  
  const primaryContact = useMemo(() => activeAccount?.contacts?.find((c: any) => c.isPrimary) || activeAccount?.contacts?.[0], [activeAccount])
  const displayPhone = useMemo(() => primaryContact?.phone || primaryContact?.mobilePhone || '', [primaryContact])
  const cleanPhone = useMemo(() => displayPhone ? displayPhone.replace(/[^0-9+]/g, '') : '', [displayPhone])
  const contactName = useMemo(() => spokeTo || (primaryContact ? `${primaryContact.firstName || ""} ${primaryContact.lastName || ""}`.trim() : "there"), [spokeTo, primaryContact])
  const displayEmail = useMemo(() => primaryContact?.email || accountDetail?.booksContact?.email || activeAccount?.booksContact?.email || '', [primaryContact, accountDetail, activeAccount])

  const initiateCall = useCallback(async (phone: string) => {
    if (!phone) return false
    const dialer = (window as any).ZDialer
    if (dialer?.dial) {
      dialer.dial(phone)
      return true
    }
    try {
      return await makeZohoVoiceCall(phone)
    } catch (error) {
      console.error("Zoho Voice power dial failed", error)
      return false
    }
  }, [])

  useEffect(() => {
    if (isPowerDialerActive && activeAccount) {
      if (cleanPhone) {
        const t = setTimeout(() => {
          void initiateCall(cleanPhone).then(started => {
            if (started) return
            setIsPowerDialerActive(false)
            toast.error("Power Dialer paused: no configured Zoho Voice provider accepted the call")
          })
        }, 1000)
        return () => clearTimeout(t)
      } else {
        setIsPowerDialerActive(false)
        toast.error(`Power Dialer paused: No valid phone number for ${activeAccount.name}`)
      }
    }
  }, [currentIndex, isPowerDialerActive, activeAccount, cleanPhone, initiateCall])

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

  useEffect(() => {
    if (!activeAccount) return

    setSpokeTo(primaryContact ? `${primaryContact.firstName || ""} ${primaryContact.lastName || ""}`.trim() : "")
    setNotes("")
    setFollowUpDate("")
    setOutcome("check_in")
    setContactReached(true)

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

    if (activeAccount.lastCalledAt) {
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
  }, [currentIndex, activeAccount, primaryContact])

  const generateScript = useCallback(() => {
    const timeOfDay = new Date().getHours() < 12 ? "morning" : "afternoon"
    
    const overdueInvoices = (activeAccount?.invoices || []).filter((i: any) => i.status === "Overdue" || i.status?.toLowerCase() === "overdue")
    const overdueTotal = overdueInvoices.reduce((sum: number, i: any) => sum + (parseFloat(i.amount) || 0), 0)

    if (overdueTotal > 0) {
      return `Hi ${contactName}, this is ${repName} with Titan Diamond USA! Hope you're having a great ${timeOfDay}.\n\nI wanted to check in on your account. We noticed there is a pending balance of $${overdueTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} on your oldest overdue statement, and I wanted to see if we could get that taken care of today, or if you needed any invoice copies emailed over to you.\n\nIs there anything else we can quote or ship out for you today?`
    }

    if (callType === "cold") {
      return `Hey, ${contactName} this is ${repName} over at Titan Diamond USA. I'm giving you a call today because we have an early release on our brand new 2026 line-up of blades that we featured at the The World of Concrete and ConExpo shows in Las Vegas this year and what's great is with this new release, our manufacturer wants us to give away free blades to our new customers to build new relationships... I just have a quick couple questions to see which blade will work best for you and what you're cutting...\n\n1) First off... what size blades do you run? 14"?\n2) What are you guys cutting out there?\n3) Where do you pick up your blades now, do you buy them retail or over the phone from a wholesaler like me?\n4) How much are they charging you for a good 14" blade? $250? $300 Bucks?\n5) How many crews do you have?\n6) And how many blades do you normally pick up at a time.. 6.. 12.. 25?\n7) Let me ask you one last question... if you could improve one thing about the blades you are using right now... what would it be... longer life... faster cutting... or cleaner cutting?`
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
  }, [activeAccount, callType, contactName, repName, accountPurchases, factFinding])

  const getBladeRecommendation = useCallback(() => {
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
  }, [factFinding.materialsCut, factFinding.improvementPriority, contactName])

  const handleNext = useCallback(() => {
    if (currentIndex < accounts.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      toast.success("Campaign completed!")
      onRefresh()
      onClose()
    }
  }, [currentIndex, accounts.length, onRefresh, onClose])

  const handleGenerateAi = useCallback(async () => {
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
  }, [aiPrompt, aiType, aiChannel])

  const handleLogAndNext = useCallback(async () => {
    if (!activeAccount) return;
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
            quantity: l.quantity,
            isPromo: l.isPromo,
            unitPrice: l.unitPrice,
            lineTotal: l.quantity * l.unitPrice
          })) : undefined
        })
      })
      const data = await response.json()
      if (data.success) {
        handleNext()
      } else {
        toast.error(data.error || "Failed to log call outcome.")
      }
    } catch (e: any) {
      toast.error("Error logging call: " + e.message)
    }
  }, [activeAccount, outcome, notes, repName, contactReached, spokeTo, followUpDate, timerSeconds, currentUser?.id, factFinding, orderLines, handleNext])

  return {
    currentIndex,
    setCurrentIndex,
    outcome,
    setOutcome,
    spokeTo,
    setSpokeTo,
    notes,
    setNotes,
    followUpDate,
    setFollowUpDate,
    contactReached,
    setContactReached,
    factFinding,
    setFactFinding,
    callType,
    setCallType,
    aiPrompt,
    setAiPrompt,
    aiType,
    setAiType,
    aiChannel,
    setAiChannel,
    aiResult,
    setAiResult,
    isGeneratingAi,
    setIsGeneratingAi,
    showAiMagic,
    setShowAiMagic,
    orderLines,
    setOrderLines,
    catalogProducts,
    setCatalogProducts,
    defaultVigRate,
    setDefaultVigRate,
    commissionPct,
    setCommissionPct,
    isPowerDialerActive,
    setIsPowerDialerActive,
    timerSeconds,
    setTimerSeconds,
    accountPurchases,
    setAccountPurchases,
    accountNotes,
    setAccountNotes,
    isLoadingIntel,
    setIsLoadingIntel,
    intelTab,
    setIntelTab,
    accountDetail,
    setAccountDetail,
    activeAccount,
    repName,
    primaryContact,
    displayPhone,
    cleanPhone,
    contactName,
    displayEmail,
    initiateCall,
    generateScript,
    getBladeRecommendation,
    handleNext,
    handleGenerateAi,
    handleLogAndNext
  }
}
