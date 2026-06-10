"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { 
  FiPhoneCall, FiMail, FiMessageSquare, FiCheckCircle, 
  FiAlertCircle, FiVolume2, FiMicOff, FiGrid, FiSend, 
  FiUser, FiMessageCircle 
} from "react-icons/fi"

type Message = {
  id: string
  sender: "rep" | "client"
  text: string
  timestamp: string
}

const SIMULATED_TRANSCRIPT_SCRIPTS = [
  "Rep: Hi! This is your sales representative from Titan Diamond. Am I speaking with the office supervisor?",
  "Client: Yes, this is. How can I help you today?",
  "Rep: Great! Just calling to check on your current diamond blades inventory. Are you guys stocked up for the season?",
  "Client: Actually, we are running low on the 4.5\" Premium Turbo Blades. What is the pricing on those right now?",
  "Rep: They are currently $120.00 per pack, but since you are a preferred client, I can apply a 5% discount if we place it today.",
  "Client: That sounds reasonable. Let's draft a quote for 3 packs of those.",
  "Rep: Fantastic. I'll draft that quote in the portal right now and email it over for your signature. Talk soon!",
  "Client: Awesome, thank you! Bye."
]

const SIMULATED_SMS_HISTORY: Record<string, Message[]> = {
  general: [
    { id: "1", sender: "rep", text: "Hey! Just wanted to share our new summer catalog with you.", timestamp: "Yesterday 10:15 AM" },
    { id: "2", sender: "client", text: "Thanks! I'll take a look and let you know if we need anything.", timestamp: "Yesterday 11:30 AM" }
  ]
}

export function CommunicationCenter({ accountId, contacts }: { accountId: string, contacts?: any[] }) {
  const { zohoContext: currentUser } = useZoho()
  const [activeTab, setActiveTab] = useState<"CALL" | "SMS" | "EMAIL" | "WHATSAPP">("CALL")
  
  // Call States
  const [isCalling, setIsCalling] = useState(false)
  const [callTimer, setCallTimer] = useState(0)
  const [callStatus, setCallStatus] = useState<"Dialing..." | "Ringing..." | "Connected" | "Ended">("Dialing...")
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeaker, setIsSpeaker] = useState(false)
  const [callTranscript, setCallTranscript] = useState<string[]>([])
  const [callOutcome, setCallOutcome] = useState("Connected")
  const [callNote, setCallNote] = useState("")
  const [reminderDate, setReminderDate] = useState("")

  // SMS States
  const [smsText, setSmsText] = useState("")
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)

  // Other States
  const [emailText, setEmailText] = useState("")
  const [whatsappText, setWhatsappText] = useState("")
  
  const [isSaving, setIsSaving] = useState(false)
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  
  const transcriptTimerRef = useRef<NodeJS.Timeout | null>(null)
  const callTimerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const primaryContact = contacts?.find(c => c.isPrimary) || contacts?.[0] || { firstName: 'Customer', phone: '(555) 123-4567', email: 'contact@customer.com' }
  const cleanPhone = primaryContact.phone ? primaryContact.phone.replace(/[^0-9+]/g, '') : ''

  // Initialize Chat Messages
  useEffect(() => {
    const contactKey = primaryContact.id || "general"
    if (!SIMULATED_SMS_HISTORY[contactKey]) {
      SIMULATED_SMS_HISTORY[contactKey] = [
        { 
          id: "init-1", 
          sender: "rep", 
          text: `Hi ${primaryContact.firstName}, this is ${currentUser?.name || 'your rep'} from Titan Diamond. Let me know if you need any blades or core bits today!`, 
          timestamp: "Yesterday 2:00 PM" 
        },
        { 
          id: "init-2", 
          sender: "client", 
          text: "Hey, thanks! I will check with the crew in the shop and get back to you.", 
          timestamp: "Yesterday 2:45 PM" 
        }
      ]
    }
    setChatMessages(SIMULATED_SMS_HISTORY[contactKey])
  }, [primaryContact, currentUser])

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages, isTyping])

  // Handle in-app calling events from other views
  useEffect(() => {
    const handleInAppDial = (e: Event) => {
      const customEvent = e as CustomEvent
      setActiveTab("CALL")
      if (!isCalling) {
        startInAppCall()
      }
    }
    const handleInAppSms = (e: Event) => {
      setActiveTab("SMS")
    }
    window.addEventListener("inAppDial", handleInAppDial)
    window.addEventListener("inAppSms", handleInAppSms)
    return () => {
      window.removeEventListener("inAppDial", handleInAppDial)
      window.removeEventListener("inAppSms", handleInAppSms)
    }
  }, [isCalling])

  // Call duration timer
  useEffect(() => {
    if (isCalling && callStatus === "Connected") {
      callTimerIntervalRef.current = setInterval(() => {
        setCallTimer(prev => prev + 1)
      }, 1000)
    } else {
      if (callTimerIntervalRef.current) clearInterval(callTimerIntervalRef.current)
    }
    return () => {
      if (callTimerIntervalRef.current) clearInterval(callTimerIntervalRef.current)
    }
  }, [isCalling, callStatus])

  const formatTimer = (sec: number) => {
    const mm = String(Math.floor(sec / 60)).padStart(2, "0")
    const ss = String(sec % 60).padStart(2, "0")
    return `${mm}:${ss}`
  }

  // Softphone In-App Call Simulation
  const startInAppCall = () => {
    setIsCalling(true)
    setCallTimer(0)
    setCallStatus("Dialing...")
    setCallTranscript([])
    setCallNote("")

    // Simulated dialing sequence
    setTimeout(() => setCallStatus("Ringing..."), 1500)
    setTimeout(() => {
      setCallStatus("Connected")
      // Start transcript simulation stream
      let lineIndex = 0
      const streamTranscript = () => {
        if (lineIndex < SIMULATED_TRANSCRIPT_SCRIPTS.length) {
          const line = SIMULATED_TRANSCRIPT_SCRIPTS[lineIndex]
            .replace("[Rep Name]", currentUser?.name || "your rep")
            .replace("[Contact Name]", primaryContact.firstName || "Customer")
          setCallTranscript(prev => [...prev, line])
          lineIndex++
          transcriptTimerRef.current = setTimeout(streamTranscript, 4000 + Math.random() * 2000)
        } else {
          // Auto end call when transcript script finishes
          setTimeout(() => endInAppCall(), 3000)
        }
      }
      streamTranscript()
    }, 3500)
  }

  const endInAppCall = () => {
    setCallStatus("Ended")
    if (transcriptTimerRef.current) clearTimeout(transcriptTimerRef.current)
    
    // Automatically compile transcript and prefill notes
    setTimeout(() => {
      setIsCalling(false)
      const formattedTranscript = callTranscript.join("\n")
      setCallNote(
        `[Auto Call Transcript - In-App Dial]\nDuration: ${formatTimer(callTimer)}\n\n${formattedTranscript}\n\nNotes:\n- `
      )
    }, 1500)
  }

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
          noteContent: `[In-App Phone Call] Outcome: ${callOutcome}\n\n${callNote}`,
          sentiment: 'Positive',
          reminderDate
        })
      })
      if (response.ok) {
        setCallNote("")
        setReminderDate("")
        setNotification({ message: "In-app call logged successfully!", type: 'success' })
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
    
    // Save locally
    const contactKey = primaryContact.id || "general"
    SIMULATED_SMS_HISTORY[contactKey].push(newMsg)

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

    // Trigger simulated customer auto-reply
    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      const replies = [
        "Got it, thank you! I will check the catalog.",
        "Perfect, can you send a quote over email as well?",
        "Sounds good! I'll talk to my foreman.",
        "Thanks! See you guys next week."
      ]
      const randomReply = replies[Math.floor(Math.random() * replies.length)]
      const replyMsg: Message = {
        id: String(Date.now() + 1),
        sender: "client",
        text: randomReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
      setChatMessages(prev => [...prev, replyMsg])
      SIMULATED_SMS_HISTORY[contactKey].push(replyMsg)
    }, 2000)
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
        <button onClick={() => setActiveTab("CALL")} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'CALL' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}><FiPhoneCall /> In-App Call</button>
        <button onClick={() => setActiveTab("SMS")} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'SMS' ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}><FiMessageCircle /> In-App SMS</button>
        <button onClick={() => setActiveTab("EMAIL")} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'EMAIL' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}><FiMail /> Email</button>
        <button onClick={() => setActiveTab("WHATSAPP")} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'WHATSAPP' ? 'bg-green-500 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}><FiMessageSquare /> WhatsApp</button>
      </div>

      {/* Primary Contact Banner */}
      {!isCalling && (
        <div className="p-4 bg-neutral-800/50 border border-neutral-700 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs text-neutral-400">Communicating with</div>
            <div className="font-bold text-base sm:text-lg text-white">{primaryContact.firstName} {primaryContact.lastName}</div>
            <div className="text-xs text-neutral-500 truncate max-w-[260px] font-mono">
              {activeTab === 'EMAIL' ? primaryContact.email : primaryContact.phone}
            </div>
          </div>
          
          {activeTab === 'CALL' && (
            <button 
              onClick={startInAppCall}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded transition-colors shadow-lg shadow-blue-900/50 w-full sm:w-auto"
            >
              Start In-App Call
            </button>
          )}
        </div>
      )}

      {/* ── CALL TAB ── */}
      {activeTab === "CALL" && (
        <div className="flex-1 flex flex-col min-h-0">
          {isCalling ? (
            /* Dialer softphone view */
            <div className="flex-1 flex flex-col bg-neutral-950 border border-neutral-800 rounded-xl p-5 justify-between">
              {/* Call Details */}
              <div className="text-center space-y-2 py-4">
                <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-full flex items-center justify-center mx-auto text-2xl border border-blue-500/20 animate-pulse">
                  <FiPhoneCall />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{primaryContact.firstName} {primaryContact.lastName}</h3>
                  <p className="text-xs text-neutral-400 font-mono mt-0.5">{primaryContact.phone}</p>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-neutral-900 border border-neutral-800 rounded-full text-xs font-semibold">
                  <span className={`w-2 h-2 rounded-full ${callStatus === "Connected" ? "bg-emerald-500" : "bg-blue-500 animate-pulse"}`}></span>
                  <span className="text-neutral-300">{callStatus}</span>
                  {callStatus === "Connected" && <span className="text-neutral-500 font-mono">({formatTimer(callTimer)})</span>}
                </div>
              </div>

              {/* Live Transcript Stream */}
              <div className="flex-1 bg-neutral-900/55 border border-neutral-850 rounded-lg p-4 my-4 overflow-y-auto max-h-[160px] space-y-2 scrollbar-thin">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-1">Live AI Call Transcription</span>
                {callTranscript.length === 0 ? (
                  <p className="text-xs text-neutral-600 italic">Call initiating... transcription will start shortly.</p>
                ) : (
                  callTranscript.map((t, idx) => {
                    const isRep = t.startsWith("Rep:")
                    return (
                      <div key={idx} className={`text-xs ${isRep ? 'text-blue-400' : 'text-neutral-300'}`}>
                        {t}
                      </div>
                    )
                  })
                )}
              </div>

              {/* Softphone Control Keys */}
              <div className="flex items-center justify-center gap-6 pb-2">
                <button onClick={() => setIsMuted(!isMuted)} className={`w-12 h-12 rounded-full flex items-center justify-center text-lg border transition-colors ${
                  isMuted ? 'bg-red-950 border-red-800 text-red-400' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'
                }`} title="Mute Call">
                  <FiMicOff />
                </button>
                <button onClick={() => endInAppCall()} className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center text-2xl shadow-lg shadow-red-900/40" title="Hang Up">
                  <svg className="w-6 h-6 rotate-[135deg]" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79a15.15 15.15 0 006.59 6.59l2.2-2.2a1 1 0 011.11-.27 11.36 11.36 0 003.58 1.1 1 1 0 01.89 1v3.58a1 1 0 01-1 1A16 16 0 013 6V5a1 1 0 011-1h3.58a1 1 0 011 .89 11.36 11.36 0 001.1 3.58 1 1 0 01-.27 1.11z"/></svg>
                </button>
                <button onClick={() => setIsSpeaker(!isSpeaker)} className={`w-12 h-12 rounded-full flex items-center justify-center text-lg border transition-colors ${
                  isSpeaker ? 'bg-blue-950 border-blue-800 text-blue-400' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'
                }`} title="Speakerphone">
                  <FiVolume2 />
                </button>
              </div>
            </div>
          ) : (
            /* Log Note Form after call ends */
            <div className="space-y-4 flex-1 flex flex-col">
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
                  placeholder="Notes from the call... (Will auto-populate if in-app call was completed)"
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
          )}
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
            
            {isTyping && (
              <div className="flex items-start">
                <div className="bg-neutral-800 text-neutral-400 rounded-2xl rounded-tl-none px-4 py-2.5 text-xs border border-neutral-700 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input form */}
          <div className="pt-3 border-t border-neutral-800 flex gap-2">
            <input 
              type="text" 
              value={smsText}
              onChange={e => setSmsText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendInAppSMS(); }}
              placeholder="Send text message in-app..."
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
