"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useZoho } from "@/components/ZohoProvider"
import {
  FiMail, FiSend, FiInbox, FiRefreshCw, FiChevronLeft, FiPlus,
  FiPaperclip, FiMoreVertical, FiCheck, FiX, FiCheckCircle, FiClock,
  FiAlertCircle, FiEdit, FiSearch, FiMessageCircle, FiChevronDown,
  FiBookOpen, FiZap
} from "react-icons/fi"
import { toast } from "react-hot-toast"
import { EmailSalesAssist } from "@/components/EmailSalesAssist"
import { isAdministratorRole } from "@/lib/roles"

export function EmailInbox({
  accountId,
  account,
  contacts,
  selectedContactId,
  campaignDraft,
}: {
  accountId?: string
  account?: any
  contacts?: any[]
  selectedContactId?: string
  campaignDraft?: { id: string; subject: string; body: string } | null
}) {
  const { zohoContext: currentUser } = useZoho()
  const canSync = isAdministratorRole(currentUser?.role)
  
  // State
  const emailRequest = useRef(0)
  const [search, setSearch] = useState('')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [emails, setEmails] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState<"Inbox" | "All" | "Needs Response" | "Sent" | "Archived">("Inbox")
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null)
  
  // Compose State
  const [isComposing, setIsComposing] = useState(Boolean(campaignDraft))
  const [composeTo, setComposeTo] = useState("")
  const [composeCc, setComposeCc] = useState("")
  const [composeSubject, setComposeSubject] = useState(campaignDraft?.subject || "")
  const [composeBody, setComposeBody] = useState(campaignDraft?.body || "")
  const [isSending, setIsSending] = useState(false)
  
  // Templates
  const [templates, setTemplates] = useState<any[]>([])
  const [showTemplates, setShowTemplates] = useState(false)

  const primaryContact = contacts?.find(c => c.id === selectedContactId) || contacts?.find(c => c.isPrimary) || contacts?.[0]

  useEffect(() => {
    setSelectedEmail(null)
    setEmails([]); setNextCursor(null)
    void fetchEmails()
    
    // Set default To address if composing
    if (primaryContact?.email) {
      setComposeTo(primaryContact.email)
    }
    return () => { emailRequest.current++ }
  }, [accountId, primaryContact, search, activeTab])
  useEffect(() => { void fetchTemplates() }, [])

  const fetchEmails = async (cursor?: string) => {
    const request = ++emailRequest.current
    setIsLoading(true)
    setLoadError('')
    try {
      const folder = activeTab === 'Inbox' ? 'inbox' : activeTab === 'Sent' ? 'sent' : activeTab === 'Archived' ? 'archived' : 'all'
      const params = new URLSearchParams({ folder, ...(accountId ? { accountId } : {}), ...(search ? { q: search } : {}), ...(cursor ? { cursor } : {}) })
      const url = `/api/emails?${params}`
      const res = await fetch(url)
      const data = await res.json()
      if (request === emailRequest.current && (!res.ok || !data.success)) throw new Error(data.error || 'Unable to load email history.')
      if (request === emailRequest.current && data.success) {
        setEmails(previous => cursor ? [...previous, ...(data.emails || []).filter((email: { id: string }) => !previous.some(old => old.id === email.id))] : data.emails || [])
        setNextCursor(data.nextCursor || null)
      }
    } catch (error) {
      if (request === emailRequest.current) setLoadError(error instanceof Error ? error.message : 'Unable to load email history.')
    } finally {
      if (request === emailRequest.current) setIsLoading(false)
    }
  }

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/emails/templates')
      const data = await res.json()
      if (data.success) {
        setTemplates(data.templates || [])
      }
    } catch (error) {
      console.error("Failed to fetch templates:", error)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const res = await fetch('/api/admin/email-intelligence/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      if (data.success) {
        toast.success("Email batch processed. History continues syncing automatically.")
        fetchEmails()
      } else {
        toast.error(data.error || data.results?.flatMap((r: { errors: string[] }) => r.errors).join("; ") || "Failed to sync emails")
      }
    } catch (error) {
      toast.error("Error syncing emails")
    } finally {
      setIsSyncing(false)
    }
  }

  const handleSend = async () => {
    if (!composeTo || !composeSubject || !composeBody) {
      toast.error("Please fill in all required fields")
      return
    }
    if (!window.confirm(`Send this email to ${composeTo}${composeCc ? ` with CC to ${composeCc}` : ""}?`)) return

    setIsSending(true)
    try {
      const payload = {
        accountId,
        contactId: primaryContact?.id,
        toAddress: composeTo,
        ccAddress: composeCc,
        subject: composeSubject,
        content: composeBody,
      }
      
      const res = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      
      if (data.success) {
        toast.success("Email sent!")
        setIsComposing(false)
        setComposeSubject("")
        setComposeBody("")
        fetchEmails()
      } else {
        toast.error(data.error || "Failed to send email")
      }
    } catch (error) {
      toast.error("Error sending email")
    } finally {
      setIsSending(false)
    }
  }

  const handleEditSuggestion = (suggestion: string) => {
    setIsComposing(true)
    setComposeTo(selectedEmail.direction === 'OUTBOUND' ? selectedEmail.toAddress : selectedEmail.fromAddress)
    setComposeSubject(`Re: ${selectedEmail.subject}`)
    setComposeBody(suggestion)
    setSelectedEmail(null)
  }

  const insertMergeTag = (tag: string) => {
    let value = tag
    if (tag === "{{contactName}}") value = primaryContact?.firstName || "Customer"
    if (tag === "{{accountName}}") value = account?.name || ""
    if (tag === "{{repName}}") value = currentUser?.name || "Your Rep"
    
    setComposeBody(prev => prev + value)
  }

  const applyTemplate = (template: any) => {
    let body = template.body || ""
    body = body.replace(/{{contactName}}/g, primaryContact?.firstName || "Customer")
    body = body.replace(/{{accountName}}/g, account?.name || "")
    body = body.replace(/{{repName}}/g, currentUser?.name || "Your Rep")
    
    setComposeSubject(template.subject || "")
    setComposeBody(body)
    setShowTemplates(false)
  }

  const filteredEmails = useMemo(() => {
    return emails.filter(e => {
      const status = String(e.status || "").toUpperCase()
      const direction = String(e.direction || "").toUpperCase()
      if (activeTab === "Inbox") return direction === 'INBOUND' && status !== 'ARCHIVED'
      if (activeTab === "Needs Response") return e.intelligenceNeedsResponse || e.needsResponse === true || status === "NEEDS_RESPONSE"
      if (activeTab === "Sent") return direction === "OUTBOUND"
      if (activeTab === "Archived") return status === "ARCHIVED"
      return true
    })
  }, [emails, activeTab])

  // Views
  if (isComposing) {
    return (
      <div className="flex flex-col h-full min-h-0 min-w-0 bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden animate-fade-in">
        <div className="flex shrink-0 flex-wrap gap-2 items-center justify-between p-2 border-b border-[var(--border)] bg-[var(--surface-2)]">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsComposing(false)}
              className="p-1.5 hover:bg-[var(--surface-3)] rounded-lg transition-colors text-[var(--muted)] hover:text-white"
            >
              <FiChevronLeft size={18} />
            </button>
            <h3 className="font-bold text-sm text-white">Compose Email</h3>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <button 
                onClick={() => setShowTemplates(!showTemplates)}
                className="td-btn td-btn-sm"
              >
                <FiBookOpen size={14} /> Templates
              </button>
              {showTemplates && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-[var(--surface-2)] border border-[var(--border-strong)] rounded-lg shadow-xl z-10 max-h-64 overflow-y-auto">
                  {templates.length > 0 ? templates.map(t => (
                    <button 
                      key={t.id}
                      onClick={() => applyTemplate(t)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-3)] text-white border-b border-[var(--border)] last:border-0"
                    >
                      <div className="font-semibold">{t.name}</div>
                      <div className="text-xs text-[var(--muted)] truncate">{t.subject}</div>
                    </button>
                  )) : (
                    <div className="p-4 text-xs text-[var(--muted)] text-center">No templates found</div>
                  )}
                </div>
              )}
            </div>
            <button 
              onClick={handleSend}
              disabled={isSending || !composeTo || !composeSubject}
              className="td-btn td-btn-primary td-btn-sm"
            >
              <FiSend size={14} /> {isSending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
        
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          <div>
            <input 
              type="text" 
              placeholder="To" 
              value={composeTo}
              onChange={e => setComposeTo(e.target.value)}
              className="td-input text-sm"
            />
          </div>
          <div>
            <input 
              type="text" 
              placeholder="CC (comma separated)"
              value={composeCc}
              onChange={e => setComposeCc(e.target.value)}
              className="td-input text-sm"
            />
          </div>
          <div>
            <input 
              type="text" 
              placeholder="Subject" 
              value={composeSubject}
              onChange={e => setComposeSubject(e.target.value)}
              className="td-input font-medium"
            />
          </div>
          
          <div className="flex flex-wrap gap-2 py-2 border-y border-[var(--border)]">
            <span className="text-xs text-[var(--muted)] flex items-center px-1">Merge Tags:</span>
            <button onClick={() => insertMergeTag("{{contactName}}")} className="px-2 py-1 bg-[var(--surface-3)] rounded text-xs text-[var(--muted)] hover:text-white transition-colors">{"{{Name}}"}</button>
            <button onClick={() => insertMergeTag("{{accountName}}")} className="px-2 py-1 bg-[var(--surface-3)] rounded text-xs text-[var(--muted)] hover:text-white transition-colors">{"{{Company}}"}</button>
            <button onClick={() => insertMergeTag("{{repName}}")} className="px-2 py-1 bg-[var(--surface-3)] rounded text-xs text-[var(--muted)] hover:text-white transition-colors">{"{{Rep}}"}</button>
          </div>
          
          <textarea 
            value={composeBody}
            onChange={e => setComposeBody(e.target.value)}
            className="w-full h-64 p-3 bg-transparent border border-[var(--border-strong)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--primary)] resize-none"
            placeholder="Write your email here..."
          />
        </div>
      </div>
    )
  }

  if (selectedEmail) {
    return (
      <div className="flex flex-col h-full min-h-0 min-w-0 bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden animate-fade-in">
        <div className="flex shrink-0 flex-wrap gap-2 items-center justify-between p-2 border-b border-[var(--border)] bg-[var(--surface-2)]">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setSelectedEmail(null)}
              aria-label="Back to email inbox"
              className="p-1.5 hover:bg-[var(--surface-3)] rounded-lg transition-colors text-[var(--muted)] hover:text-white"
            >
              <FiChevronLeft size={18} />
            </button>
            <h3 className="font-bold text-sm text-white truncate max-w-xs">{selectedEmail.subject}</h3>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => {
                setComposeTo(selectedEmail.direction === 'OUTBOUND' ? selectedEmail.toAddress : selectedEmail.fromAddress)
                setComposeSubject(`Re: ${selectedEmail.subject}`)
                setIsComposing(true)
                setSelectedEmail(null)
              }}
              className="td-btn td-btn-sm"
            >
              <FiMessageCircle size={14} /> Reply
            </button>
          </div>
        </div>
        
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          <div className="flex flex-wrap gap-2 justify-between items-start mb-6">
            <div>
              <div className="font-bold text-white break-all">{selectedEmail.fromName || selectedEmail.fromAddress}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">To: {selectedEmail.toAddress}</div>
              {selectedEmail.ccAddress && <div className="text-xs text-[var(--muted)]">Cc: {selectedEmail.ccAddress}</div>}
            </div>
            <div className="text-xs text-[var(--muted)] whitespace-nowrap">
              {new Date(selectedEmail.sentAt || selectedEmail.receivedAt || selectedEmail.timestamp || selectedEmail.createdAt).toLocaleString()}
            </div>
          </div>
          
          <div className="text-sm text-white whitespace-pre-wrap break-words leading-relaxed">
            {selectedEmail.body}
          </div>
          
          <EmailSalesAssist emailId={selectedEmail.id} linked={Boolean(selectedEmail.accountId)} onDraft={handleEditSuggestion} />
          {selectedEmail.suggestedReply && (
            <div className="mt-8 p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
              <div className="flex items-center gap-2 text-orange-400 font-bold text-xs mb-2 uppercase tracking-wider">
                <FiZap size={14} /> AI Suggested Reply
              </div>
              <div className="text-sm text-neutral-300 whitespace-pre-wrap mb-4">
                {selectedEmail.suggestedReply}
              </div>
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => handleEditSuggestion(selectedEmail.suggestedReply)}
                  className="td-btn td-btn-primary td-btn-sm"
                >
                  <FiEdit size={14} /> Review draft
                </button>
                <button 
                  onClick={() => handleEditSuggestion(selectedEmail.suggestedReply)}
                  className="td-btn td-btn-sm"
                >
                  <FiEdit size={14} /> Edit
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
      {/* Header */}
      <div className="p-2 border-b border-[var(--border)] flex shrink-0 flex-wrap gap-2 items-center justify-between bg-[var(--surface-2)]">
        <div className="flex items-center gap-2">
          <FiInbox className="text-[var(--primary)]" size={18} />
          <h2 className="font-bold text-white">Email Inbox</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void fetchEmails()} disabled={isLoading} className="td-btn td-btn-sm td-btn-ghost" aria-label="Refresh saved email inbox" title="Refresh saved email inbox"><FiRefreshCw size={14} /></button>
          {canSync && <button
            onClick={handleSync}
            disabled={isSyncing}
            className="td-btn td-btn-sm td-btn-ghost"
            title="Sync Now"
          >
            <FiRefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
          </button>}
          <button 
            onClick={() => setIsComposing(true)}
            className="td-btn td-btn-primary td-btn-sm"
          >
            <FiPlus size={14} /> Compose
          </button>
        </div>
      </div>

      <div className="shrink-0 p-2"><input aria-label="Search email history" placeholder="Search subject, sender or message" value={search} onChange={e => setSearch(e.target.value)} className="td-input" /></div>
      {/* Tabs */}
      <div className="flex shrink-0 overflow-x-auto border-b border-[var(--border)] px-2 bg-[var(--surface-2)]">
        {(["Inbox", "All", "Needs Response", "Sent", "Archived"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
              activeTab === tab 
                ? "border-[var(--primary)] text-white" 
                : "border-transparent text-[var(--muted)] hover:text-white"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {nextCursor && <button disabled={isLoading} onClick={() => void fetchEmails(nextCursor)} className="td-btn td-btn-sm shrink-0">Load older emails</button>}
      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 flex flex-col items-center justify-center text-[var(--muted)]">
            <div className="animate-spin mb-4"><FiRefreshCw size={24} /></div>
            <div className="text-sm">Loading emails...</div>
          </div>
        ) : loadError ? <div role="alert" className="p-4 text-amber-300">{loadError}<button className="td-btn mt-3" onClick={() => void fetchEmails()}>Retry inbox</button></div> : filteredEmails.length === 0 ? (
          <div className="p-8 flex flex-col items-center justify-center text-[var(--muted)] text-center h-full">
            <FiMail size={32} className="mb-3 opacity-50" />
            <div className="text-sm font-medium text-white mb-1">No emails found</div>
            <div className="text-xs">There are no emails matching this filter.</div>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filteredEmails.map(email => (
              <div 
                key={email.id} 
                onClick={() => setSelectedEmail(email)}
                role="button" tabIndex={0} aria-label={`Read email: ${email.subject || '(No Subject)'}`}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedEmail(email) } }}
                className="p-4 hover:bg-[var(--surface-2)] cursor-pointer transition-colors group flex gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-[var(--surface-3)] flex items-center justify-center shrink-0 text-xs font-bold text-white">
                  {(email.fromName || email.fromAddress || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm truncate ${email.isRead ? 'text-white' : 'text-white font-bold'}`}>
                      {email.fromName || email.fromAddress}
                    </span>
                    <span className="text-[10px] text-[var(--muted)] whitespace-nowrap ml-2">
                      {new Date(email.sentAt || email.receivedAt || email.timestamp || email.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className={`text-sm truncate mb-1 ${email.isRead ? 'text-neutral-300' : 'text-white font-semibold'}`}>
                    {email.subject || "(No Subject)"}
                  </div>
                  <div className="text-xs text-[var(--muted)] truncate">
                    {email.preview || email.body?.substring(0, 100) || "..."}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-2">
                  {(email.needsResponse === true || String(email.status || "").toUpperCase() === "NEEDS_RESPONSE") && (
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]" title="Needs Response"></span>
                  )}
                  {String(email.status || "").toUpperCase() === "REPLIED" && (
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" title="Replied"></span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
