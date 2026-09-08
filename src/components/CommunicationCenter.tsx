"use client"

import { useEffect, useState } from "react"

/**
 * CommunicationCenter.tsx
 *
 * Unified communication & sales hub for the Account page.
 * All state and business logic lives in useCommunicationData hook.
 * This file is purely rendering (~560 lines).
 */

import {
  FiPhoneCall, FiMail, FiMessageSquare, FiCheckCircle,
  FiAlertCircle, FiSend, FiMessageCircle, FiBookOpen,
  FiZap, FiPackage, FiDollarSign, FiActivity, FiShoppingCart,
  FiFileText, FiTrendingUp, FiPlus, FiSearch, FiChevronDown,
  FiChevronRight, FiLoader, FiTag, FiClock
} from "react-icons/fi"
import { CallScriptViewer } from "./CallScriptViewer"
import { FactFindingPanel, FactFindingSummary } from "@/components/FactFindingPanel"
import { OrderBuilder } from "@/components/OrderBuilder"
import { PhoneLink } from "@/components/PhoneLink"
import { EmailInbox } from "@/components/EmailInbox"
import { useCommunicationData } from "./useCommunicationData"
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'

// â”â”â” Sub-tab config â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

const CALL_SUB_TABS = [
  { key: "LOG", icon: <FiPhoneCall size={11} />, label: "Log" },
  { key: "SCRIPT", icon: <FiBookOpen size={11} />, label: "Script" },
  { key: "FACT", icon: <FiActivity size={11} />, label: "Fact-Finding" },
  { key: "PRODUCTS", icon: <FiTag size={11} />, label: "Products" },
  { key: "INTEL", icon: <FiFileText size={11} />, label: "Intel" },
  { key: "ORDER", icon: <FiShoppingCart size={11} />, label: "Order" },
  { key: "AI", icon: <FiZap size={11} />, label: "AI" },
] as const

const tierColors: Record<string, string> = {
  Good: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  Better: "bg-amber-500/10 border-amber-500/20 text-amber-400",
  Best: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
}

type SavedCampaignTemplate = {
  id: string
  name: string
  content: string
  channel: string
  imageUrl?: string | null
}

// â”â”â” Main Component â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

export function CommunicationCenter({
  accountId,
  account,
  contacts,
  selectedContactId,
  onContactChange,
}: {
  accountId: string
  account?: any
  contacts?: any[]
  selectedContactId?: string
  onContactChange?: (contactId: string) => void
}) {
  const data = useCommunicationData({ accountId, account, contacts, selectedContactId })
  const {
    currentUser, repName,
    activeTab, setActiveTab, callSubTab, setCallSubTab,
    callOutcome, setCallOutcome, callNote, setCallNote,
    spokeTo, setSpokeTo, reminderDate, setReminderDate, callType, setCallType,
    factFinding, setFactFinding,
    smsText, setSmsText, chatMessages,
    outboundNumbers, selectedOutboundNumber, setSelectedOutboundNumber,
    emailText, setEmailText, whatsappText, setWhatsappText,
    aiPrompt, setAiPrompt, aiType, setAiType, aiChannel, setAiChannel,
    aiResult, setAiResult, isGeneratingAi,
    defaultVigRate, commissionPct, orderLines, setOrderLines,
    catalogProducts, productSearch, setProductSearch,
    showProductDropdown, setShowProductDropdown, productSearchRef,
    accountPurchases, accountNotes, accountDetail,
    isLoadingIntel, intelTab, setIntelTab,
    expandedPitch, setExpandedPitch, topBladeProducts,
    isSaving, notification, scriptText, setScriptText, showScript, setShowScript,
    chatEndRef, primaryContact, displayPhone, cleanPhone, contactName,
    orderFinancials, filteredProducts,
    notify, saveCallLog, sendSMS, sendEmailLog, sendWhatsAppLog,
    handleGenerateAi, addProductToOrder,
    generateScript, getBladeRecommendations,
  } = data

  const bladeRecs = getBladeRecommendations()
  const [campaignTemplates, setCampaignTemplates] = useState<SavedCampaignTemplate[]>([])
  const [emailCampaignDraft, setEmailCampaignDraft] = useState<{ id: string; subject: string; body: string } | null>(null)

  useEffect(() => {
    let active = true
    fetch("/api/campaign-templates", { cache: "no-store" })
      .then(async response => response.ok ? response.json() : null)
      .then(payload => { if (active && payload?.success) setCampaignTemplates(payload.templates || []) })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  const loadCampaign = (templateId: string) => {
    const template = campaignTemplates.find(item => item.id === templateId)
    if (!template) return
    const copy = template.content
      .replace(/{{contactName}}/g, contactName || "Customer")
      .replace(/{{accountName}}/g, account?.name || "")
      .replace(/{{repName}}/g, repName || "Your Rep")
    const channel = template.channel.toUpperCase()
    if (channel === "EMAIL") {
      setEmailCampaignDraft({ id: `${template.id}-${Date.now()}`, subject: template.name, body: copy })
      setActiveTab("EMAIL")
    } else if (channel === "POSTAL") {
      window.dispatchEvent(new CustomEvent("titan:postal-campaign", { detail: { subject: template.name, body: copy } }))
    } else if (channel === "PHONE" || channel === "VOICE") {
      setScriptText(copy)
      setShowScript(true)
      setCallSubTab("SCRIPT")
      setActiveTab("CALL")
    } else {
      setSmsText(copy)
      setActiveTab("SMS")
    }
  }



// Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬ Types Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬

type Message = {
  id: string
  sender: "rep" | "client"
  text: string
  timestamp: string
}
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

      {campaignTemplates.length > 0 && (
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-cyan-300">Load saved campaign or flyer copy</label>
          <select defaultValue="" onChange={event => { loadCampaign(event.target.value); event.currentTarget.value = "" }} className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500">
            <option value="" disabled>Select content and open its communication tool…</option>
            {campaignTemplates.map(template => <option key={template.id} value={template.id}>{template.name} · {template.channel}</option>)}
          </select>
          <p className="mt-1 text-[10px] text-neutral-500">Flyer artwork stays with the saved campaign; direct text messaging currently loads the copy only.</p>
        </div>
      )}

      {/* Primary Contact Banner */}
      {primaryContact ? (
        <div className="p-3 bg-neutral-800/50 border border-neutral-700 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-[10px] text-neutral-400 uppercase tracking-wider font-bold">Communicating with</div>
            {contacts && contacts.length > 1 && onContactChange ? <select value={primaryContact.id} onChange={event => onContactChange(event.target.value)} className="my-1 rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm font-bold text-white outline-none focus:border-cyan-500">{contacts.map(contact => <option key={contact.id} value={contact.id}>{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed contact"}{contact.isPrimary ? " · Primary" : ""}</option>)}</select> : <div className="font-bold text-base text-white">{primaryContact.firstName} {primaryContact.lastName}</div>}
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

      {/* Ã¢"â‚¬Ã¢"â‚¬ Channel Tabs Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬ */}
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

      {/* Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
          CALL TAB -- with all 7 sub-panels
      Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â */}
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

          {/* Ã¢"â‚¬Ã¢"â‚¬ LOG sub-tab Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬ */}
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

          {/* Ã¢"â‚¬Ã¢"â‚¬ SCRIPT sub-tab Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬ */}
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
                      {t === "cold" ? "âš¡ Cold Call" : "ðŸ”„ Follow-Up"}
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

          {/* Ã¢"â‚¬Ã¢"â‚¬ FACT-FINDING sub-tab Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬ */}
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

          {/* Ã¢"â‚¬Ã¢"â‚¬ PRODUCTS sub-tab Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬ */}
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

          {/* Ã¢"â‚¬Ã¢"â‚¬ INTEL sub-tab Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬ */}
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
                <div className="space-y-4 py-4">
                  <Skeleton rows={4} />
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
                              <div className="font-black text-xs text-emerald-400">Ã—{p.quantity || 0}</div>
                              {p.totalSpend > 0 && <div className="text-[10px] text-neutral-400">${(p.totalSpend || 0).toLocaleString()}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-6">
                        <EmptyState icon={<FiShoppingCart size={24} />} title="No purchase history found" description="" />
                      </div>
                    )
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
                    ) : (
                      <div className="py-6">
                        <EmptyState icon={<FiFileText size={24} />} title="No notes found" description="" />
                      </div>
                    )
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
                    ) : (
                      <div className="py-6">
                        <EmptyState icon={<FiDollarSign size={24} />} title="No invoices found" description="" />
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* Ã¢"â‚¬Ã¢"â‚¬ ORDER sub-tab Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬ */}
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

          {/* Ã¢"â‚¬Ã¢"â‚¬ AI sub-tab Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬ */}
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
                      Ã¢â€ ' Send as Email
                    </button>
                    <button
                      onClick={() => { setSmsText(aiResult); setActiveTab("SMS") }}
                      className="px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-bold hover:bg-emerald-600/30 transition-colors"
                    >
                      Ã¢â€ ' Send as SMS
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
          SMS TAB
      Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â */}
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
              <div className="py-8">
                <EmptyState icon={<FiMessageSquare size={32} />} title="No messages yet" description="Start the conversation below" />
              </div>
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

      {/* Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
          EMAIL TAB
      Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â */}
      {activeTab === "EMAIL" && (
        <div className="flex-1 flex flex-col min-h-0">
          <EmailInbox key={`${emailCampaignDraft?.id || "account-email"}-${primaryContact?.id || "primary"}`} accountId={accountId} account={account} contacts={contacts} selectedContactId={primaryContact?.id} campaignDraft={emailCampaignDraft} />
        </div>
      )}

      {/* Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
          WHATSAPP TAB
      Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â */}
      {activeTab === "WHATSAPP" && (
        <div className="flex-1 flex flex-col gap-3">
          <div className="flex justify-between items-end">
            <label className="text-xs font-semibold text-neutral-400">Compose WhatsApp Message</label>
            <button
              onClick={() => setWhatsappText(`Hello ${primaryContact?.firstName}! ðŸš€ We have a new promotion running this week. Please let me know if you are interested!`)}
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

