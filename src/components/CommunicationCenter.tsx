"use client"


/**
 * CommunicationCenter.tsx
 *
 * Unified communication & sales hub for the Account page.
 * Full feature parity with SalesCallCampaignModal:
 *   ✅ Click-to-Dial / outbound call logging
 *   ✅ SMS chat interface
 *   ✅ Email & WhatsApp logging
 *   ✅ Dynamic script generator (cold / follow-up / overdue)
 *   ✅ Fact-Finding panel (shared FactFindingPanel component)
 *   ✅ Blade recommendations with full product pitches
 *   ✅ Purchase history with per-product details
 *   ✅ Account intel tabs (purchases / notes / invoices)
 *   ✅ Order builder with live financials (VIG, profit, commission)
 *   ✅ AI message generator
 */

import { useState, useEffect, useRef, useMemo } from "react"
import { useZoho } from "@/components/ZohoProvider"
import {
  FiPhoneCall, FiMail, FiMessageSquare, FiCheckCircle,
  FiAlertCircle, FiSend, FiMessageCircle, FiBookOpen,
  FiZap, FiPackage, FiDollarSign, FiActivity, FiShoppingCart,
  FiFileText, FiTrendingUp, FiPlus, FiSearch, FiChevronDown,
  FiChevronRight, FiLoader, FiTag, FiClock
} from "react-icons/fi"
import { CallScriptViewer } from "./CallScriptViewer"
import {
  FactFindingPanel, FactFindingSummary,
  EMPTY_FACT_FINDING, type FactFindingValues
} from "@/components/FactFindingPanel"
import { OrderBuilder, type OrderLine } from "@/components/OrderBuilder"
import { PhoneLink } from "@/components/PhoneLink"

// â"€â"€â"€ Types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type Message = {
  id: string
  sender: "rep" | "client"
  text: string
  timestamp: string
}



// â"€â"€â"€ Main Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export function CommunicationCenter({
  accountId,
  account,
  contacts,
}: {
  accountId: string
  account?: any          // full account object (for script gen, overdue, etc.)
  contacts?: any[]
}) {
  const { zohoContext: currentUser } = useZoho()
  const repName = currentUser?.name || "your sales rep"

  // â"€â"€ Tab state â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const [activeTab, setActiveTab] = useState<"CALL" | "SMS" | "EMAIL" | "WHATSAPP">("CALL")
  const [callSubTab, setCallSubTab] = useState<"LOG" | "SCRIPT" | "FACT" | "PRODUCTS" | "INTEL" | "ORDER" | "AI">("LOG")

  // â"€â"€ Call / log states â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const [callOutcome, setCallOutcome] = useState("Connected")
  const [callNote, setCallNote] = useState("")
  const [spokeTo, setSpokeTo] = useState("")
  const [reminderDate, setReminderDate] = useState("")
  const [callType, setCallType] = useState<"cold" | "update">("cold")

  // â"€â"€ Fact-finding â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const [factFinding, setFactFinding] = useState<FactFindingValues>(EMPTY_FACT_FINDING)

  // â"€â"€ SMS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const [smsText, setSmsText] = useState("")
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [outboundNumbers, setOutboundNumbers] = useState<any[]>([])
  const [selectedOutboundNumber, setSelectedOutboundNumber] = useState("")

  // â"€â"€ Email / WhatsApp â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const [emailText, setEmailText] = useState("")
  const [whatsappText, setWhatsappText] = useState("")

  // â"€â"€ AI generator â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiType, setAiType] = useState<"text" | "image">("text")
  const [aiChannel, setAiChannel] = useState("SMS")
  const [aiResult, setAiResult] = useState<string | null>(null)
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)

  // â"€â"€ Order builder â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const [defaultVigRate, setDefaultVigRate] = useState(1.3)
  const [commissionPct, setCommissionPct] = useState(50)

  // Order Builder States
  const [orderLines, setOrderLines] = useState<OrderLine[]>([])
  const [catalogProducts, setCatalogProducts] = useState<any[]>([])
  const [productSearch, setProductSearch] = useState("")
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const productSearchRef = useRef<HTMLDivElement>(null)

  // â"€â"€ Account intel â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const [accountPurchases, setAccountPurchases] = useState<any[]>([])
  const [accountNotes, setAccountNotes] = useState<any[]>([])
  const [accountDetail, setAccountDetail] = useState<any>(null)
  const [isLoadingIntel, setIsLoadingIntel] = useState(false)
  const [intelTab, setIntelTab] = useState<"purchases" | "notes" | "invoices">("purchases")

  // â"€â"€ Product recommendations â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const [expandedPitch, setExpandedPitch] = useState<string | null>(null)

  // â"€â"€ UI state â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const [isSaving, setIsSaving] = useState(false)
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const [scriptText, setScriptText] = useState("")
  const [showScript, setShowScript] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const primaryContact = contacts?.find(c => c.isPrimary) || contacts?.[0] || null
  const displayPhone = primaryContact?.phone || primaryContact?.mobilePhone || ""
  const cleanPhone = displayPhone ? displayPhone.replace(/[^0-9+]/g, "") : ""
  const contactName = spokeTo || (primaryContact ? `${primaryContact.firstName || ""} ${primaryContact.lastName || ""}`.trim() : "there")

  // â"€â"€ Effects â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

  // â"€â"€ Top blade products â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

  // â"€â"€ Order financials â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const orderFinancials = (() => {
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
  })()

  // â"€â"€ Script generator â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const generateScript = () => {
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
  }

  // â"€â"€ Blade recommendations â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const getBladeRecommendations = () => {
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
  }

  // â"€â"€ Notify helper â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const notify = (message: string, type: "success" | "error") => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 4000)
  }

  // â"€â"€ Log call â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const saveCallLog = async () => {
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
  }

  // â"€â"€ SMS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const sendSMS = async () => {
    if (!smsText.trim()) return
    const newMsg: Message = {
      id: String(Date.now()),
      sender: "rep",
      text: smsText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }
    setChatMessages(prev => [...prev, newMsg])
    setSmsText("")
    try {
      await fetch("/api/zoho-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SEND_SMS",
          accountId,
          userId: currentUser?.id,
          userEmail: currentUser?.email,
          noteContent: newMsg.text,
          sentiment: "Neutral",
          fromNumber: selectedOutboundNumber,
        }),
      })
    } catch (err) { console.error("SMS sync error:", err) }
  }

  // â"€â"€ Email / WhatsApp â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const sendEmailLog = async () => {
    setIsSaving(true)
    try {
      const res = await fetch("/api/zoho-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SEND_EMAIL", accountId, userId: currentUser?.id, userEmail: currentUser?.email, noteContent: emailText, sentiment: "Neutral" }),
      })
      if (res.ok) { setEmailText(""); notify("Email logged!", "success") }
    } catch { notify("Failed to send email.", "error") } finally { setIsSaving(false) }
  }

  const sendWhatsAppLog = async () => {
    setIsSaving(true)
    try {
      const res = await fetch("/api/zoho-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SEND_WHATSAPP", accountId, userId: currentUser?.id, userEmail: currentUser?.email, noteContent: whatsappText, sentiment: "Neutral" }),
      })
      if (res.ok) { setWhatsappText(""); notify("WhatsApp message logged!", "success") }
    } catch { notify("Failed.", "error") } finally { setIsSaving(false) }
  }

  // â"€â"€ AI generator â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const handleGenerateAi = async () => {
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
  }

  // â"€â"€ Order builder helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return catalogProducts.slice(0, 20)
    const q = productSearch.toLowerCase()
    return catalogProducts.filter(p =>
      (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q)
    ).slice(0, 15)
  }, [productSearch, catalogProducts])

  const addProductToOrder = (p: any) => {
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
  }

  // â"€â"€ Sub-tabs for the Call panel â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const CALL_SUB_TABS = [
    { key: "LOG", icon: <FiPhoneCall size={11} />, label: "Log" },
    { key: "SCRIPT", icon: <FiBookOpen size={11} />, label: "Script" },
    { key: "FACT", icon: <FiActivity size={11} />, label: "Fact-Finding" },
    { key: "PRODUCTS", icon: <FiTag size={11} />, label: "Products" },
    { key: "INTEL", icon: <FiFileText size={11} />, label: "Intel" },
    { key: "ORDER", icon: <FiShoppingCart size={11} />, label: "Order" },
    { key: "AI", icon: <FiZap size={11} />, label: "AI" },
  ] as const

  const bladeRecs = getBladeRecommendations()
  const tierColors: Record<string, string> = {
    Good: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    Better: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    Best: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
  }

  // â"€â"€ Render â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  return (
    <div className="space-y-4 h-full flex flex-col relative">

      {/* Notification toast */}
      {notification && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold ${
          notification.type === "success"
            ? "bg-emerald-900/30 border border-emerald-500/30 text-emerald-400"
            : "bg-red-900/30 border border-red-500/30 text-red-400"
        }`}>
          {notification.type === "success" ? <FiCheckCircle /> : <FiAlertCircle />}
          {notification.message}
        </div>
      )}

      {/* Title */}
      <h2 className="text-xl font-semibold text-[var(--primary)] flex items-center gap-2">
        <FiPhoneCall />
        Communications &amp; Sales Center
      </h2>

      {/* Primary Contact Banner */}
      {primaryContact ? (
        <div className="p-3 bg-neutral-800/50 border border-neutral-700 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-[10px] text-neutral-400 uppercase tracking-wider font-bold">Communicating with</div>
            <div className="font-bold text-base text-white">{primaryContact.firstName} {primaryContact.lastName}</div>
            <div className="text-xs text-neutral-500 font-mono mt-0.5">
              {activeTab === "EMAIL" ? primaryContact.email : (
                cleanPhone
                  ? <PhoneLink phone={cleanPhone} className="hover:text-[var(--primary)] underline">{displayPhone}</PhoneLink>
                  : displayPhone || "No phone on file"
              )}
            </div>
          </div>
          <FactFindingSummary values={factFinding} />
        </div>
      ) : (
        <div className="p-3 bg-neutral-800/50 border border-neutral-700 rounded-lg text-neutral-400 text-sm">
          No contact on file
        </div>
      )}

      {/* â"€â"€ Channel Tabs â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div className="flex space-x-1.5 border-b border-white/10 pb-0 overflow-x-auto flex-nowrap scrollbar-none">
        {([
          { key: "CALL", icon: <FiPhoneCall size={12} />, label: "Call", color: "bg-[var(--primary)] text-white", inactive: "text-neutral-400 hover:text-white hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300" },
          { key: "SMS", icon: <FiMessageCircle size={12} />, label: "SMS", color: "bg-emerald-600 text-white", inactive: "text-neutral-400 hover:text-white hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300" },
          { key: "EMAIL", icon: <FiMail size={12} />, label: "Email", color: "bg-purple-600 text-white", inactive: "text-neutral-400 hover:text-white hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300" },
          { key: "WHATSAPP", icon: <FiMessageSquare size={12} />, label: "WhatsApp", color: "bg-green-600 text-white", inactive: "text-neutral-400 hover:text-white hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300" },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg transition-colors whitespace-nowrap text-xs font-bold ${activeTab === tab.key ? tab.color : tab.inactive}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-
          CALL TAB -- with all 7 sub-panels
      â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â- */}
      {activeTab === "CALL" && (
        <div className="flex-1 flex flex-col min-h-0 gap-3">

          {/* Sub-tabs */}
          <div className="flex gap-1 flex-wrap">
            {CALL_SUB_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setCallSubTab(t.key as any)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border ${
                  callSubTab === t.key
                    ? "bg-[var(--primary)] border-[var(--primary)] text-white shadow-sm"
                    : "glass-panel border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-white"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* â"€â"€ LOG sub-tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {callSubTab === "LOG" && (
            <div className="flex-1 flex flex-col gap-3">
              {/* Click to Dial */}
              {cleanPhone ? (
                <div className="text-center py-2">
                  <PhoneLink
                    phone={cleanPhone}
                    className="inline-flex items-center gap-2 px-8 py-3 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-foreground)] font-bold rounded-lg transition-colors shadow-lg text-sm"
                  >
                    <FiPhoneCall /> Click to Dial -- {displayPhone}
                  </PhoneLink>
                </div>
              ) : (
                <div className="text-center py-3 text-neutral-500 text-sm">No phone number on file</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1 block">Call Outcome</label>
                  <select value={callOutcome} onChange={e => setCallOutcome(e.target.value)} className="w-full glass-panel border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-[var(--primary)] text-white">
                    <option>Connected</option>
                    <option>Left Voicemail</option>
                    <option>No Answer / Busy</option>
                    <option>Callback Requested</option>
                    <option>Wrong Number</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1 block">Spoke To</label>
                  <input
                    value={spokeTo}
                    onChange={e => setSpokeTo(e.target.value)}
                    placeholder="Contact name..."
                    className="w-full glass-panel border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-[var(--primary)] text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1 block">Follow-up Reminder</label>
                <input type="date" value={reminderDate} onChange={e => setReminderDate(e.target.value)} className="w-full glass-panel border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-[var(--primary)] text-neutral-300" />
              </div>

              <div className="flex-1 flex flex-col min-h-[120px]">
                <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1 block">Call Summary &amp; Notes</label>
                <textarea
                  value={callNote}
                  onChange={e => setCallNote(e.target.value)}
                  className="w-full flex-1 glass-panel border border-neutral-700 rounded-lg p-3 text-sm focus:outline-none focus:border-[var(--primary)] text-white font-sans resize-none"
                  placeholder="Notes from the call..."
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={saveCallLog}
                  disabled={isSaving || !callNote}
                  className="px-6 py-2 bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50 text-white font-bold text-sm rounded-lg transition-colors"
                >
                  {isSaving ? "Saving..." : "Save Note & Log Call"}
                </button>
              </div>
            </div>
          )}

          {/* â"€â"€ SCRIPT sub-tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {callSubTab === "SCRIPT" && (
            <div className="flex-1 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {(["cold", "update"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setCallType(t)}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${callType === t ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-400" : "glass-panel border-neutral-700 text-neutral-400 hover:border-neutral-600"}`}
                    >
                      {t === "cold" ? "⚡ Cold Call" : "🔄 Follow-Up"}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setScriptText(generateScript()); setShowScript(true) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-xs rounded-lg transition-colors"
                >
                  <FiBookOpen size={12} /> Generate Script
                </button>
              </div>

              {showScript && scriptText ? (
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Generated Script</span>
                    <button onClick={() => navigator.clipboard?.writeText(scriptText)} className="text-[10px] text-[var(--primary)] hover:underline">Copy</button>
                  </div>
                  <div className="flex-1 glass-panel/60 border border-neutral-700 rounded-xl p-4 text-sm text-neutral-200 whitespace-pre-line leading-relaxed overflow-y-auto font-sans max-h-[420px] scrollbar-thin">
                    {scriptText}
                  </div>
                </div>
              ) : (
                <div className="flex-1 glass-panel/40 border border-dashed border-neutral-700 rounded-xl flex flex-col items-center justify-center gap-2 py-10 text-neutral-500">
                  <FiBookOpen size={24} />
                  <p className="text-sm">Click "Generate Script" to get a personalized call script</p>
                  <p className="text-xs text-neutral-600">Script adapts based on call type, purchase history &amp; missing fact-finding</p>
                </div>
              )}

              {/* Static CallScriptViewer as reference */}
              <CallScriptViewer accountId={accountId} contact={primaryContact} />
            </div>
          )}

          {/* â"€â"€ FACT-FINDING sub-tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {callSubTab === "FACT" && (
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              <FactFindingPanel
                values={factFinding}
                onChange={setFactFinding}
                mode={callType === "cold" ? "dialer-cold" : "dialer-followup"}
                questionCount={10}
                accentColor="amber"
                updatedAt={account?.factFindingUpdatedAt || account?.bladeSizesUpdatedAt || undefined}
                updatedBy={account?.factFindingUpdatedBy || account?.bladeSizesUpdatedBy || undefined}
              />
            </div>
          )}

          {/* â"€â"€ PRODUCTS sub-tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {callSubTab === "PRODUCTS" && (
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto scrollbar-thin">
              {!factFinding.materialsCut && (
                <div className="p-3 bg-amber-900/20 border border-amber-500/20 rounded-lg text-xs text-amber-400 flex items-center gap-2">
                  <FiAlertCircle size={14} />
                  Fill in "Materials Cut" in Fact-Finding for personalized recommendations
                </div>
              )}

              {bladeRecs.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    Recommended for: {factFinding.materialsCut || "General Concrete Work"}
                  </div>
                  {bladeRecs.map((rec, i) => (
                    <div key={i} className="border border-neutral-700 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedPitch(expandedPitch === rec.blade ? null : rec.blade)}
                        className="w-full flex items-center justify-between p-3 hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/40 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${tierColors[rec.tier]}`}>
                            {rec.tier}
                          </span>
                          <span className="font-bold text-sm text-white">{rec.blade}</span>
                        </div>
                        {expandedPitch === rec.blade ? <FiChevronDown size={14} className="text-neutral-400" /> : <FiChevronRight size={14} className="text-neutral-400" />}
                      </button>
                      {expandedPitch === rec.blade && (
                        <div className="px-4 pb-4 glass-panel/50 border-t border-white/10">
                          <div className="text-xs text-neutral-200 whitespace-pre-line leading-relaxed mt-3 font-sans">{rec.pitch}</div>
                          <button
                            onClick={() => navigator.clipboard?.writeText(rec.pitch)}
                            className="mt-3 text-[10px] text-[var(--primary)] hover:underline"
                          >
                            Copy Pitch
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-neutral-500 text-sm text-center py-8">No recommendations available</div>
              )}

              {/* Quick-add top blades */}
              {topBladeProducts.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2">Top Selling Blades -- Quick Add to Order</div>
                  <div className="flex flex-wrap gap-2">
                    {topBladeProducts.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setCallSubTab("ORDER")
                          addProductToOrder({ name: p.name, sku: p.sku, price: p.price, description: JSON.stringify({ cost: p.cost }) })
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 glass-panel border border-neutral-700 rounded-lg text-[10px] font-bold text-neutral-300 hover:border-[var(--primary)] hover:text-white transition-all"
                      >
                        <FiPlus size={10} /> {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* â"€â"€ INTEL sub-tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {callSubTab === "INTEL" && (
            <div className="flex-1 flex flex-col gap-3">
              <div className="flex gap-1.5">
                {(["purchases", "notes", "invoices"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setIntelTab(t)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all capitalize ${
                      intelTab === t
                        ? "bg-[var(--primary)] border-[var(--primary)] text-white"
                        : "glass-panel border-neutral-700 text-neutral-400 hover:border-neutral-600"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {isLoadingIntel ? (
                <div className="flex items-center justify-center py-10 text-neutral-500 gap-2">
                  <FiLoader className="animate-spin" /> Loading intel...
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2">
                  {/* Purchases */}
                  {intelTab === "purchases" && (
                    accountPurchases.length > 0 ? (
                      <div className="space-y-2">
                        {accountPurchases.map((p: any, i: number) => (
                          <div key={i} className="p-3 glass-panel/50 border border-white/10 rounded-lg flex items-center justify-between gap-3">
                            <div>
                              <div className="font-bold text-xs text-white">{p.name || p.itemName}</div>
                              <div className="text-[10px] text-neutral-500">{p.sku || ""}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-black text-xs text-emerald-400">×{p.quantity || 0}</div>
                              {p.totalSpend > 0 && <div className="text-[10px] text-neutral-400">${(p.totalSpend || 0).toLocaleString()}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <div className="text-neutral-500 text-sm text-center py-10">No purchase history found</div>
                  )}

                  {/* Notes */}
                  {intelTab === "notes" && (
                    accountNotes.length > 0 ? (
                      <div className="space-y-2">
                        {accountNotes.slice(0, 15).map((n: any, i: number) => (
                          <div key={i} className="p-3 glass-panel/50 border border-white/10 rounded-lg">
                            <div className="text-xs text-neutral-300 leading-relaxed">{n.content || n.note}</div>
                            <div className="text-[10px] text-neutral-600 mt-1 font-mono">{n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ""}</div>
                          </div>
                        ))}
                      </div>
                    ) : <div className="text-neutral-500 text-sm text-center py-10">No notes found</div>
                  )}

                  {/* Invoices */}
                  {intelTab === "invoices" && (
                    (accountDetail?.invoices || account?.invoices || []).length > 0 ? (
                      <div className="space-y-2">
                        {(accountDetail?.invoices || account?.invoices || []).slice(0, 20).map((inv: any, i: number) => (
                          <div key={i} className={`p-3 border rounded-lg flex items-center justify-between gap-3 ${
                            inv.status?.toLowerCase() === "overdue"
                              ? "bg-red-900/10 border-red-500/20"
                              : "glass-panel/50 border-white/10"
                          }`}>
                            <div>
                              <div className="font-bold text-xs text-white">{inv.invoiceNumber || inv.zohoId}</div>
                              <div className={`text-[10px] font-bold ${inv.status?.toLowerCase() === "overdue" ? "text-red-400" : "text-neutral-400"}`}>
                                {inv.status}
                              </div>
                            </div>
                            <div className="font-black text-sm text-emerald-400">${(inv.amount || 0).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    ) : <div className="text-neutral-500 text-sm text-center py-10">No invoices found</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* â"€â"€ ORDER sub-tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {callSubTab === "ORDER" && (
            <div className="flex-1 flex flex-col gap-3">
              <OrderBuilder
                orderLines={orderLines}
                setOrderLines={setOrderLines}
                catalogProducts={catalogProducts}
                vigRate={defaultVigRate}
                commissionPct={commissionPct}
                accountName={account?.name}
                accountDetail={accountDetail}
              />
            </div>
          )}

          {/* â"€â"€ AI sub-tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {callSubTab === "AI" && (
            <div className="flex-1 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1 block">Channel</label>
                  <select value={aiChannel} onChange={e => setAiChannel(e.target.value)} className="w-full glass-panel border border-neutral-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-[var(--primary)]">
                    <option>SMS</option>
                    <option>Email</option>
                    <option>WhatsApp</option>
                    <option>Script</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1 block">Type</label>
                  <select value={aiType} onChange={e => setAiType(e.target.value as any)} className="w-full glass-panel border border-neutral-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-[var(--primary)]">
                    <option value="text">Text</option>
                    <option value="image">Image</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1 block">Prompt / Context</label>
                <textarea
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  rows={3}
                  placeholder={`e.g. "Write a follow-up ${aiChannel.toLowerCase()} for ${primaryContact?.firstName || 'the customer'} who buys concrete blades. Mention our new King Turbo special."`}
                  className="w-full glass-panel border border-neutral-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[var(--primary)] resize-none"
                />
              </div>

              <button
                onClick={handleGenerateAi}
                disabled={isGeneratingAi || !aiPrompt}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50 text-white font-bold text-sm rounded-lg transition-colors"
              >
                {isGeneratingAi ? <><FiLoader className="animate-spin" /> Generating...</> : <><FiZap /> Generate with AI</>}
              </button>

              {aiResult && (
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">AI Result</span>
                    <button onClick={() => navigator.clipboard?.writeText(aiResult)} className="text-[10px] text-[var(--primary)] hover:underline">Copy</button>
                  </div>
                  <div className="flex-1 glass-panel/60 border border-[var(--primary)]/20 rounded-xl p-4 text-sm text-neutral-200 whitespace-pre-line leading-relaxed overflow-y-auto scrollbar-thin max-h-[300px]">
                    {aiResult}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEmailText(aiResult); setActiveTab("EMAIL") }}
                      className="px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-600/30 transition-colors"
                    >
                      â†' Send as Email
                    </button>
                    <button
                      onClick={() => { setSmsText(aiResult); setActiveTab("SMS") }}
                      className="px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-bold hover:bg-emerald-600/30 transition-colors"
                    >
                      â†' Send as SMS
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-
          SMS TAB
      â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â- */}
      {activeTab === "SMS" && (
        <div className="flex-1 flex flex-col bg-black/20 border border-white/10 rounded-xl p-4 min-h-[320px] justify-between overflow-hidden">
          {outboundNumbers.length > 0 && (
            <div className="mb-3 pb-3 border-b border-white/10 flex items-center gap-2">
              <label className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">From:</label>
              <select
                value={selectedOutboundNumber}
                onChange={e => setSelectedOutboundNumber(e.target.value)}
                className="bg-black border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-300 focus:border-emerald-500 focus:outline-none"
              >
                {outboundNumbers.map((num, i) => (
                  <option key={i} value={num.number}>{num.label || "Number"} ({num.number})</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-4 scrollbar-thin max-h-[280px]">
            {chatMessages.length === 0 && (
              <div className="text-center text-neutral-600 text-xs py-8">No messages yet -- start the conversation below</div>
            )}
            {chatMessages.map(msg => {
              const isRep = msg.sender === "rep"
              return (
                <div key={msg.id} className={`flex flex-col ${isRep ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-xs leading-relaxed ${
                    isRep ? "bg-emerald-600 text-white rounded-tr-none" : "bg-neutral-800 text-neutral-200 rounded-tl-none border border-neutral-700"
                  }`}>{msg.text}</div>
                  <span className="text-[9px] text-neutral-500 mt-1 font-mono px-1">{msg.timestamp}</span>
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>

          <div className="pt-3 border-t border-white/10 flex gap-2">
            <input
              type="text"
              value={smsText}
              onChange={e => setSmsText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") sendSMS() }}
              placeholder="Send text message..."
              className="flex-1 glass-panel border border-neutral-700 rounded-full px-4 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={sendSMS}
              disabled={!smsText.trim()}
              className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center justify-center shadow-lg transition-colors"
            >
              <FiSend size={14} />
            </button>
          </div>
        </div>
      )}

      {/* â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-
          EMAIL TAB
      â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â- */}
      {activeTab === "EMAIL" && (
        <div className="flex-1 flex flex-col gap-3">
          <div className="flex justify-between items-end">
            <label className="text-xs font-semibold text-neutral-400">Compose Email</label>
            <button
              onClick={() => setEmailText(`Hi ${primaryContact?.firstName},\n\nHope you are doing well. Just wanted to follow up on the quote we prepared for you. Let me know if you would like me to process it.\n\nBest,\nTitan Diamond`)}
              className="text-xs text-purple-400 hover:text-purple-300"
            >
              Load Template
            </button>
          </div>
          <textarea
            value={emailText}
            onChange={e => setEmailText(e.target.value)}
            className="w-full flex-1 glass-panel border border-neutral-700 rounded-lg p-3 text-sm focus:outline-none focus:border-purple-500 text-white resize-none min-h-[180px]"
            placeholder="Write your email here..."
          />
          <div className="flex justify-end">
            <button
              onClick={sendEmailLog}
              disabled={isSaving || !emailText}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-sm rounded-lg transition-colors"
            >
              {isSaving ? "Logging..." : "Send Email"}
            </button>
          </div>
        </div>
      )}

      {/* â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-
          WHATSAPP TAB
      â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â- */}
      {activeTab === "WHATSAPP" && (
        <div className="flex-1 flex flex-col gap-3">
          <div className="flex justify-between items-end">
            <label className="text-xs font-semibold text-neutral-400">Compose WhatsApp Message</label>
            <button
              onClick={() => setWhatsappText(`Hello ${primaryContact?.firstName}! 🚀 We have a new promotion running this week. Please let me know if you are interested!`)}
              className="text-xs text-green-400 hover:text-green-300"
            >
              Load Template
            </button>
          </div>
          <textarea
            value={whatsappText}
            onChange={e => setWhatsappText(e.target.value)}
            className="w-full flex-1 glass-panel border border-neutral-700 rounded-lg p-3 text-sm focus:outline-none focus:border-green-500 text-white resize-none min-h-[180px]"
            placeholder="Write your WhatsApp message..."
          />
          <div className="flex justify-end">
            <button
              onClick={sendWhatsAppLog}
              disabled={isSaving || !whatsappText}
              className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold text-sm rounded-lg transition-colors"
            >
              {isSaving ? "Logging..." : "Send WhatsApp"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

