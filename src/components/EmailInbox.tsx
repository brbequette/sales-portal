"use client"

import { useState, useEffect, useMemo } from "react"
import { useZoho } from "@/components/ZohoProvider"
import {
  FiMail, FiSend, FiInbox, FiRefreshCw, FiChevronLeft, FiPlus,
  FiPaperclip, FiMoreVertical, FiCheck, FiX, FiCheckCircle, FiClock,
  FiAlertCircle, FiEdit, FiSearch, FiMessageCircle, FiChevronDown,
  FiBookOpen, FiZap
} from "react-icons/fi"
import { toast } from "react-hot-toast"

export function EmailInbox({
  accountId,
  account,
  contacts
}: {
  accountId?: string
  account?: any
  contacts?: any[]
}) {
  const { zohoContext: currentUser } = useZoho()
  
  // State
  const [emails, setEmails] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState<"All" | "Needs Response" | "Sent" | "Archived">("All")
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null)
  
  // Compose State
  const [isComposing, setIsComposing] = useState(false)
  const [composeTo, setComposeTo] = useState("")
  const [composeCc, setComposeCc] = useState("")
  const [composeSubject, setComposeSubject] = useState("")
  const [composeBody, setComposeBody] = useState("")
  const [isSending, setIsSending] = useState(false)
  
  // Templates
  const [templates, setTemplates] = useState<any[]>([])
  const [showTemplates, setShowTemplates] = useState(false)

  const primaryContact = contacts?.find(c => c.isPrimary) || contacts?.[0]

  useEffect(() => {
    fetchEmails()
    fetchTemplates()
    
    // Set default To address if composing
    if (primaryContact?.email) {
      setComposeTo(primaryContact.email)
    }
  }, [accountId, primaryContact])

  const fetchEmails = async () => {
    setIsLoading(true)
    try {
      const url = accountId ? `/api/emails?accountId=${accountId}` : '/api/emails'
      const res = await fetch(url)
      const data = await res.json()
      if (data.success) {
        setEmails(data.emails || [])
      }
    } catch (error) {
      console.error("Failed to fetch emails:", error)
    } finally {
      setIsLoading(false)
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
      const res = await fetch('/api/emails/sync', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        toast.success("Emails synced successfully")
        fetchEmails()
      } else {
        toast.error("Failed to sync emails")
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

    setIsSending(true)
    try {
      const payload = {
        accountId,
        toAddress: composeTo,
        ccAddress: composeCc,
        subject: composeSubject,
        body: composeBody,
        fromAddress: currentUser?.email
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

  const handleAcceptResponse = async (emailId: string, responseBody: string) => {
    try {
      // Send the email first
      const payload = {
        accountId,
        toAddress: selectedEmail.fromAddress,
        subject: `Re: ${selectedEmail.subject}`,
        body: responseBody,
        fromAddress: currentUser?.email
      }
      
      const res = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      const data = await res.json()
      
      if (data.success) {
        // Mark suggested response as accepted
        await fetch('/api/emails/accept-response', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailId, responseBody })
        })
        
        toast.success("Response sent!")
        fetchEmails()
        setSelectedEmail(null)
      } else {
        toast.error("Failed to send response")
      }
    } catch (error) {
      toast.error("Error sending response")
    }
  }
  
  const handleEditSuggestion = (suggestion: string) => {
    setIsComposing(true)
    setComposeTo(selectedEmail.fromAddress)
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
      if (activeTab === "Needs Response") return e.status === "needs_response"
      if (activeTab === "Sent") return e.direction === "outbound"
      if (activeTab === "Archived") return e.status === "archived"
      return true
    })
  }, [emails, activeTab])

  // Views
  if (isComposing) {
    return (
      <div className="flex flex-col h-full bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--surface-2)]">
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
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
              placeholder="Cc/Bcc (comma separated)" 
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
          
          <div className="flex gap-2 py-2 border-y border-[var(--border)]">
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
      <div className="flex flex-col h-full bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--surface-2)]">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setSelectedEmail(null)}
              className="p-1.5 hover:bg-[var(--surface-3)] rounded-lg transition-colors text-[var(--muted)] hover:text-white"
            >
              <FiChevronLeft size={18} />
            </button>
            <h3 className="font-bold text-sm text-white truncate max-w-xs">{selectedEmail.subject}</h3>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => {
                setComposeTo(selectedEmail.fromAddress)
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
        
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="font-bold text-white">{selectedEmail.fromName || selectedEmail.fromAddress}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">To: {selectedEmail.toAddress}</div>
              {selectedEmail.ccAddress && <div className="text-xs text-[var(--muted)]">Cc: {selectedEmail.ccAddress}</div>}
            </div>
            <div className="text-xs text-[var(--muted)] whitespace-nowrap">
              {new Date(selectedEmail.timestamp || selectedEmail.createdAt).toLocaleString()}
            </div>
          </div>
          
          <div className="text-sm text-white whitespace-pre-wrap leading-relaxed">
            {selectedEmail.body}
          </div>
          
          {selectedEmail.suggestedReply && (
            <div className="mt-8 p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
              <div className="flex items-center gap-2 text-orange-400 font-bold text-xs mb-2 uppercase tracking-wider">
                <FiZap size={14} /> AI Suggested Reply
              </div>
              <div className="text-sm text-neutral-300 whitespace-pre-wrap mb-4">
                {selectedEmail.suggestedReply}
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleAcceptResponse(selectedEmail.id, selectedEmail.suggestedReply)}
                  className="td-btn td-btn-primary td-btn-sm"
                >
                  <FiSend size={14} /> Accept & Send
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
    <div className="flex flex-col h-full bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-2)]">
        <div className="flex items-center gap-2">
          <FiInbox className="text-[var(--primary)]" size={18} />
          <h2 className="font-bold text-white">Email Inbox</h2>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleSync}
            disabled={isSyncing}
            className="td-btn td-btn-sm td-btn-ghost"
            title="Sync Now"
          >
            <FiRefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
          </button>
          <button 
            onClick={() => setIsComposing(true)}
            className="td-btn td-btn-primary td-btn-sm"
          >
            <FiPlus size={14} /> Compose
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] px-2 bg-[var(--surface-2)]">
        {(["All", "Needs Response", "Sent", "Archived"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
              activeTab === tab 
                ? "border-[var(--primary)] text-white" 
                : "border-transparent text-[var(--muted)] hover:text-white"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 flex flex-col items-center justify-center text-[var(--muted)]">
            <div className="animate-spin mb-4"><FiRefreshCw size={24} /></div>
            <div className="text-sm">Loading emails...</div>
          </div>
        ) : filteredEmails.length === 0 ? (
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
                      {new Date(email.timestamp || email.createdAt).toLocaleDateString()}
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
                  {email.status === "needs_response" && (
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]" title="Needs Response"></span>
                  )}
                  {email.status === "replied" && (
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
