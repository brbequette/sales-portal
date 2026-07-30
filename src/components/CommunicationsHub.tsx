"use client"

import { useState, useEffect } from "react"
import { FiList, FiFileText, FiMessageSquare, FiPhone, FiMail, FiClock, FiCpu } from "react-icons/fi"
import { useSession } from "next-auth/react"
import { toast } from "react-hot-toast"
import { SaleCommunications } from "./SaleCommunications"
import { AccountDialer } from "./AccountDialer"

interface CommunicationsHubProps {
  accountId: string
  dealId?: string
  account?: any
  contacts?: any[]
}

type TabType = "ALL" | "NOTES" | "SMS" | "CALLS" | "EMAILS"

export function CommunicationsHub({ accountId, dealId, account, contacts }: CommunicationsHubProps) {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<TabType>("ALL")
  const [communications, setCommunications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Notes Form State
  const [newNoteText, setNewNoteText] = useState("")
  const [savingNote, setSavingNote] = useState(false)

  // SMS Form State
  const [smsText, setSmsText] = useState("")
  const [sendingSms, setSendingSms] = useState(false)

  const fetchComms = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/get-sale-communications?zohoId=${encodeURIComponent(dealId || accountId)}`)
      const data = await res.json()
      if (data.success) {
        setCommunications(data.communications || [])
      }
    } catch (err) {
      console.error("Failed to fetch communications:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchComms()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, dealId, refreshTrigger])

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNoteText.trim()) return

    setSavingNote(true)
    try {
      const res = await fetch("/api/add-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          content: newNoteText,
          userId: session?.user?.id || (session?.user as any)?.zohoId,
          userEmail: session?.user?.email
        })
      })
      const data = await res.json()
      if (data.success) {
        toast.success("Note saved successfully")
        setNewNoteText("")
        setRefreshTrigger(prev => prev + 1)
      } else {
        toast.error(data.error || "Failed to save note")
      }
    } catch (err: any) {
      console.error(err)
      toast.error("Error saving note")
    } finally {
      setSavingNote(false)
    }
  }

  const handleSendSms = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!smsText.trim()) return

    setSendingSms(true)
    try {
      const res = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          message: smsText,
          userId: session?.user?.id || (session?.user as any)?.zohoId,
          userEmail: session?.user?.email
        })
      })
      const data = await res.json()
      if (data.success) {
        toast.success("SMS sent successfully")
        setSmsText("")
        setRefreshTrigger(prev => prev + 1)
      } else {
        toast.error(data.error || "Failed to send SMS")
      }
    } catch (err: any) {
      console.error(err)
      toast.error("Error sending SMS")
    } finally {
      setSendingSms(false)
    }
  }

  // Filter communication types from unified feed
  const notes = communications.filter(c => c.type === "NOTE")
  const sms = communications.filter(c => c.type === "SMS")

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "ALL", label: "All Activity", icon: <FiList size={14} /> },
    { id: "NOTES", label: "Notes", icon: <FiFileText size={14} /> },
    { id: "SMS", label: "SMS", icon: <FiMessageSquare size={14} /> },
    { id: "CALLS", label: "Calls", icon: <FiPhone size={14} /> },
    { id: "EMAILS", label: "Emails", icon: <FiMail size={14} /> },
  ]

  return (
    <div className="flex flex-col h-full bg-black/20 text-white border border-white/10 rounded-xl overflow-hidden shadow-xl">
      {/* Header Tabs */}
      <div className="flex space-x-1 border-b border-white/10 glass-panel/50 p-2 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-neutral-800 text-white shadow-sm border border-neutral-700"
                : "text-neutral-500 hover:text-neutral-300 hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/50 border border-transparent"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {activeTab === "ALL" && (
          <SaleCommunications
            zohoId={dealId || accountId}
            communications={communications}
            loading={loading}
            onRefresh={fetchComms}
          />
        )}
        
        {activeTab === "NOTES" && (
          <div className="space-y-6">
            {/* New Note Form */}
            <form onSubmit={handleSaveNote} className="glass-panel border border-white/10 rounded-xl p-4 shadow-sm space-y-3">
              <div className="text-xs uppercase font-bold tracking-widest text-neutral-400">Add Account Note</div>
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Write a note details here..."
                rows={3}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 resize-none"
                disabled={savingNote}
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingNote || !newNoteText.trim()}
                  className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all duration-150"
                >
                  {savingNote ? "Saving Note..." : "Save Note"}
                </button>
              </div>
            </form>

            {/* Notes List */}
            {loading && notes.length === 0 ? (
              <div className="flex justify-center items-center py-10">
                <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-neutral-500 gap-3">
                <FiFileText size={32} className="opacity-40" />
                <span className="text-sm font-semibold">No notes for this account.</span>
              </div>
            ) : (
              <div className="space-y-4">
                {notes.map((note) => (
                  <div key={note.id} className="glass-panel border border-white/10 rounded-xl p-4 shadow-sm bg-amber-500/5">
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-xs text-amber-400/80 font-bold">
                        Written by {note.authorName}
                      </div>
                      <div className="text-xs text-neutral-500 flex items-center gap-1 font-semibold">
                        <FiClock size={12} />
                        {new Date(note.createdAt).toLocaleString(undefined, {
                          month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
                        })}
                      </div>
                    </div>
                    <div className="text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
                      {note.body}
                    </div>
                    {note.isAutoGenerated && (
                      <span className="text-[10px] text-amber-500/60 uppercase tracking-widest font-bold mt-2 flex items-center gap-1 select-none">
                        <FiCpu size={10} /> Auto-Generated System Note
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {activeTab === "SMS" && (
          <div className="flex flex-col h-[500px]">
            {/* Messages Thread */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1 scrollbar-thin">
              {loading && sms.length === 0 ? (
                <div className="flex justify-center items-center h-full">
                  <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : sms.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-neutral-500 gap-3 h-full">
                  <FiMessageSquare size={32} className="opacity-40" />
                  <span className="text-sm font-semibold">No SMS messages yet.</span>
                </div>
              ) : (
                sms.slice().reverse().map((msg) => {
                  const isOutbound = msg.direction === "OUTBOUND"
                  return (
                    <div key={msg.id} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm border ${
                        isOutbound
                          ? "bg-blue-600/20 border-blue-500/30 text-white rounded-br-none"
                          : "bg-neutral-800/60 border-neutral-700/40 text-neutral-200 rounded-bl-none"
                      }`}>
                        <div className="text-[10px] text-neutral-400 font-semibold mb-1">
                          {isOutbound ? msg.authorName || "Agent" : "Customer"}
                        </div>
                        <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.body}</div>
                        <div className="text-[9px] text-neutral-500 text-right mt-1 font-mono">
                          {new Date(msg.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            {/* Input Form */}
            <form onSubmit={handleSendSms} className="flex gap-2 pt-3 border-t border-white/10">
              <input
                type="text"
                value={smsText}
                onChange={(e) => setSmsText(e.target.value)}
                placeholder="Type SMS message..."
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500/50"
                disabled={sendingSms}
              />
              <button
                type="submit"
                disabled={sendingSms || !smsText.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all duration-150 flex items-center gap-1.5 whitespace-nowrap"
              >
                {sendingSms ? "Sending..." : "Send"}
              </button>
            </form>
          </div>
        )}
        
        {activeTab === "CALLS" && (
          <div className="h-[600px] border border-white/10 rounded-xl overflow-hidden">
             <AccountDialer accountId={accountId} account={account} contacts={contacts || []} />
          </div>
        )}
        
        {activeTab === "EMAILS" && (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-500 gap-3">
            <FiMail size={32} className="opacity-40" />
            <span className="text-sm font-semibold">Emails History</span>
            <p className="text-xs text-neutral-600">No emails exchanged with this account yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}

