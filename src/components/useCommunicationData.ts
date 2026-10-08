"use client"

import { inferSalesCallType, salesCallText, salesProductCandidates } from "@/lib/sales-call-flow"

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
  const smsRequestIdRef = useRef<string | null>(null)
  const primaryContact = contacts?.find(c => c.id === selectedContactId) || contacts?.find(c => c.isPrimary) || contacts?.[0] || null
  const displayPhone = primaryContact?.phone || primaryContact?.mobilePhone || ""
  const cleanPhone = displayPhone ? displayPhone.replace(/[^0-9+]/g, "") : ""
  const contactName = spokeTo || (primaryContact ? `${primaryContact.firstName || ""} ${primaryContact.lastName || ""}`.trim() : "there")

  // ━━━ Effects ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  useEffect(() => {
    const refreshNumbers = () => fetch("/api/manage-zoho-numbers", { cache: 'no-store' })
      .then(r => r.json()).then(d => {
        const available = d.success ? (d.numbers || []).filter((n: any) => n.active) : []
        setOutboundNumbers(available)
        setSelectedOutboundNumber(current => available.some((n: any) => n.number === current) ? current : available[0]?.number || '')
      }).catch(() => { setOutboundNumbers([]); setSelectedOutboundNumber('') })
    void refreshNumbers()
    // Sender authorization is rechecked on send; avoid background Voice polling.
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
    setCallType(inferSalesCallType(account))
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
      const requestId = smsRequestIdRef.current || crypto.randomUUID()
      smsRequestIdRef.current = requestId
      const response = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, contactId: primaryContact?.id || null, message, requestId, fromNumber: selectedOutboundNumber }),
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
      smsRequestIdRef.current = null
      notify("SMS accepted by Zoho Voice.", "success")
    } catch (err) {
      if (err instanceof Error && !/unknown|progress|ambiguous/i.test(err.message)) smsRequestIdRef.current = null
      notify(err instanceof Error ? err.message : "SMS was not sent.", "error")
    } finally {
      setIsSaving(false)
    }
  }, [smsText, accountId, primaryContact?.id, contactName, displayPhone, cleanPhone, notify, selectedOutboundNumber])

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
    return salesCallText({ type: callType, contactName, repName, facts: factFinding, purchaseNames: accountPurchases.map((p: any) => p.name).filter(Boolean) })
  }, [accountPurchases, contactName, repName, callType, factFinding])

  const getBladeRecommendations = useCallback(() => salesProductCandidates(factFinding), [factFinding])

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
