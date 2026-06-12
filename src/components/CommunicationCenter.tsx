"use client"

import { useState, useEffect, useRef } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { 
  FiPhoneCall, FiMail, FiMessageSquare, FiCheckCircle, 
  FiAlertCircle, FiSend, FiMessageCircle 
} from "react-icons/fi"

type Message = {
  id: string
  sender: "rep" | "client"
  text: string
  timestamp: string
}



export function CommunicationCenter({ accountId, contacts }: { accountId: string, contacts?: any[] }) {
  const { zohoContext: currentUser } = useZoho()
  const [activeTab, setActiveTab] = useState<"CALL" | "SMS" | "EMAIL" | "WHATSAPP">("CALL")
  
  // Call States
  const [callOutcome, setCallOutcome] = useState("Connected")
  const [callNote, setCallNote] = useState("")
  const [reminderDate, setReminderDate] = useState("")

  // SMS States
  const [smsText, setSmsText] = useState("")
  const [chatMessages, setChatMessages] = useState<Message[]>([])

  // Other States
  const [emailText, setEmailText] = useState("")
  const [whatsappText, setWhatsappText] = useState("")
  
  const [isSaving, setIsSaving] = useState(false)
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  
  const chatEndRef = useRef<HTMLDivElement>(null)

  const primaryContact = contacts?.find(c => c.isPrimary) || contacts?.[0] || null
  const cleanPhone = primaryContact?.phone ? primaryContact.phone.replace(/[^0-9+]/g, '') : ''

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  // Handle tab switching events from other views
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

  const saveCallLog = async () => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/zoho-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'LOG_CALL',
          accountId,
          userId: currentUser?.id,
          userEmail: currentUser?.email,
          noteContent: `[Phone Call] Outcome: ${callOutcome}\n\n${callNote}`,
          sentiment: 'Positive',
          reminderDate
        })
      })
      if (response.ok) {
        setCallNote("")
        setReminderDate("")
        setNotification({ message: "Call logged successfully!", type: 'success' })
        setTimeout(() => setNotification(null), 4000)
      } else {
        setNotification({ message: "Failed to log call.", type: 'error' })
        setTimeout(() => setNotification(null), 4000)
      }
    } catch (e) {
      console.error(e)
      setNotification({ message: "An error occurred.", type: 'error' })
      setTimeout(() => setNotification(null), 4000)
    } finally {
      setIsSaving(false)
    }
  }

  // Send In-App SMS Simulation
  const sendInAppSMS = async () => {
    if (!smsText.trim()) return

    const newMsg: Message = {
      id: String(Date.now()),
      sender: "rep",
      text: smsText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setChatMessages(prev => [...prev, newMsg])
    setSmsText("")

    // Save to DB via API
    try {
      await fetch('/api/zoho-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SEND_SMS',
          accountId,
          userId: currentUser?.id,
          userEmail: currentUser?.email,
          noteContent: newMsg.text,
          sentiment: 'Neutral',
          reminderDate
        })
      })
    } catch (err) {
      console.error("Failed to sync SMS to CRM DB log:", err)
    }
  }

  const sendEmailLog = async () => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/zoho-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SEND_EMAIL',
          accountId,
          userId: currentUser?.id,
          userEmail: currentUser?.email,
          noteContent: emailText,
          sentiment: 'Neutral',
          reminderDate
        })
      })
      if (response.ok) {
        setEmailText("")
        setReminderDate("")
        setNotification({ message: "Email logged successfully!", type: 'success' })
        setTimeout(() => setNotification(null), 4000)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  const sendWhatsAppLog = async () => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/zoho-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SEND_WHATSAPP',
          accountId,
          userId: currentUser?.id,
          userEmail: currentUser?.email,
          noteContent: whatsappText,
          sentiment: 'Neutral',
          reminderDate
        })
      })
      if (response.ok) {
        setWhatsappText("")
        setReminderDate("")
        setNotification({ message: "WhatsApp message logged!", type: 'success' })
        setTimeout(() => setNotification(null), 4000)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6 h-full flex flex-col relative">
      {notification && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold animate-pulse ${
          notification.type === 'success'
            ? 'bg-emerald-900/30 border border-emerald-500/30 text-emerald-400'
            : 'bg-red-900/30 border border-red-500/30 text-red-400'
        }`}>
          {notification.type === 'success' ? <FiCheckCircle /> : <FiAlertCircle />}
          {notification.message}
        </div>
      )}
      
      <h2 className="text-xl font-semibold mb-2 text-blue-400 flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
        </svg>
        App Communications Center
      </h2>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-neutral-800 pb-2 overflow-x-auto flex-nowrap scrollbar-none">
        <button onClick={() => setActiveTab("CALL")} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'CALL' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}><FiPhoneCall /> Call</button>
        <button onClick={() => setActiveTab("SMS")} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'SMS' ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}><FiMessageCircle /> SMS</button>
        <button onClick={() => setActiveTab("EMAIL")} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'EMAIL' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}><FiMail /> Email</button>
        <button onClick={() => setActiveTab("WHATSAPP")} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'WHATSAPP' ? 'bg-green-500 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}><FiMessageSquare /> WhatsApp</button>
      </div>

      {/* Primary Contact Banner */}
      {primaryContact ? (
        <div className="p-4 bg-neutral-800/50 border border-neutral-700 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs text-neutral-400">Communicating with</div>
            <div className="font-bold text-base sm:text-lg text-white">{primaryContact.firstName} {primaryContact.lastName}</div>
            <div className="text-xs text-neutral-500 truncate max-w-[260px] font-mono">
              {activeTab === 'EMAIL' ? primaryContact.email : (
                cleanPhone ? (
                  <a href={`tel:${cleanPhone}`} className="hover:text-blue-400 transition-colors underline">{primaryContact.phone}</a>
                ) : primaryContact.phone
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-neutral-800/50 border border-neutral-700 rounded-lg text-neutral-400 text-sm">
          No contact on file
        </div>
      )}

      {/* ── CALL TAB ── */}
      {activeTab === "CALL" && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="space-y-4 flex-1 flex flex-col">
            {/* Click to Dial */}
            {cleanPhone ? (
              <div className="text-center py-4">
                <a
                  href={`tel:${cleanPhone}`}
                  className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-blue-900/50 text-base"
                >
                  <FiPhoneCall /> Click to Dial
                </a>
                <p className="text-xs text-neutral-500 mt-2 font-mono">{primaryContact?.phone}</p>
              </div>
            ) : (
              <div className="text-center py-4 text-neutral-500 text-sm">No phone number available</div>
            )}

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs font-semibold mb-1 block text-neutral-400">Call Outcome</label>
                <select value={callOutcome} onChange={e => setCallOutcome(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-sm focus:outline-none focus:border-blue-500 text-white">
                  <option value="Connected">Connected & Spoke with Customer</option>
                  <option value="Left Voicemail">Left Voicemail</option>
                  <option value="No Answer">No Answer / Busy</option>
                  <option value="Callback Requested">Callback Requested</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold mb-1 block text-neutral-400">Set Follow-up Reminder</label>
                <input type="date" value={reminderDate} onChange={e => setReminderDate(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-sm focus:outline-none focus:border-blue-500 text-neutral-300" />
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              <label className="text-xs font-semibold text-neutral-400 mb-1">Call Summary & Notes</label>
              <textarea 
                value={callNote}
                onChange={e => setCallNote(e.target.value)}
                className="w-full flex-1 bg-neutral-900 border border-neutral-700 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 text-white font-sans"
                placeholder="Notes from the call..."
              />
            </div>

            <div className="flex justify-end">
              <button 
                onClick={saveCallLog}
                disabled={isSaving || !callNote}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm rounded transition-colors shadow-lg"
              >
                {isSaving ? "Saving Note..." : "Save Note & Log Call"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SMS TAB ── */}
      {activeTab === "SMS" && (
        <div className="flex-1 flex flex-col bg-neutral-950 border border-neutral-800 rounded-xl p-4 min-h-[300px] justify-between overflow-hidden">
          {/* Scrollable messages box */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-4 scrollbar-thin max-h-[220px]">
            {chatMessages.map(msg => {
              const isRep = msg.sender === "rep"
              return (
                <div key={msg.id} className={`flex flex-col ${isRep ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-xs leading-relaxed ${
                    isRep ? 'bg-emerald-600 text-white rounded-tr-none' : 'bg-neutral-800 text-neutral-200 rounded-tl-none border border-neutral-700'
                  }`}>
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-neutral-500 mt-1 font-mono px-1">{msg.timestamp}</span>
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input form */}
          <div className="pt-3 border-t border-neutral-800 flex gap-2">
            <input 
              type="text" 
              value={smsText}
              onChange={e => setSmsText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendInAppSMS(); }}
              placeholder="Send text message..."
              className="flex-1 bg-neutral-900 border border-neutral-700 rounded-full px-4 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
            <button 
              onClick={sendInAppSMS}
              disabled={!smsText.trim()}
              className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center justify-center shadow-lg transition-colors"
            >
              <FiSend size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── EMAIL TAB ── */}
      {activeTab === "EMAIL" && (
        <div className="space-y-4 flex-1 flex flex-col">
          <div className="flex justify-between items-end mb-1">
            <label className="text-xs font-semibold text-neutral-400">Compose Email</label>
            <button onClick={() => setEmailText(`Hi ${primaryContact.firstName},\n\nHope you are doing well. Just wanted to follow up on the quote we prepared for you. Let me know if you would like me to process it.\n\nBest,\nTitan Diamond`)} className="text-xs text-purple-500 hover:text-purple-400 flex items-center gap-1">
              Load Template
            </button>
          </div>
          <textarea 
            value={emailText}
            onChange={e => setEmailText(e.target.value)}
            className="w-full flex-1 bg-neutral-900 border border-neutral-700 rounded-lg p-3 text-sm focus:outline-none focus:border-purple-500 text-white resize-none min-h-[150px]"
            placeholder="Write your email here..."
          />
          <div className="flex justify-end">
            <button 
              onClick={sendEmailLog}
              disabled={isSaving || !emailText}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-sm rounded transition-colors shadow-lg"
            >
              {isSaving ? "Logging..." : "Send Email"}
            </button>
          </div>
        </div>
      )}

      {/* ── WHATSAPP TAB ── */}
      {activeTab === "WHATSAPP" && (
        <div className="space-y-4 flex-1 flex flex-col">
          <div className="flex justify-between items-end mb-1">
            <label className="text-xs font-semibold text-neutral-400">Compose WhatsApp Message</label>
            <button onClick={() => setWhatsappText(`Hello ${primaryContact.firstName}! 🚀 We have a new promotion running this week. Please let me know if you are interested!`)} className="text-xs text-green-500 hover:text-green-400 flex items-center gap-1">
              Load Template
            </button>
          </div>
          <textarea 
            value={whatsappText}
            onChange={e => setWhatsappText(e.target.value)}
            className="w-full flex-1 bg-neutral-900 border border-neutral-700 rounded-lg p-3 text-sm focus:outline-none focus:border-green-500 text-white resize-none min-h-[150px]"
            placeholder="Write your WhatsApp message..."
          />
          <div className="flex justify-end">
            <button 
              onClick={sendWhatsAppLog}
              disabled={isSaving || !whatsappText}
              className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold text-sm rounded transition-colors shadow-lg"
            >
              {isSaving ? "Logging..." : "Send WhatsApp"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
