"use client"

import { inferSalesCallType, salesCallText, salesProductCandidates } from "@/lib/sales-call-flow"
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { EMPTY_FACT_FINDING, type FactFindingValues } from "@/components/FactFindingPanel"
import { type OrderLine } from "@/components/OrderBuilder"
import { toast } from 'react-hot-toast'
import { USE_ZDIALER } from '@/lib/zdialer'
import { prepareInAppCall } from '@/lib/internal-phone'
import type { AutodialerPlan } from '@/lib/autodialer-plan'

interface UseSalesCampaignDataProps {
  accounts: any[]
  onClose: () => void
  onRefresh: () => void
  autoStart?: boolean
  plan?: AutodialerPlan | null
}

export function useSalesCampaignData({ accounts, onClose, onRefresh, autoStart = false, plan = null }: UseSalesCampaignDataProps) {
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

  const [isPowerDialerActive, setIsPowerDialerActive] = useState(autoStart)
  const [isSavingDisposition, setIsSavingDisposition] = useState(false)

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
    prepareInAppCall(phone, { accountId: activeAccount?.id || activeAccount?.zohoId, accountName: activeAccount?.name })
    setIsPowerDialerActive(false)
    toast(USE_ZDIALER ? 'Review the number and continue with ZDialer in the communicator.' : 'Review the number and press Call in the in-app phone.')
    return true
  }, [activeAccount])

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

    setCallType(inferSalesCallType(activeAccount))

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
    if (plan?.callScript) {
      return plan.callScript
        .replaceAll("{{contactName}}", contactName)
        .replaceAll("{{accountName}}", activeAccount?.name || "your company")
        .replaceAll("{{repName}}", repName)
    }
    return salesCallText({ type: callType, contactName, repName, facts: factFinding, purchaseNames: accountPurchases.map((p: any) => p.name).filter(Boolean) })
  }, [plan, activeAccount, callType, contactName, repName, accountPurchases, factFinding])

  const getBladeRecommendation = useCallback(() => salesProductCandidates(factFinding), [factFinding])

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
    if (!activeAccount || isSavingDisposition) return;
    setIsSavingDisposition(true)
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
        if (plan && (plan.smsEnabled || plan.emailEnabled)) {
          const followupResponse = await fetch("/api/autodialer/schedule-followups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: activeAccount.id, contactId: activeAccount.dialerContactId || primaryContact?.id, plan }) })
          const followup = await followupResponse.json()
          if (!followupResponse.ok) {
            setIsPowerDialerActive(false)
            throw new Error(`Disposition saved, but follow-ups were not scheduled: ${followup.error || "unknown error"}`)
          }
          toast.success(`Disposition saved · ${followup.scheduled} follow-up${followup.scheduled === 1 ? "" : "s"} scheduled`)
        }
        handleNext()
      } else {
        toast.error(data.error || "Failed to log call outcome.")
      }
    } catch (e: any) {
      toast.error("Error logging call: " + e.message)
    } finally {
      setIsSavingDisposition(false)
    }
  }, [activeAccount, primaryContact?.id, isSavingDisposition, outcome, notes, repName, contactReached, spokeTo, followUpDate, currentUser?.id, factFinding, orderLines, plan, handleNext])

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
    isSavingDisposition,
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
