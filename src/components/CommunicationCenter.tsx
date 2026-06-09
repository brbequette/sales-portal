"use client"

import { useState } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { FiPhoneCall, FiMail, FiMessageSquare, FiFileText, FiCheckCircle, FiAlertCircle } from "react-icons/fi"

export function CommunicationCenter({ accountId, contacts }: { accountId: string, contacts?: any[] }) {
  const { zohoContext: currentUser } = useZoho()
  const [activeTab, setActiveTab] = useState<"CALL" | "SMS" | "EMAIL" | "WHATSAPP">("CALL")
  const [note, setNote] = useState("")
  const [outcome, setOutcome] = useState("Connected")
  const [reminderDate, setReminderDate] = useState("")
  const [isCalling, setIsCalling] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const primaryContact = contacts?.find(c => c.isPrimary) || contacts?.[0] || { firstName: 'Customer', phone: '(555) 123-4567', email: 'contact@customer.com' }
  const cleanPhone = primaryContact.phone ? primaryContact.phone.replace(/[^0-9+]/g, '') : ''

  const templates = {
    CALL: `Hey ${primaryContact.firstName}, this is ${currentUser?.name || 'your rep'} from Titan Diamond. Calling to check in...`,
    SMS: `Hey ${primaryContact.firstName}, checking in on your Titan Diamond order. Need any blades today? Reply or call me back!`,
    EMAIL: `Hi ${primaryContact.firstName},\n\nI noticed it's been a while since your last order. We just got a new batch of Premium Turbo Blades in stock. Let me know if you want me to set aside a box for you!\n\nBest,\nTitan Diamond Sales`,
    WHATSAPP: `Hello ${primaryContact.firstName}! 🚀 Titan Diamond has some new promos running this week. Would you like me to send over the PDF?`
  }

  const handleAction = async () => {
    setIsSaving(true)
    try {
      // Simulate sending/logging via API
      const response = await fetch('/api/zoho-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: activeTab === 'CALL' ? 'LOG_CALL' : `SEND_${activeTab}`,
          accountId,
          userId: currentUser?.id,
          userEmail: currentUser?.email,
          noteContent: `[${activeTab}] Outcome: ${outcome}\nNote/Message: ${note}\nFollow-up: ${reminderDate || 'None'}`,
          sentiment: 'Neutral',
          reminderDate
        })
      })
      if (response.ok) {
        setNote("")
        setReminderDate("")
        setNotification({ message: `${activeTab} logged successfully!`, type: 'success' })
        setTimeout(() => setNotification(null), 4000)
      } else {
        setNotification({ message: `Failed to log ${activeTab}. Please try again.`, type: 'error' })
        setTimeout(() => setNotification(null), 4000)
      }
    } catch (e) {
      console.error(e)
      setNotification({ message: 'An error occurred. Please try again.', type: 'error' })
      setTimeout(() => setNotification(null), 4000)
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
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
        Omni-Channel Center
      </h2>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-neutral-800 pb-2 overflow-x-auto flex-nowrap scrollbar-none">
        <button onClick={() => { setActiveTab("CALL"); setNote(""); }} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'CALL' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}><FiPhoneCall /> Call</button>
        <button onClick={() => { setActiveTab("SMS"); setNote(templates.SMS); }} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'SMS' ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}><FiMessageSquare /> SMS</button>
        <button onClick={() => { setActiveTab("EMAIL"); setNote(templates.EMAIL); }} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'EMAIL' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}><FiMail /> Email</button>
        <button onClick={() => { setActiveTab("WHATSAPP"); setNote(templates.WHATSAPP); }} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'WHATSAPP' ? 'bg-green-500 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}><FiMessageSquare /> WhatsApp</button>
      </div>

      {/* Primary Contact Info */}
      <div className="p-4 bg-neutral-800/50 border border-neutral-700 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-xs text-neutral-400">Communicating with</div>
          <div className="font-bold text-base sm:text-lg text-white">{primaryContact.firstName} {primaryContact.lastName}</div>
          <div className="text-xs text-neutral-500 truncate max-w-[260px]">{activeTab === 'EMAIL' ? primaryContact.email : primaryContact.phone}</div>
        </div>
        
        {activeTab === 'CALL' && (
          <a 
            href={cleanPhone ? `tel:${cleanPhone}` : undefined}
            onClick={() => setIsCalling(!isCalling)}
            className={`px-6 py-2 rounded font-bold transition-colors shadow-lg w-full sm:w-auto block text-center ${
              isCalling ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/50' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/50'
            } ${!cleanPhone ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
          >
            {isCalling ? 'End Call' : 'Dial Now'}
          </a>
        )}
      </div>

      {isCalling && activeTab === 'CALL' && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/50 rounded flex items-center gap-3 animate-pulse">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <span className="text-sm text-blue-300">Call connected. AI recording & transcribing...</span>
        </div>
      )}

      {/* Compose/Notes Area */}
      <div className="flex-1 flex flex-col space-y-3">
        {activeTab === 'CALL' ? (
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs font-semibold mb-1 block text-neutral-400">Call Outcome</label>
              <select value={outcome} onChange={e => setOutcome(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-sm focus:outline-none focus:border-blue-500 text-white">
                <option value="Connected">Connected</option>
                <option value="Left Voicemail">Left Voicemail</option>
                <option value="No Answer">No Answer</option>
                <option value="Gatekeeper">Gatekeeper Blocked</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold mb-1 block text-neutral-400">Set Reminder</label>
              <input type="date" value={reminderDate} onChange={e => setReminderDate(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-sm focus:outline-none focus:border-blue-500 text-neutral-300" />
            </div>
          </div>
        ) : (
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs font-semibold mb-1 block text-neutral-400">Set Follow-up Reminder</label>
              <input type="date" value={reminderDate} onChange={e => setReminderDate(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-sm focus:outline-none focus:border-emerald-500 text-neutral-300" />
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col">
          <div className="flex justify-between items-end mb-1">
            <label className="text-xs font-semibold text-neutral-400">
              {activeTab === 'CALL' ? 'Call Notes & Next Steps' : 'Message Content'}
            </label>
            {activeTab !== 'CALL' && (
              <button onClick={() => setNote(templates[activeTab])} className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1">
                <FiFileText /> Load Template
              </button>
            )}
          </div>
          <textarea 
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full flex-1 bg-neutral-900 border border-neutral-700 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 text-white resize-none"
            placeholder={activeTab === 'CALL' ? "Type notes here during the call..." : "Type your message..."}
          ></textarea>
        </div>
        <div className="mt-2 flex justify-end">
          <button 
            onClick={handleAction}
            disabled={isSaving || (activeTab !== 'CALL' && !note)}
            className={`px-6 py-2 rounded text-sm font-bold transition-colors disabled:opacity-50 shadow-lg ${
              activeTab === 'CALL' ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/50' : 
              activeTab === 'SMS' ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/50' : 
              activeTab === 'EMAIL' ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/50' : 
              'bg-green-500 hover:bg-green-400 text-white shadow-green-900/50'
            }`}
          >
            {isSaving ? 'Processing...' : activeTab === 'CALL' ? 'Save Note & Log Call' : `Send ${activeTab}`}
          </button>
        </div>
      </div>
    </div>
  )
}
