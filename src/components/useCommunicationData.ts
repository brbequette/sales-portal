"use client"

/**
 * useCommunicationData.ts
 *
 * Custom hook that encapsulates all data-fetching, state management,
 * and business logic for the CommunicationCenter component.
 * Extracted to reduce the main component from 1,067 lines.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { EMPTY_FACT_FINDING, type FactFindingValues } from "@/components/FactFindingPanel"
import { type OrderLine } from "@/components/OrderBuilder"

// ━━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type Message = {
  id: string
  sender: "rep" | "client"
  text: string
  timestamp: string
}

export type ActiveTab = "CALL" | "SMS" | "EMAIL" | "WHATSAPP"
export type CallSubTab = "LOG" | "SCRIPT" | "FACT" | "PRODUCTS" | "INTEL" | "ORDER" | "AI"
export type IntelTab = "purchases" | "notes" | "invoices"

// ━━━ Hook ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function useCommunicationData({
  accountId,
  account,
  contacts,
  selectedContactId,
}: {
  accountId: string
  account?: any
  contacts?: any[]
  selectedContactId?: string
}) {
  const { zohoContext: currentUser } = useZoho()
  const repName = currentUser?.name || "your sales rep"

  // ── Tab state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>("CALL")
  const [callSubTab, setCallSubTab] = useState<CallSubTab>("LOG")

  // ── Call / log states ──────────────────────────────────────────────────
  const [callOutcome, setCallOutcome] = useState("Connected")
  const [callNote, setCallNote] = useState("")
  const [spokeTo, setSpokeTo] = useState("")
  const [reminderDate, setReminderDate] = useState("")
  const [callType, setCallType] = useState<"cold" | "update">("cold")

  // ── Fact-finding ───────────────────────────────────────────────────────
  const [factFinding, setFactFinding] = useState<FactFindingValues>(EMPTY_FACT_FINDING)

  // ── SMS ────────────────────────────────────────────────────────────────
  const [smsText, setSmsText] = useState("")
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [outboundNumbers, setOutboundNumbers] = useState<any[]>([])
  const [selectedOutboundNumber, setSelectedOutboundNumber] = useState("")

  // ── Email / WhatsApp ───────────────────────────────────────────────────
  const [emailText, setEmailText] = useState("")
  const [whatsappText, setWhatsappText] = useState("")

  // ── AI generator ───────────────────────────────────────────────────────
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiType, setAiType] = useState<"text" | "image">("text")
  const [aiChannel, setAiChannel] = useState("SMS")
  const [aiResult, setAiResult] = useState<string | null>(null)
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)

  // ── Order builder ──────────────────────────────────────────────────────
  const [defaultVigRate, setDefaultVigRate] = useState(1.3)
  const [commissionPct, setCommissionPct] = useState(50)
  const [orderLines, setOrderLines] = useState<OrderLine[]>([])
  const [catalogProducts, setCatalogProducts] = useState<any[]>([])
  const [productSearch, setProductSearch] = useState("")
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const productSearchRef = useRef<HTMLDivElement>(null)

  // ── Account intel ──────────────────────────────────────────────────────
  const [accountPurchases, setAccountPurchases] = useState<any[]>([])
  const [accountNotes, setAccountNotes] = useState<any[]>([])
  const [accountDetail, setAccountDetail] = useState<any>(null)
  const [isLoadingIntel, setIsLoadingIntel] = useState(false)
  const [intelTab, setIntelTab] = useState<IntelTab>("purchases")

  // ── Product recommendations ────────────────────────────────────────────
  const [expandedPitch, setExpandedPitch] = useState<string | null>(null)

  // ── UI state ───────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false)
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const [scriptText, setScriptText] = useState("")
  const [showScript, setShowScript] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const primaryContact = contacts?.find(c => c.id === selectedContactId) || contacts?.find(c => c.isPrimary) || contacts?.[0] || null
  const displayPhone = primaryContact?.phone || primaryContact?.mobilePhone || ""
  const cleanPhone = displayPhone ? displayPhone.replace(/[^0-9+]/g, "") : ""
  const contactName = spokeTo || (primaryContact ? `${primaryContact.firstName || ""} ${primaryContact.lastName || ""}`.trim() : "there")

  // ━━━ Effects ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  useEffect(() => {
    fetch("/api/manage-zoho-numbers")
      .then(r => r.json())
      .then(d => {
        if (d.success && d.numbers?.length > 0) {
          setOutboundNumbers(d.numbers)
          const def = d.numbers.find((n: any) => n.isDefault)
          setSelectedOutboundNumber(def ? def.number : d.numbers[0].number)
        }
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    fetch("/api/get-products")
      .then(r => r.json())
      .then(d => { if (d.success) setCatalogProducts(d.products || []) })
      .catch(() => {})

    fetch('/api/admin/settings').then(r => r.json()).then(d => {
      if (d.success && d.settings) {
        if (d.settings.default_vig_rate) setDefaultVigRate(d.settings.default_vig_rate)
        if (d.settings.commission_rate_pct) setCommissionPct(d.settings.commission_rate_pct)
      }
    }).catch(() => {})
  }, [])

  // Pre-fill fact-finding from account data
  useEffect(() => {
    if (!account) return
    setFactFinding({
      bladeSizes: account.bladeSizes || "",
      materialsCut: account.materialsCut || "",
      currentSupplier: account.currentSupplier || "",
      avgBladeCost: account.averageBladeCost || account.avgBladeCost || "",
      crewCount: account.crewCount || "",
      bladesPerOrder: account.bladesPerOrder || "",
      improvementPriority: account.improvementPriority || "",
      readyToBuy: account.readyToBuy || "",
      jobTypes: account.jobTypes || "",
      painPoints: account.painPoints || "",
      productInterest: account.productInterest || [],
    })
    setCallType(account.lastCalledAt ? "update" : "cold")
    const pc = contacts?.find(c => c.isPrimary) || contacts?.[0]
    setSpokeTo(pc ? `${pc.firstName || ""} ${pc.lastName || ""}`.trim() : "")
  }, [account, contacts])

  // Fetch account intel when intel tab is activated
  useEffect(() => {
    if (callSubTab !== "INTEL") return
    if (!account?.zohoId && !accountId) return
    const id = account?.zohoId || accountId
    setIsLoadingIntel(true)
    Promise.all([
      fetch(`/api/get-account-purchases?accountId=${id}`).then(r => r.json()).catch(() => ({ products: [] })),
      fetch(`/api/get-account-details?id=${id}`).then(r => r.json()).catch(() => ({ account: null })),
    ]).then(([purchaseData, detailData]) => {
      setAccountPurchases(purchaseData.purchasedProducts || purchaseData.products || [])
      setAccountNotes(detailData.account?.notes || detailData.notes || [])
      setAccountDetail(detailData.account || null)
    }).finally(() => setIsLoadingIntel(false))
  }, [callSubTab, account?.zohoId, accountId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  useEffect(() => {
    const handleDial = () => setActiveTab("CALL")
    const handleSms = () => setActiveTab("SMS")
    window.addEventListener("inAppDial", handleDial)
    window.addEventListener("inAppSms", handleSms)
    return () => {
      window.removeEventListener("inAppDial", handleDial)
      window.removeEventListener("inAppSms", handleSms)
    }
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (productSearchRef.current && !productSearchRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // ━━━ Computed values ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const topBladeProducts = useMemo(() => {
    return catalogProducts
      .filter(p => {
        const cat = (p.category || "").toLowerCase()
        const status = (() => { try { return JSON.parse(p.description || "{}").status } catch { return "active" } })()
        return cat.includes("blade") && status !== "inactive"
      })
      .map(p => {
        const desc = (() => { try { return JSON.parse(p.description || "{}") } catch { return {} } })()
        return { name: p.name, sku: p.sku, price: p.price || 0, cost: desc.cost || 0 }
      })
      .slice(0, 10)
  }, [catalogProducts])

  const orderFinancials = useMemo(() => {
    if (orderLines.length === 0) return null
    const subTotal = orderLines.reduce((s, l) => s + (!l.isPromo ? l.quantity * l.unitPrice : 0), 0)
    const deadCostSubjectToVig = orderLines.reduce((s, l) => s + (!l.isPromo ? l.cost * l.quantity : 0), 0)
    const deadCostNoVig = orderLines.reduce((s, l) => s + (l.isPromo ? l.cost * l.quantity : 0), 0)
    const deadCostTotal = deadCostSubjectToVig + deadCostNoVig
    const deadCostPlusVig = (deadCostSubjectToVig * defaultVigRate) + deadCostNoVig
    const profitAfterVig = subTotal - deadCostPlusVig
    const salesCommission = profitAfterVig < 0 ? profitAfterVig * 0.50 : profitAfterVig * (commissionPct / 100)
    const marginPct = subTotal > 0 ? (profitAfterVig / subTotal) * 100 : 0
    return { subTotal, deadCostTotal, deadCostPlusVig, profitAfterVig, salesCommission, marginPct }
  }, [orderLines, defaultVigRate, commissionPct])

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return catalogProducts.slice(0, 20)
    const q = productSearch.toLowerCase()
    return catalogProducts.filter(p =>
      (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q)
    ).slice(0, 15)
  }, [productSearch, catalogProducts])

  // ━━━ Actions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const notify = useCallback((message: string, type: "success" | "error") => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 4000)
  }, [])

  const saveCallLog = useCallback(async () => {
    setIsSaving(true)
    try {
      const res = await fetch("/api/log-sales-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          outcome: callOutcome,
          notes: callNote,
          callerName: repName,
          contactReached: true,
          spokeTo,
          followUpDate: reminderDate || null,
          durationMinutes: 1,
          userId: currentUser?.id,
          factFinding: {
            bladeSizes: factFinding.bladeSizes || undefined,
            materialsCut: factFinding.materialsCut || undefined,
            currentSupplier: factFinding.currentSupplier || undefined,
            averageBladeCost: factFinding.avgBladeCost || undefined,
            crewCount: factFinding.crewCount || undefined,
            bladesPerOrder: factFinding.bladesPerOrder || undefined,
            improvementPriority: factFinding.improvementPriority || undefined,
            readyToBuy: factFinding.readyToBuy || undefined,
            jobTypes: factFinding.jobTypes || undefined,
            painPoints: factFinding.painPoints || undefined,
            productInterest: factFinding.productInterest.length > 0 ? factFinding.productInterest : undefined,
          },
        }),
      })
      const data = await res.json()
      if (data.success) {
        setCallNote("")
        setReminderDate("")
        notify("Call logged successfully!", "success")
      } else {
        notify(data.error || "Failed to log call.", "error")
      }
    } catch (e: any) {
      notify("Error: " + e.message, "error")
    } finally {
      setIsSaving(false)
    }
  }, [accountId, callOutcome, callNote, repName, spokeTo, reminderDate, currentUser?.id, factFinding, notify])

  const sendSMS = useCallback(async () => {
    if (!smsText.trim()) return
    const message = smsText.trim()
    if (!window.confirm(`Send this SMS to ${contactName} at ${displayPhone || cleanPhone}?`)) return
    setIsSaving(true)
    try {
      const response = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, contactId: primaryContact?.id || null, message }),
      })
      const data = await response.json()
      if (!response.ok || !data.success || !data.providerAccepted || !data.smsMessage?.id) {
        throw new Error(data.error || "Zoho Voice did not confirm the message")
      }
      const confirmed: Message = {
        id: data.smsMessage.id,
        sender: "rep",
        text: data.smsMessage.body,
        timestamp: new Date(data.smsMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }
      setChatMessages(prev => [...prev, confirmed])
      setSmsText("")
      notify("SMS accepted by Zoho Voice.", "success")
    } catch (err) {
      notify(err instanceof Error ? err.message : "SMS was not sent.", "error")
    } finally {
      setIsSaving(false)
    }
  }, [smsText, accountId, primaryContact?.id, contactName, displayPhone, cleanPhone, notify])

  const sendEmailLog = useCallback(async () => {
    notify("Email sending is not configured. Nothing was sent or logged.", "error")
  }, [notify])

  const sendWhatsAppLog = useCallback(async () => {
    notify("WhatsApp sending is not configured. Nothing was sent or logged.", "error")
  }, [notify])

  const handleGenerateAi = useCallback(async () => {
    if (!aiPrompt) return
    setIsGeneratingAi(true)
    setAiResult(null)
    try {
      const res = await fetch("/api/generate-campaign-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, type: aiType, channel: aiChannel }),
      })
      const data = await res.json()
      if (data.success) setAiResult(data.result)
      else notify("AI generation failed: " + data.message, "error")
    } catch (err: any) { notify("Error: " + err.message, "error") } finally { setIsGeneratingAi(false) }
  }, [aiPrompt, aiType, aiChannel, notify])

  const addProductToOrder = useCallback((p: any) => {
    const desc = (() => { try { return JSON.parse(p.description || "{}") } catch { return {} } })()
    setOrderLines(prev => [...prev, {
      id: String(Date.now()),
      name: p.name,
      sku: p.sku || "",
      quantity: 1,
      unitPrice: p.price || 0,
      cost: desc.cost || 0,
      isPromo: false,
    }])
    setProductSearch("")
    setShowProductDropdown(false)
  }, [])

  // ━━━ Script & Blade Logic (pure functions) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const generateScript = useCallback(() => {
    const timeOfDay = new Date().getHours() < 12 ? "morning" : "afternoon"
    const invoices = account?.invoices || []
    const overdueInvoices = invoices.filter((i: any) => i.status === "Overdue" || i.status?.toLowerCase() === "overdue")
    const overdueTotal = overdueInvoices.reduce((sum: number, i: any) => sum + (parseFloat(i.amount) || 0), 0)

    if (overdueTotal > 0) {
      return `Hi ${contactName}, this is ${repName} with Titan Diamond USA! Hope you're having a great ${timeOfDay}.\n\nI wanted to check in on your account. We noticed there is a pending balance of $${overdueTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} on your oldest overdue statement, and I wanted to see if we could get that taken care of today, or if you needed any invoice copies emailed over to you.\n\nIs there anything else we can quote or ship out for you today?`
    }

    if (callType === "cold") {
      return `Hey, ${contactName} this is ${repName} over at Titan Diamond USA. I'm giving you a call today because we have an early release on our brand new 2026 line-up of blades that we featured at The World of Concrete and ConExpo shows in Las Vegas this year and what's great is with this new release, our manufacturer wants us to give away free blades to our new customers to build new relationships... I just have a quick couple questions to see which blade will work best for you and what you're cutting...\n
1) First off... what size blades do you run? 14"?
2) What are you guys cutting out there?
3) Where do you pick up your blades now, do you buy them retail or over the phone from a wholesaler like me?
4) How much are they charging you for a good 14" blade? $250? $300 Bucks?
5) How many crews do you have?
6) And how many blades do you normally pick up at a time.. 6.. 12.. 25?
7) Let me ask you one last question... if you could improve one thing about the blades you are using right now... what would it be... longer life... faster cutting... or cleaner cutting?`
    }

    let text = `Hi ${contactName}, this is ${repName} with Titan Diamond USA! Hope you're having a great ${timeOfDay}.\n\n`
    if (accountPurchases.length > 0) {
      const top = accountPurchases.slice(0, 3)
      const totalSpent = accountPurchases.reduce((s: number, p: any) => s + (p.totalSpend || 0), 0)
      const totalQty = accountPurchases.reduce((s: number, p: any) => s + (p.quantity || 0), 0)
      text += `I was looking at your account and saw that you've picked up ${totalQty} items from us totaling about $${totalSpent.toLocaleString(undefined, { maximumFractionDigits: 0 })} -- including ${top.map((p: any) => p.name).join(", ")}. `
      text += totalQty >= 10
        ? `You're one of our valued repeat customers, so I wanted to make sure you're taken care of first on our latest deals.\n\n`
        : `I appreciate the business! I wanted to reach out and see how those are working out for you.\n\n`
      const hasBlades = accountPurchases.some((p: any) => (p.name || "").toLowerCase().includes("blade"))
      const hasCupWheels = accountPurchases.some((p: any) => ["cup", "wheel", "grind"].some(k => (p.name || "").toLowerCase().includes(k)))
      const hasCoredrills = accountPurchases.some((p: any) => ["core", "drill"].some(k => (p.name || "").toLowerCase().includes(k)))
      if (hasBlades && !hasCupWheels) text += `I also noticed you've been running our diamond blades -- have you had a chance to try our cup wheels and grinding products? A lot of our blade customers end up loving them for surface prep.\n\n`
      else if (hasBlades && !hasCoredrills) text += `Since you're running our blades, I wanted to let you know we also carry core drill bits if you ever need them on the job.\n\n`
      else text += `Are you getting close to needing a restock on any of those? I can get a quote together for you right now.\n\n`
    } else {
      text += `I'm reaching out to check in and see if there are any diamond blades, cup wheels, or core drill bits you need stocked up for your upcoming projects.\n\n`
    }

    const missing: string[] = []
    if (!factFinding.bladeSizes) missing.push("what size blades you primarily run")
    if (!factFinding.materialsCut) missing.push("what materials you guys are cutting most right now")
    if (!factFinding.crewCount) missing.push("how many crews you have out in the field")
    if (missing.length > 0) {
      text += `By the way, I was just updating your account profile -- could you remind me ${missing[0]}?\n\n`
    }

    text += `Is there anything we can quote or ship out for you today?`
    return text
  }, [account, accountPurchases, contactName, repName, callType, factFinding])

  const getBladeRecommendations = useCallback(() => {
    const mat = (factFinding.materialsCut || "").toLowerCase()
    const prio = (factFinding.improvementPriority || "").toLowerCase()

    const pitches: Record<string, string> = {
      medusa: `Let me tell you about one of my best selling blades for the kind of work you are doing. It's called "The Medusa". What my customers all love about this blade is that it has a 12mm jumbo segment compared to most blades on the market that are just 10mm giving you longer blade life. This new blade is perfect for Cured Concrete, Brick, Block, Stone & Pavers. The segments are made under a higher heat and a lower pressure which makes the diamonds last longer without sacrificing speed. Each one of the segments are laser welded for reliability and safety and the core is speed tensioned to eliminate warping and wobbling.\n\nNow ${contactName}, retail stores in your city would sell a blade of this quality for $150 bucks all day long! I normally wholesale it for $100 bucks! Right now we are giving this blade away for FREE! The way the promotion works is I send 6 blades out there -- the first blade you pull out of the box is absolutely FREE! The other 5 blades are only $68 bucks each! If you do the math, you're getting 6 blades for $340 bucks! That's less than $57 bucks per blade! And at that price you're stealing them!`,
      kingTurbo: `Let me tell you about one of my best blades for what you are doing... it's called "THE KING TURBO BLADE". What my customers all love about this blade is that it has 24 serrated turbo segments which makes the blade cut super fast and super smooth through Hard Re-enforced Concrete and other hard materials. This premium soft bond blade will actually pull itself through the cut, so you don't have to put a lot of pressure on the saw -- you just let the blade do the work for you.\n\nNow ${contactName}, retail stores will sell a blade of this quality for $250 bucks all day long! I normally wholesale it for $175 bucks! Right now we are giving this blade away for FREE! The way the promotion works is I send three blades out there -- the first blade you pull out of the box is absolutely FREE! The other two are only $175 each! If you do the math you're getting three blades for $350 bucks! That's $116 bucks per blade! And at that price you're stealing them!`,
      titan: `I want to tell you about one of my best blades for what you're doing. It's called "THE TITAN". This brand-new blade is designed to work great on a handheld or a walk-behind saw. It's versatile enough to cut everything from Re-enforced Concrete, Asphalt, Ductile Iron, Re-enforced Concrete Pipe and even Rebar!\n\n${contactName}, my customers are telling me that this is "The Best Blade" they've ever used, hands down! I don't expect you to take my word for it -- I'll prove it to you! I normally wholesale these blades for $299 each! Like I said, right now I am giving you one absolutely free of charge. The first blade you pull out of the box is absolutely free! The other two blades in the box are only $250 each! You're getting three blades for $500 bucks -- that's only $166 bucks per blade! And at that price you're stealing them!`,
      darkKnight: `I want to tell you about one of my best blades for what you're doing. It's called my "Dark Knight Blade". It's versatile enough to cut everything from re-enforced concrete to asphalt, to brick, block & stone. The major improvement over other blades is that they make the diamond segments under a higher heat and a lower pressure which makes the diamonds last longer without sacrificing any speed.\n\n${contactName}, my customers are telling me that this is "The Best Blade" they've ever used! If you were able to find a blade of this quality at your local supplier it would cost $250 or more! I normally wholesale these blades for $175 each! Right now I am giving you one absolutely free of charge. The first blade you pull out of the box is absolutely free! The other 3 blades in the box are only $150 each! You're getting 4 blades for $450 bucks -- that's less than $113 bucks per blade! And at that price you're stealing them!`,
      razor: `This blade is ideal for cutting Ceramic Tile, Marble, Granite & even Porcelain and it cuts through it like a hot knife through butter! The new "Razor Blade" has a reinforced core to prevent warping, wobbling and walking and runs super quiet. This blade cuts really clean & fast & the manufacturer claims 100% chip free cutting.\n\nNow ${contactName}, retail stores would sell a blade of this quality for $150 bucks all day long! I normally wholesale it for $120 bucks! Right now we are giving this blade away for FREE! The way the promotion works is I send four blades out there -- the first blade you pull out of the box is absolutely FREE! The next three are only $100 each!`,
    }

    let priorityAddon = ""
    if (prio.includes("life")) priorityAddon = " We laser-weld our segments and use a 30% higher diamond concentration, so our blades easily outlast the standard stuff you get at retail."
    else if (prio.includes("fast")) priorityAddon = " Our turbo segment design reduces drag and clears debris instantly, so it won't bind up when you're cutting deep."
    else if (prio.includes("clean")) priorityAddon = " Our continuous rim technology ensures a true zero-chip finish every single time."
    else if (prio.includes("price") || prio.includes("lower")) priorityAddon = " Because we manufacture and distribute directly, we cut out the middleman, saving you 20-30% compared to local suppliers."

    const recs: { tier: string; blade: string; pitch: string }[] = []
    if (mat.includes("marble") || mat.includes("tile") || mat.includes("granite")) {
      recs.push({ tier: "Best", blade: "Titan Razor Blade", pitch: pitches.razor + priorityAddon })
    } else if (mat.includes("asphalt") || mat.includes("green concrete")) {
      recs.push({ tier: "Best", blade: "The Titan", pitch: pitches.titan + priorityAddon })
    } else {
      recs.push({ tier: "Good", blade: "The Medusa Blade", pitch: pitches.medusa + priorityAddon })
      recs.push({ tier: "Better", blade: "The King Turbo", pitch: pitches.kingTurbo + priorityAddon })
      recs.push({ tier: "Best", blade: "The Dark Knight Blade", pitch: pitches.darkKnight + priorityAddon })
    }
    return recs
  }, [factFinding.materialsCut, factFinding.improvementPriority, contactName])

  // ━━━ Return all state and actions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return {
    // User
    currentUser, repName,
    // Tab state
    activeTab, setActiveTab, callSubTab, setCallSubTab,
    // Call/log
    callOutcome, setCallOutcome, callNote, setCallNote,
    spokeTo, setSpokeTo, reminderDate, setReminderDate, callType, setCallType,
    // Fact-finding
    factFinding, setFactFinding,
    // SMS
    smsText, setSmsText, chatMessages, setChatMessages,
    outboundNumbers, selectedOutboundNumber, setSelectedOutboundNumber,
    // Email/WhatsApp
    emailText, setEmailText, whatsappText, setWhatsappText,
    // AI
    aiPrompt, setAiPrompt, aiType, setAiType, aiChannel, setAiChannel,
    aiResult, setAiResult, isGeneratingAi,
    // Order
    defaultVigRate, commissionPct, orderLines, setOrderLines,
    catalogProducts, productSearch, setProductSearch,
    showProductDropdown, setShowProductDropdown, productSearchRef,
    // Intel
    accountPurchases, accountNotes, accountDetail,
    isLoadingIntel, intelTab, setIntelTab,
    // Products
    expandedPitch, setExpandedPitch, topBladeProducts,
    // UI
    isSaving, notification, scriptText, setScriptText, showScript, setShowScript,
    chatEndRef, primaryContact, displayPhone, cleanPhone, contactName,
    // Computed
    orderFinancials, filteredProducts,
    // Actions
    notify, saveCallLog, sendSMS, sendEmailLog, sendWhatsAppLog,
    handleGenerateAi, addProductToOrder,
    generateScript, getBladeRecommendations,
  }
}
