"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import {
  FiPhone, FiPhoneCall, FiPhoneOff, FiPhoneForwarded, FiMic, FiMicOff,
  FiPause, FiPlay, FiVolume2, FiVolumeX, FiGrid, FiSettings, FiX,
  FiChevronDown, FiChevronUp, FiClock, FiUser, FiBriefcase, FiCheck,
  FiCheckCircle, FiAlertCircle, FiShare2, FiLayers, FiMinimize2, FiMaximize2,
  FiVoicemail, FiRadio, FiUsers, FiRotateCcw, FiHeadphones, FiArrowUpRight,
  FiArrowDownLeft, FiCpu, FiShield, FiTarget, FiZap, FiFileText
} from "react-icons/fi"
import { FaWhatsapp } from "react-icons/fa6"
import { playDtmfTone, playRingbackBeep, playHangupClick, playInboundRingTone } from "@/lib/dtmf"
import { formatPhoneNumber } from "@/lib/formatters"
import { toast } from "react-hot-toast"

export type PhoneCallStatus = "idle" | "incoming" | "dialing" | "ringing" | "connected" | "on_hold" | "wrap_up"
export type PhoneCallingMode = "browser_softphone" | "zoho_voice_bridge" | "zdialer"
export type SoftphoneTab = "dialer" | "directory" | "recent" | "copilot"

interface CallState {
  status: PhoneCallStatus
  targetPhone: string
  contactName: string
  accountName: string
  accountId: string
  contactId?: string
  callLogId?: string | null
  zohoCallId?: string | null
  durationSeconds: number
  isMuted: boolean
  isOnHold: boolean
}

interface RecentCallItem {
  id: string
  phone: string
  contactName: string
  accountName: string
  accountId?: string
  timestamp: string
  duration: number
  direction: "OUTBOUND" | "INBOUND"
  outcome?: string
}

const DEFAULT_CALLER_IDS = [
  { id: "main", label: "Titan Diamond HQ (Sales)", number: "+14804702577" },
  { id: "direct", label: "Direct Rep Assigned Line", number: "+14804702577" },
  { id: "tollfree", label: "Titan Diamond Toll-Free", number: "+18005558482" }
]

const QUICK_DISPOSITIONS = [
  { id: "spoke_dm", label: "🎯 Spoke to Decision Maker", outcome: "spoke_decision_maker" },
  { id: "placed_order", label: "📦 Placed Order / Took Spec", outcome: "order_placed" },
  { id: "sent_quote", label: "📄 Requested Pricing / Quote", outcome: "quote_sent" },
  { id: "callback_needed", label: "⏰ Callback Scheduled", outcome: "callback_scheduled" },
  { id: "left_vm", label: "📼 Left Voicemail", outcome: "left_voicemail" },
  { id: "no_answer", label: "🚫 Gatekeeper / No Answer", outcome: "no_answer" },
]

const INTERNAL_DIRECTORY = [
  { id: "sarah", name: "Sarah Jenkins", role: "Diamond Core & Sales Lead", ext: "101", phone: "+14804702577", direct: "Ext 101" },
  { id: "ben", name: "Ben Miller", role: "Key Accounts & Industrial", ext: "102", phone: "+14804702577", direct: "Ext 102" },
  { id: "billing", name: "AR & Billing Dept", role: "Invoicing & Payments", ext: "103", phone: "+14804702577", direct: "Ext 103" },
  { id: "warehouse", name: "Warehouse & Shipping", role: "Fulfillment & Freight Logistics", ext: "104", phone: "+14804702577", direct: "Ext 104" },
  { id: "support", name: "Blade Technical Support", role: "Equipment & Application Specs", ext: "105", phone: "+14804702577", direct: "Ext 105" },
  { id: "operator", name: "Titan HQ Operator", role: "Main Switchboard", ext: "100", phone: "+14804702577", direct: "Ext 100" },
]

export function TitanVoiceSoftphone({ embedded = false, onCallState }: { embedded?: boolean; onCallState?: (state: { status: PhoneCallStatus; accountId: string; name: string }) => void }) {
  // Navigation & View State
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<SoftphoneTab>("dialer")
  const [showKeypad, setShowKeypad] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showCopilot, setShowCopilot] = useState(false)

  // Configuration (persisted)
  const [callingMode, setCallingMode] = useState<PhoneCallingMode>("browser_softphone")
  const [selectedCallerId, setSelectedCallerId] = useState("+14804702577")
  const [agentBridgePhone, setAgentBridgePhone] = useState("")
  const [customBridgeUrl, setCustomBridgeUrl] = useState("")

  // Audio Device Selection
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([])
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedAudioInput, setSelectedAudioInput] = useState("")
  const [selectedAudioOutput, setSelectedAudioOutput] = useState("")

  // Active Call Session
  const [dialInput, setDialInput] = useState("")
  const [call, setCall] = useState<CallState>({
    status: "idle",
    targetPhone: "",
    contactName: "",
    accountName: "",
    accountId: "",
    durationSeconds: 0,
    isMuted: false,
    isOnHold: false,
  })
  useEffect(() => {
    onCallState?.({ status: call.status, accountId: call.accountId, name: call.accountName || call.contactName })
  }, [call.status, call.accountId, call.accountName, call.contactName, onCallState])

  // Live Copilot & Battle-Card Intelligence
  const [copilotData, setCopilotData] = useState<any>(null)
  const [selectedBattleCard, setSelectedBattleCard] = useState<number>(0)
  const [activeQuoteAlert, setActiveQuoteAlert] = useState<{
    customerName: string
    phone: string
    accountId: string
    quoteNumber: string
    amount: number
  } | null>(null)

  // Recent Calls
  const [recentCalls, setRecentCalls] = useState<RecentCallItem[]>([])

  // Audio & Hardware MediaStream
  const [micActivityLevel, setMicActivityLevel] = useState(0)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const stopRingbackRef = useRef<(() => void) | null>(null)
  const stopInboundRingRef = useRef<(() => void) | null>(null)

  // Wrap-up Form
  const [selectedDisposition, setSelectedDisposition] = useState("spoke_decision_maker")
  const [callNotes, setCallNotes] = useState("")
  const [isSavingLog, setIsSavingLog] = useState(false)

  // 1. Fetch Copilot Data helper
  const fetchCopilotData = useCallback(async (accId: string, phoneNum: string) => {
    try {
      const q = new URLSearchParams()
      if (accId) q.append("accountId", accId)
      if (phoneNum) q.append("phone", phoneNum)
      const res = await fetch(`/api/calls/copilot?${q.toString()}`)
      const data = await res.json()
      if (data.success) {
        setCopilotData(data)
      }
    } catch (e) {
      console.warn("Copilot fetch failed:", e)
    }
  }, [])

  // 2. Restore configuration & recent calls from localStorage
  useEffect(() => {
    try {
      const savedBridge = localStorage.getItem("titan_voice_bridge_phone")
      if (savedBridge) setAgentBridgePhone(savedBridge)
      const savedMode = localStorage.getItem("titan_voice_calling_mode") as PhoneCallingMode
      if (savedMode) setCallingMode(savedMode)
      const savedBridgeUrl = localStorage.getItem("titan_voice_custom_bridge_url")
      if (savedBridgeUrl) setCustomBridgeUrl(savedBridgeUrl)

      const savedMic = localStorage.getItem("titan_voice_audio_input")
      if (savedMic) setSelectedAudioInput(savedMic)
      const savedSpeaker = localStorage.getItem("titan_voice_audio_output")
      if (savedSpeaker) setSelectedAudioOutput(savedSpeaker)

      const savedRecent = localStorage.getItem("titan_recent_calls_log")
      if (savedRecent) {
        setRecentCalls(JSON.parse(savedRecent))
      }
    } catch {}

    // Enumerate hardware devices
    const loadAudioDevices = async () => {
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          setAudioInputDevices(devices.filter(d => d.kind === "audioinput"))
          setAudioOutputDevices(devices.filter(d => d.kind === "audiooutput"))
        } catch {}
      }
    }
    loadAudioDevices()
  }, [])

  const saveSettings = (
    bridge: string,
    mode: PhoneCallingMode,
    bUrl: string,
    micId: string,
    speakerId: string
  ) => {
    setAgentBridgePhone(bridge)
    setCallingMode(mode)
    setCustomBridgeUrl(bUrl)
    setSelectedAudioInput(micId)
    setSelectedAudioOutput(speakerId)
    try {
      localStorage.setItem("titan_voice_bridge_phone", bridge)
      localStorage.setItem("titan_voice_calling_mode", mode)
      localStorage.setItem("titan_voice_custom_bridge_url", bUrl)
      localStorage.setItem("titan_voice_audio_input", micId)
      localStorage.setItem("titan_voice_audio_output", speakerId)
      toast.success("Phone & Bridge settings saved")
    } catch {}
    setShowSettings(false)
  }

  const addRecentCall = (item: RecentCallItem) => {
    setRecentCalls(prev => {
      const filtered = prev.filter(c => c.phone !== item.phone || (Date.now() - new Date(c.timestamp).getTime()) > 3600000)
      const updated = [item, ...filtered].slice(0, 30)
      try {
        localStorage.setItem("titan_recent_calls_log", JSON.stringify(updated))
      } catch {}
      return updated
    })
  }

  // 3. Setup Mic Stream & Web Audio Visualizer
  const setupMicrophone = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        const constraints: MediaStreamConstraints = {
          audio: selectedAudioInput ? { deviceId: { exact: selectedAudioInput } } : true
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        mediaStreamRef.current = stream

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        if (AudioCtx) {
          const ctx = new AudioCtx()
          audioContextRef.current = ctx
          const source = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 64
          source.connect(analyser)
          analyserRef.current = analyser

          const dataArray = new Uint8Array(analyser.frequencyBinCount)
          const pollAudio = () => {
            if (!analyserRef.current || call.status === "idle") return
            analyserRef.current.getByteFrequencyData(dataArray)
            let sum = 0
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
            const avg = sum / dataArray.length
            setMicActivityLevel(Math.min(100, Math.round((avg / 128) * 100)))
            if (call.status === "connected") {
              requestAnimationFrame(pollAudio)
            }
          }
          requestAnimationFrame(pollAudio)
        }
      }
    } catch (err) {
      console.warn("Microphone access not granted or unavailable for visualizer:", err)
    }
  }, [call.status, selectedAudioInput])

  const stopMicrophone = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close() } catch {}
      audioContextRef.current = null
    }
    setMicActivityLevel(0)
  }, [])

  // 4. Initiate Outbound Call
  const startCall = useCallback(async (
    rawNumber: string,
    contactName = "",
    accountId = "",
    accountName = ""
  ) => {
    const cleanNumber = rawNumber.replace(/[^0-9+]/g, "")
    if (!cleanNumber || cleanNumber.length < 3) {
      toast.error("Please enter a valid phone number or extension")
      return
    }

    // Expand softphone UI
    setIsExpanded(true)
    setActiveTab("dialer")
    setDialInput(cleanNumber)

    setCall({
      status: "dialing",
      targetPhone: cleanNumber,
      contactName: contactName || "Customer",
      accountName: accountName || "Titan Diamond Account",
      accountId,
      durationSeconds: 0,
      isMuted: false,
      isOnHold: false,
    })

    // Fetch copilot intelligence
    fetchCopilotData(accountId, cleanNumber)

    // Start US standard ringback tone
    stopRingbackRef.current = playRingbackBeep()

    // Place call to backend API (Zoho Voice Click2Call / Bridge / WebSDK)
    try {
      const res = await fetch("/api/calls/make", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromNumber: selectedCallerId,
          toNumber: cleanNumber,
          accountId: accountId || undefined,
          agentPhone: agentBridgePhone || undefined,
          bridgeUrl: customBridgeUrl || undefined,
          mode: callingMode
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to connect call via Zoho Voice")

      // Transition to ringing then connected
      setCall(prev => ({
        ...prev,
        status: "ringing",
        callLogId: data.callLogId || null,
        zohoCallId: data.zohoCallId || null
      }))

      // Connect audio session
      setTimeout(() => {
        if (stopRingbackRef.current) {
          stopRingbackRef.current()
          stopRingbackRef.current = null
        }
        setupMicrophone()
        setCall(prev => ({ ...prev, status: "connected" }))

        // Start call duration timer
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = setInterval(() => {
          setCall(prev => ({ ...prev, durationSeconds: prev.durationSeconds + 1 }))
        }, 1000)

        toast.success(`Call connected to ${formatPhoneNumber(cleanNumber)}`, { icon: "📞" })
      }, 2200)

    } catch (err: any) {
      if (stopRingbackRef.current) {
        stopRingbackRef.current()
        stopRingbackRef.current = null
      }
      playHangupClick()
      setCall(prev => ({ ...prev, status: "idle" }))
      toast.error(err.message || "Failed to place call")
    }
  }, [selectedCallerId, agentBridgePhone, customBridgeUrl, callingMode, setupMicrophone, fetchCopilotData])

  // 5. Inbound Call Handling
  const triggerInboundCall = useCallback((fromNumber: string, callerName = "Incoming Caller", accName = "Titan Diamond Customer", accId = "") => {
    setIsExpanded(true)
    setCall({
      status: "incoming",
      targetPhone: fromNumber,
      contactName: callerName,
      accountName: accName,
      accountId: accId,
      durationSeconds: 0,
      isMuted: false,
      isOnHold: false,
    })
    stopInboundRingRef.current = playInboundRingTone()
    fetchCopilotData(accId, fromNumber)
  }, [fetchCopilotData])

  const answerInboundCall = () => {
    if (stopInboundRingRef.current) {
      stopInboundRingRef.current()
      stopInboundRingRef.current = null
    }
    setupMicrophone()
    setCall(prev => ({ ...prev, status: "connected" }))
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    timerIntervalRef.current = setInterval(() => {
      setCall(prev => ({ ...prev, durationSeconds: prev.durationSeconds + 1 }))
    }, 1000)
    toast.success("Call connected", { icon: "📞" })
  }

  const declineInboundCall = () => {
    if (stopInboundRingRef.current) {
      stopInboundRingRef.current()
      stopInboundRingRef.current = null
    }
    playHangupClick()
    setCall(prev => ({ ...prev, status: "idle" }))
    toast("Incoming call declined", { icon: "📵" })
  }

  // 6. Hangup Call
  const endCall = useCallback(() => {
    if (stopRingbackRef.current) {
      stopRingbackRef.current()
      stopRingbackRef.current = null
    }
    if (stopInboundRingRef.current) {
      stopInboundRingRef.current()
      stopInboundRingRef.current = null
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    playHangupClick()
    stopMicrophone()

    // Record into recent calls
    if (call.targetPhone) {
      addRecentCall({
        id: `call_${Date.now()}`,
        phone: call.targetPhone,
        contactName: call.contactName || "Contact",
        accountName: call.accountName || "Account",
        accountId: call.accountId || undefined,
        timestamp: new Date().toISOString(),
        duration: call.durationSeconds,
        direction: call.status === "incoming" ? "INBOUND" : "OUTBOUND",
        outcome: call.durationSeconds > 0 ? "Connected" : "No Answer"
      })
    }

    // If call was connected, transition to wrap-up screen
    if (call.durationSeconds > 0 || call.status === "connected") {
      setCall(prev => ({ ...prev, status: "wrap_up" }))
    } else {
      setCall(prev => ({ ...prev, status: "idle" }))
    }
  }, [call.durationSeconds, call.status, call.targetPhone, call.contactName, call.accountName, call.accountId, stopMicrophone])

  // 7. Call Transfer
  const handleTransfer = (targetExt: string, targetName: string, isWarm: boolean) => {
    if (isWarm) {
      setCall(prev => ({ ...prev, isOnHold: true }))
      playDtmfTone("2")
      toast.success(`Putting customer on hold. Initiating warm transfer to ${targetName} (${targetExt})...`, { icon: "🔄" })
    } else {
      toast.success(`Blind transferring call to ${targetName} (${targetExt})...`, { icon: "↪️" })
      setTimeout(() => {
        endCall()
      }, 1500)
    }
  }

  // 8. Toggle Mute
  const toggleMute = () => {
    const next = !call.isMuted
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !next
      })
    }
    setCall(prev => ({ ...prev, isMuted: next }))
    toast(next ? "Microphone Muted" : "Microphone Active", { icon: next ? "🔇" : "🎙️" })
  }

  // 9. Toggle Hold
  const toggleHold = () => {
    const next = !call.isOnHold
    setCall(prev => ({ ...prev, isOnHold: next }))
    toast(next ? "Call on Hold" : "Call Resumed", { icon: next ? "⏸️" : "▶️" })
  }

  // 10. DTMF Keypress
  const handleKeypadPress = (digit: string) => {
    playDtmfTone(digit)
    if (call.status === "idle") {
      setDialInput(prev => prev + digit)
    } else {
      toast(`Sent DTMF: ${digit}`, { duration: 800 })
    }
  }

  // 11. 1-Click Voicemail Drop
  const handleVoicemailDrop = () => {
    toast.success("Dropping Titan Diamond Pitch Voicemail... Hanging up in 2s", { icon: "🎙️" })
    setTimeout(() => {
      setSelectedDisposition("left_voicemail")
      setCallNotes("Dropped pre-recorded Titan Diamond sales follow-up voicemail.")
      endCall()
    }, 2000)
  }

  // 12. Save Call Log Wrap-up
  const handleSaveWrapUp = async () => {
    setIsSavingLog(true)
    try {
      if (call.callLogId) {
        await fetch("/api/calls/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: call.callLogId,
            duration: call.durationSeconds,
            status: "COMPLETED",
            notes: `${selectedDisposition.toUpperCase()}: ${callNotes || "Call logged via Titan Voice Softphone"}`,
          })
        }).catch(() => {})
      }

      if (call.accountId) {
        await fetch("/api/log-sales-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: call.accountId,
            outcome: selectedDisposition,
            notes: callNotes || `Call completed (${Math.ceil(call.durationSeconds / 60)} min)`,
            spokeTo: call.contactName,
            contactReached: selectedDisposition === "spoke_decision_maker" || selectedDisposition === "order_placed",
            durationMinutes: Math.max(1, Math.ceil(call.durationSeconds / 60)),
          })
        })
      }

      toast.success("Call outcome logged to customer account!")
      setCall({
        status: "idle",
        targetPhone: "",
        contactName: "",
        accountName: "",
        accountId: "",
        durationSeconds: 0,
        isMuted: false,
        isOnHold: false,
      })
      setCallNotes("")
      setIsExpanded(false)
      setShowCopilot(false)
    } catch (err: any) {
      toast.error("Failed to save call log: " + err.message)
    } finally {
      setIsSavingLog(false)
    }
  }

  // 13. Event Listeners for inAppDial, Inbound Call, and Live Quote Alert
  useEffect(() => {
    const handleDialEvent = (event: Event) => {
      const detail = (event as CustomEvent<{
        phone?: string
        contactName?: string
        accountId?: string
        accountName?: string
      }>).detail
      if (detail?.phone) {
        startCall(detail.phone, detail.contactName, detail.accountId, detail.accountName)
      }
    }

    const handleInboundEvent = (event: Event) => {
      const detail = (event as CustomEvent<{
        fromNumber?: string
        callerName?: string
        accountName?: string
        accountId?: string
      }>).detail
      if (detail?.fromNumber) {
        triggerInboundCall(detail.fromNumber, detail.callerName, detail.accountName, detail.accountId)
      }
    }

    const handleQuoteViewed = (event: Event) => {
      const detail = (event as CustomEvent<{
        customerName: string
        phone: string
        accountId: string
        quoteNumber: string
        amount: number
      }>).detail
      if (detail?.quoteNumber) {
        setActiveQuoteAlert(detail)
        setIsExpanded(true)
        toast(`🔥 ${detail.customerName} is viewing Quote #${detail.quoteNumber}!`, { icon: "📄", duration: 6000 })
      }
    }

    window.addEventListener("inAppDial", handleDialEvent)
    window.addEventListener("titanInboundCall", handleInboundEvent)
    window.addEventListener("titanCustomerQuoteViewed", handleQuoteViewed)
    return () => {
      window.removeEventListener("inAppDial", handleDialEvent)
      window.removeEventListener("titanInboundCall", handleInboundEvent)
      window.removeEventListener("titanCustomerQuoteViewed", handleQuoteViewed)
    }
  }, [startCall, triggerInboundCall])

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  return (
    <>
      {/* ─── FLOATING MINI-DOCK (Bottom-Right) ─── */}
      <div className={embedded ? "h-full min-h-0 flex flex-col overflow-hidden font-sans antialiased" : "fixed bottom-4 right-4 z-[9999] font-sans antialiased"}>
        {!isExpanded && !embedded ? (
          /* Minimized Phone Badge */
          <button
            onClick={() => setIsExpanded(true)}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-2xl border transition-all duration-200 cursor-pointer ${
              call.status === "connected"
                ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 animate-pulse shadow-emerald-950/60"
                : call.status === "ringing" || call.status === "dialing"
                ? "bg-cyan-600 hover:bg-cyan-500 text-white border-cyan-400 animate-bounce shadow-cyan-950/60"
                : call.status === "incoming"
                ? "bg-amber-600 hover:bg-amber-500 text-white border-amber-400 animate-bounce shadow-amber-950/60"
                : activeQuoteAlert
                ? "bg-orange-600 hover:bg-orange-500 text-white border-orange-400 animate-pulse shadow-orange-950/60"
                : "bg-[#0b0e14]/95 hover:bg-[#121722] text-white border-white/15 hover:border-cyan-500/50 shadow-black/80 backdrop-blur-md"
            }`}
          >
            <div className={`w-3 h-3 rounded-full ${
              call.status === "connected"
                ? "bg-white animate-ping"
                : call.status === "ringing" || call.status === "incoming"
                ? "bg-amber-300"
                : activeQuoteAlert
                ? "bg-amber-300 animate-ping"
                : "bg-emerald-400"
            }`} />
            <FiPhoneCall size={15} />
            <span className="text-xs font-black tracking-wide">
              {call.status === "connected"
                ? `In Call · ${formatTimer(call.durationSeconds)}`
                : call.status === "incoming"
                ? "Incoming Call..."
                : call.status === "ringing" || call.status === "dialing"
                ? "Ringing..."
                : activeQuoteAlert
                ? `🔥 Quote #${activeQuoteAlert.quoteNumber} Active!`
                : "Titan Phone"}
            </span>
          </button>
        ) : (
          /* ─── EXPANDED SOFTPHONE CONSOLE ─── */
          <div data-phone-console className={`${embedded ? "w-full h-full min-h-0" : "w-80 sm:w-96 rounded-3xl border border-white/20"} bg-[#090c12]/98 overflow-hidden flex flex-col text-white`}>
            
            {/* Live Stale Quote Alert Banner */}
            {activeQuoteAlert && (
              <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 px-3.5 py-2 text-white text-xs flex items-center justify-between border-b border-orange-400/40">
                <div className="flex items-center gap-1.5 truncate mr-2">
                  <FiZap className="shrink-0 animate-bounce" size={13} />
                  <span className="truncate">
                    <strong>{activeQuoteAlert.customerName}</strong> viewing Quote #{activeQuoteAlert.quoteNumber} (${activeQuoteAlert.amount?.toFixed(2)})
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startCall(activeQuoteAlert.phone, activeQuoteAlert.customerName, activeQuoteAlert.accountId)}
                    className="px-2 py-0.5 rounded-lg bg-black text-white text-[10px] font-black uppercase hover:bg-neutral-900 transition flex items-center gap-1"
                  >
                    <FiPhone size={10} /> Call Now
                  </button>
                  <button onClick={() => setActiveQuoteAlert(null)} className="p-0.5 text-white/80 hover:text-white">
                    <FiX size={12} />
                  </button>
                </div>
              </div>
            )}

            {/* Header Strip */}
            <div data-phone-header className="bg-gradient-to-r from-cyan-950/60 via-[#0d121c] to-[#090c12] border-b border-white/10 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-900/40">
                  <FiPhoneCall className="text-white text-xs" />
                </div>
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-400">Titan Voice Station</div>
                  <div className="text-xs font-black text-white leading-tight">In-App Telephony & Copilot</div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowCopilot(!showCopilot)}
                  className={`p-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                    showCopilot ? "bg-amber-500 text-black font-bold" : "text-neutral-400 hover:text-white hover:bg-white/10"
                  }`}
                  title="AI Call Copilot & Battle-Cards"
                >
                  <FiCpu size={14} />
                  <span className="text-[10px] hidden sm:inline">Copilot</span>
                </button>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    showSettings ? "bg-cyan-600 text-white" : "text-neutral-400 hover:text-white hover:bg-white/10"
                  }`}
                  title="Bridge & Audio Settings"
                >
                  <FiSettings size={14} />
                </button>
                <button
                  onClick={() => setIsExpanded(false)}
                  hidden={embedded}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  title="Minimize Phone"
                >
                  <FiMinimize2 size={14} />
                </button>
              </div>
            </div>

            {/* Navigation Tabs (Dialer, Directory, Recent) */}
            {call.status === "idle" && (
              <div data-phone-tabs className="grid grid-cols-3 bg-[#0d121b] border-b border-white/10 text-xs">
                <button
                  onClick={() => setActiveTab("dialer")}
                  className={`py-2 text-center font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === "dialer"
                      ? "text-cyan-400 border-b-2 border-cyan-400 bg-white/[.04]"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <FiGrid size={12} />
                  <span>Keypad</span>
                </button>

                <button
                  onClick={() => setActiveTab("directory")}
                  className={`py-2 text-center font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === "directory"
                      ? "text-cyan-400 border-b-2 border-cyan-400 bg-white/[.04]"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <FiUsers size={12} />
                  <span>Directory</span>
                </button>

                <button
                  onClick={() => setActiveTab("recent")}
                  className={`py-2 text-center font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === "recent"
                      ? "text-cyan-400 border-b-2 border-cyan-400 bg-white/[.04]"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <FiClock size={12} />
                  <span>Recent ({recentCalls.length})</span>
                </button>
              </div>
            )}

            <div data-phone-scroll>
            {/* AI Call Copilot & Battle-Card Panel */}
            {showCopilot && (
              <div className="p-3.5 bg-gradient-to-b from-[#101726] to-[#0a0d14] border-b border-cyan-500/20 space-y-3 text-xs max-h-96 overflow-y-auto custom-scrollbar animate-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between pb-1 border-b border-white/10">
                  <div className="flex items-center gap-1.5">
                    <FiCpu className="text-cyan-400" />
                    <span className="font-black uppercase tracking-wider text-cyan-300 text-[10px]">
                      Live Call Copilot & Battle-Cards
                    </span>
                  </div>
                  <button onClick={() => setShowCopilot(false)} className="text-neutral-400 hover:text-white">
                    <FiX size={14} />
                  </button>
                </div>

                {/* Customer Account Memory */}
                {copilotData?.account ? (
                  <div className="bg-black/50 p-2.5 rounded-2xl border border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black text-white truncate">{copilotData.account.name}</span>
                      {copilotData.account.isOverdue && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-500/30 font-bold">
                          Balance: ${copilotData.account.totalBalance.toFixed(2)}
                        </span>
                      )}
                    </div>

                    {/* Top Previously Purchased Blades */}
                    {copilotData.account.topItems && copilotData.account.topItems.length > 0 && (
                      <div className="pt-1">
                        <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                          Previously Purchased Blades:
                        </div>
                        <div className="space-y-1">
                          {copilotData.account.topItems.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between text-[11px] bg-white/[.04] px-2 py-1 rounded-lg">
                              <span className="text-white truncate font-medium mr-1">{item.name}</span>
                              <span className="text-cyan-300 font-mono shrink-0 font-bold">
                                {item.count}x @ ${item.lastPrice?.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-2 text-center text-neutral-400 text-[11px] bg-black/30 rounded-xl">
                    Dial a customer number or open an account to load personalized purchase memory.
                  </div>
                )}

                {/* Competitor Battle Cards */}
                {copilotData?.competitorBattleCards && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-amber-400">
                      <span>Competitor Battle-Cards</span>
                      <span className="text-neutral-500">Tap to Switch</span>
                    </div>

                    {/* Competitor Switcher */}
                    <div className="grid grid-cols-2 gap-1">
                      {copilotData.competitorBattleCards.map((card: any, idx: number) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedBattleCard(idx)}
                          className={`p-1.5 rounded-xl text-left truncate text-[10px] font-bold transition border ${
                            selectedBattleCard === idx
                              ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
                              : "bg-white/[.03] text-neutral-400 border-white/5 hover:text-white"
                          }`}
                        >
                          {card.name.split(" ")[0]}
                        </button>
                      ))}
                    </div>

                    {/* Active Battle Card Details */}
                    {copilotData.competitorBattleCards[selectedBattleCard] && (
                      <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-1.5 text-[11px]">
                        <div>
                          <span className="text-amber-400 font-bold block text-[10px] uppercase">Competitor Weakness:</span>
                          <p className="text-neutral-300 leading-snug">{copilotData.competitorBattleCards[selectedBattleCard].weakness}</p>
                        </div>
                        <div>
                          <span className="text-emerald-400 font-bold block text-[10px] uppercase">Titan Counter-Pitch:</span>
                          <p className="text-white font-medium leading-snug">{copilotData.competitorBattleCards[selectedBattleCard].counterPitch}</p>
                        </div>
                        <div className="bg-black/40 p-1.5 rounded-lg border border-amber-500/20 text-[10px] text-amber-300">
                          <strong>Deal-Breaker Spec:</strong> {copilotData.competitorBattleCards[selectedBattleCard].dealBreakerSpec}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sizing & Upsells */}
                <div className="p-2 bg-cyan-950/20 border border-cyan-500/20 rounded-xl space-y-1 text-[10px] text-cyan-200">
                  <div className="font-bold uppercase tracking-wider text-cyan-400">💡 Quick Upsell Reminders:</div>
                  <ul className="list-disc list-inside space-y-0.5 text-neutral-300">
                    <li>Mention dressing stones to unglaze blades in hard aggregate.</li>
                    <li>Offer 5+ blade carton pricing to secure higher monthly volume.</li>
                    <li>Check if they need 2"–6" core drill bits for the current jobsite.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Settings Overlay Drawer */}
            {showSettings && (
              <div className="p-4 bg-[#0e141f] border-b border-white/15 space-y-3 text-xs max-h-96 overflow-y-auto custom-scrollbar animate-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between">
                  <span className="font-black uppercase tracking-wider text-cyan-400 text-[10px]">
                    Telephony, Bridge & Audio Setup
                  </span>
                  <button onClick={() => setShowSettings(false)} className="text-neutral-400 hover:text-white">
                    <FiX size={14} />
                  </button>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-neutral-400 block mb-1">
                    Calling Engine
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => setCallingMode("browser_softphone")}
                      className={`p-2 rounded-xl text-left border font-semibold ${
                        callingMode === "browser_softphone"
                          ? "bg-cyan-600/30 border-cyan-400 text-cyan-200"
                          : "bg-white/5 border-white/10 text-neutral-400"
                      }`}
                    >
                      <div className="text-[11px] font-bold text-white flex items-center gap-1">
                        <FiMic size={11} /> In-Browser Mic
                      </div>
                      <div className="text-[9px] text-neutral-400 mt-0.5">Use computer headset</div>
                    </button>

                    <button
                      onClick={() => setCallingMode("zoho_voice_bridge")}
                      className={`p-2 rounded-xl text-left border font-semibold ${
                        callingMode === "zoho_voice_bridge"
                          ? "bg-cyan-600/30 border-cyan-400 text-cyan-200"
                          : "bg-white/5 border-white/10 text-neutral-400"
                      }`}
                    >
                      <div className="text-[11px] font-bold text-white flex items-center gap-1">
                        <FiLayers size={11} /> Voice Bridge
                      </div>
                      <div className="text-[9px] text-neutral-400 mt-0.5">Rings your phone first</div>
                    </button>
                  </div>
                </div>

                {/* Microphone Picker */}
                <div>
                  <label className="text-[10px] font-bold text-neutral-400 block mb-1">
                    Microphone Input Device
                  </label>
                  <select
                    value={selectedAudioInput}
                    onChange={e => setSelectedAudioInput(e.target.value)}
                    className="w-full bg-black/60 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Default Microphone</option>
                    {audioInputDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microphone (${d.deviceId.slice(0, 8)}...)`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Speaker Output Picker */}
                <div>
                  <label className="text-[10px] font-bold text-neutral-400 block mb-1">
                    Audio Output Device (Speaker / Headset)
                  </label>
                  <select
                    value={selectedAudioOutput}
                    onChange={e => setSelectedAudioOutput(e.target.value)}
                    className="w-full bg-black/60 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Default System Output</option>
                    {audioOutputDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Speaker/Headset (${d.deviceId.slice(0, 8)}...)`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-neutral-400 block mb-1">
                    Your Agent Bridge Number
                  </label>
                  <input
                    data-phone-number type="tel"
                    value={agentBridgePhone}
                    onChange={e => setAgentBridgePhone(e.target.value)}
                    placeholder="e.g. +1 480-555-0199 (cell/desk)"
                    className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <div className="text-[9px] text-neutral-500 mt-0.5">
                    When bridge mode is on, Zoho Voice calls this line to patch you in.
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-neutral-400 block mb-1">
                    Custom PBX/SIP Bridge Webhook (Optional)
                  </label>
                  <input
                    type="url"
                    value={customBridgeUrl}
                    onChange={e => setCustomBridgeUrl(e.target.value)}
                    placeholder="https://your-sip-bridge.com/webhook"
                    className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <div className="text-[9px] text-neutral-500 mt-0.5">
                    Webhook receiver: <code className="text-cyan-300">/api/calls/bridge-webhook</code>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-neutral-400 block mb-1">
                    Outbound Business Caller ID
                  </label>
                  <select
                    value={selectedCallerId}
                    onChange={e => setSelectedCallerId(e.target.value)}
                    className="w-full bg-black/60 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    {DEFAULT_CALLER_IDS.map(cid => (
                      <option key={cid.id} value={cid.number}>
                        {cid.label} ({cid.number})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Simulation Button for Testing Inbound Call */}
                <div className="pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => triggerInboundCall("+14804702577", "Titan Test Customer", "Acme Construction Services", "test_acc")}
                    className="w-full py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-[10px] font-semibold flex items-center justify-center gap-1.5 border border-white/10"
                  >
                    <FiRadio className="text-amber-400" /> Simulate Inbound Call (Ring Phone)
                  </button>
                </div>

                <div className="pt-1">
                  <button
                    onClick={() => saveSettings(agentBridgePhone, callingMode, customBridgeUrl, selectedAudioInput, selectedAudioOutput)}
                    className="w-full py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md shadow-cyan-950/40 cursor-pointer"
                  >
                    Save Telephony Settings
                  </button>
                </div>
              </div>
            )}

            {/* Main Phone Body */}
            <div data-phone-body={call.status === "idle" && activeTab === "dialer" && !showSettings && !showCopilot ? "dialer" : "content"} className="p-4 space-y-4">

              {/* ─── State 1: IDLE / DIALER TABS ─── */}
              {call.status === "idle" && (
                <>
                  {/* TAB 1: KEYPAD DIALER */}
                  {activeTab === "dialer" && (
                    <div data-phone-dialer className="space-y-3">
                      {/* Phone Number Display */}
                      <div className="relative">
                        <input
                          type="tel"
                          value={dialInput}
                          onChange={e => setDialInput(e.target.value)}
                          placeholder="Enter phone or ext..."
                          className="w-full bg-black/50 border border-white/20 rounded-2xl px-4 py-3.5 text-center text-xl font-mono font-bold text-white tracking-wider focus:outline-none focus:border-cyan-400 shadow-inner"
                        />
                        {dialInput && (
                          <button
                            onClick={() => setDialInput("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1"
                          >
                            <FiX size={16} />
                          </button>
                        )}
                      </div>

                      {/* Outbound Caller ID tag */}
                      <div data-phone-caller className="flex items-center justify-between text-[10px] text-neutral-400 px-1">
                        <span>Caller ID: <strong className="text-cyan-300 font-mono">{selectedCallerId}</strong></span>
                        <span className="capitalize">{callingMode.replace(/_/g, " ")}</span>
                      </div>

                      {/* Numeric Keypad with DTMF Tone Generation */}
                      <div data-phone-keypad className="grid grid-cols-3 gap-2">
                        {[
                          { d: "1", sub: "" },
                          { d: "2", sub: "ABC" },
                          { d: "3", sub: "DEF" },
                          { d: "4", sub: "GHI" },
                          { d: "5", sub: "JKL" },
                          { d: "6", sub: "MNO" },
                          { d: "7", sub: "PQRS" },
                          { d: "8", sub: "TUV" },
                          { d: "9", sub: "WXYZ" },
                          { d: "*", sub: "" },
                          { d: "0", sub: "+" },
                          { d: "#", sub: "" },
                        ].map(item => (
                          <button
                            key={item.d}
                            onClick={() => handleKeypadPress(item.d)}
                            className="py-3 rounded-2xl bg-white/[.04] hover:bg-white/[.09] active:bg-cyan-600/40 border border-white/5 active:border-cyan-400 text-white transition flex flex-col items-center justify-center cursor-pointer select-none"
                          >
                            <span className="text-lg font-bold font-mono leading-none">{item.d}</span>
                            {item.sub && <span className="text-[8px] font-semibold text-neutral-500 mt-0.5 tracking-widest">{item.sub}</span>}
                          </button>
                        ))}
                      </div>

                      {/* Big Call Button */}
                      <div className="pt-1">
                        <button
                          data-phone-call onClick={() => startCall(dialInput)}
                          disabled={!dialInput}
                          className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/60 disabled:opacity-40 transition cursor-pointer"
                        >
                          <FiPhoneCall size={16} />
                          <span>Call {dialInput ? formatPhoneNumber(dialInput) : "Number"}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: INTERNAL DIRECTORY & TRANSFERS */}
                  {activeTab === "directory" && (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      <div className="text-[10px] font-black uppercase tracking-wider text-cyan-400 pb-1 flex items-center justify-between">
                        <span>Internal Extensions</span>
                        <span>Titan PBX</span>
                      </div>
                      {INTERNAL_DIRECTORY.map(person => (
                        <div
                          key={person.id}
                          className="p-2.5 rounded-2xl bg-white/[.04] hover:bg-white/[.08] border border-white/10 flex items-center justify-between gap-2 transition"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white truncate">{person.name}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-800/40">
                                {person.direct}
                              </span>
                            </div>
                            <div className="text-[10px] text-neutral-400 truncate">{person.role}</div>
                          </div>

                          <button
                            onClick={() => startCall(person.phone, person.name)}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-md shadow-emerald-950/40 shrink-0 cursor-pointer"
                          >
                            <FiPhoneCall size={12} />
                            <span>Dial</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* TAB 3: RECENT CALLS LOG */}
                  {activeTab === "recent" && (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-cyan-400 pb-1">
                        <span>Recent Portal Calls</span>
                        {recentCalls.length > 0 && (
                          <button
                            onClick={() => {
                              setRecentCalls([])
                              localStorage.removeItem("titan_recent_calls_log")
                            }}
                            className="text-neutral-500 hover:text-white"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {recentCalls.length === 0 ? (
                        <div className="py-8 text-center text-neutral-500 text-xs">
                          No recent calls logged yet
                        </div>
                      ) : (
                        recentCalls.map(item => (
                          <div
                            key={item.id}
                            className="p-2.5 rounded-2xl bg-white/[.04] hover:bg-white/[.08] border border-white/10 flex items-center justify-between gap-2 transition"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                {item.direction === "INBOUND" ? (
                                  <FiArrowDownLeft className="text-cyan-400 text-xs shrink-0" />
                                ) : (
                                  <FiArrowUpRight className="text-emerald-400 text-xs shrink-0" />
                                )}
                                <span className="text-xs font-bold text-white truncate">{item.contactName}</span>
                              </div>
                              <div className="text-[10px] text-neutral-400 truncate font-mono">
                                {formatPhoneNumber(item.phone)} · {formatTimer(item.duration)}
                              </div>
                            </div>

                            <button
                              onClick={() => startCall(item.phone, item.contactName, item.accountId, item.accountName)}
                              className="p-2 rounded-xl bg-cyan-600/30 hover:bg-cyan-600 text-cyan-200 hover:text-white border border-cyan-400/40 transition shrink-0 cursor-pointer"
                              title="Redial"
                            >
                              <FiRotateCcw size={12} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ─── State 1.5: INCOMING CALL ALERT ─── */}
              {call.status === "incoming" && (
                <div className="space-y-4 text-center py-4 bg-gradient-to-b from-amber-950/40 to-transparent rounded-2xl border border-amber-500/30 p-4 animate-pulse">
                  <div className="w-16 h-16 rounded-full mx-auto bg-amber-500 text-black flex items-center justify-center text-2xl font-black shadow-lg shadow-amber-950/80 animate-bounce">
                    <FiPhoneCall />
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-amber-400">Incoming Titan Call</div>
                    <h3 className="text-base font-black text-white">{call.contactName || "Incoming Caller"}</h3>
                    <div className="text-xs text-neutral-300">{call.accountName}</div>
                    <div className="text-sm font-mono font-bold text-amber-300 mt-1">
                      {formatPhoneNumber(call.targetPhone)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={declineInboundCall}
                      className="py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-rose-950/60 cursor-pointer"
                    >
                      <FiPhoneOff size={14} /> Decline
                    </button>
                    <button
                      onClick={answerInboundCall}
                      className="py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/60 cursor-pointer"
                    >
                      <FiPhoneCall size={14} /> Answer
                    </button>
                  </div>
                </div>
              )}

              {/* ─── State 2: DIALING / RINGING / CONNECTED / ON HOLD ─── */}
              {(call.status === "dialing" || call.status === "ringing" || call.status === "connected" || call.status === "on_hold") && (
                <div className="space-y-3 text-center py-1">
                  
                  {/* Callee Info */}
                  <div className="space-y-0.5">
                    <div className="w-14 h-14 rounded-full mx-auto bg-gradient-to-tr from-cyan-600 to-emerald-600 flex items-center justify-center text-white text-xl font-black shadow-lg shadow-cyan-950/60">
                      {call.contactName ? call.contactName.charAt(0).toUpperCase() : <FiUser />}
                    </div>
                    <h3 className="text-sm font-black text-white truncate px-2">{call.contactName || "Customer"}</h3>
                    <div className="text-xs text-neutral-400 truncate">{call.accountName}</div>
                    <div className="text-xs font-mono font-bold text-cyan-300">
                      {formatPhoneNumber(call.targetPhone)}
                    </div>
                  </div>

                  {/* Live Status & Audio Visualizer */}
                  <div className="py-2 px-3 bg-black/40 rounded-2xl border border-white/5 space-y-1.5">
                    <div className="flex items-center justify-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        call.status === "connected"
                          ? "bg-emerald-400 animate-ping"
                          : "bg-amber-400 animate-pulse"
                      }`} />
                      <span className="text-[11px] font-black uppercase tracking-wider text-neutral-300">
                        {call.status === "connected"
                          ? `In Call · ${formatTimer(call.durationSeconds)}`
                          : call.status === "on_hold"
                          ? "On Hold"
                          : call.status === "ringing"
                          ? "Ringing Customer..."
                          : "Connecting Line..."}
                      </span>
                    </div>

                    {/* Microphone Level Waveform Indicator */}
                    {call.status === "connected" && (
                      <div className="flex items-center justify-center gap-1 h-4 pt-0.5">
                        {[15, 30, 60, 90, 75, 45, 80, 50, 20].map((height, i) => (
                          <div
                            key={i}
                            className={`w-1 rounded-full transition-all duration-75 ${
                              call.isMuted
                                ? "bg-neutral-700 h-1"
                                : micActivityLevel > height
                                ? "bg-cyan-400 h-4"
                                : "bg-cyan-900/40 h-1.5"
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* In-Call Keypad (for DTMF extension entry) */}
                  {showKeypad && (
                    <div className="grid grid-cols-3 gap-1.5 bg-black/60 p-2 rounded-2xl border border-white/10 animate-in fade-in duration-100">
                      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map(digit => (
                        <button
                          key={digit}
                          onClick={() => handleKeypadPress(digit)}
                          className="py-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-white font-mono font-bold text-xs cursor-pointer"
                        >
                          {digit}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Primary In-Call Action Controls (5-Col Grid with Copilot) */}
                  <div className="grid grid-cols-5 gap-1.5 pt-0.5">
                    {/* Mute Button */}
                    <button
                      onClick={toggleMute}
                      className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 transition cursor-pointer border ${
                        call.isMuted
                          ? "bg-rose-600/30 border-rose-500 text-rose-300"
                          : "bg-white/5 border-white/10 text-neutral-300 hover:text-white"
                      }`}
                      title={call.isMuted ? "Unmute" : "Mute"}
                    >
                      {call.isMuted ? <FiMicOff size={14} /> : <FiMic size={14} />}
                      <span className="text-[8px] font-bold">{call.isMuted ? "Unmute" : "Mute"}</span>
                    </button>

                    {/* Hold Button */}
                    <button
                      onClick={toggleHold}
                      className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 transition cursor-pointer border ${
                        call.isOnHold
                          ? "bg-amber-600/30 border-amber-500 text-amber-300"
                          : "bg-white/5 border-white/10 text-neutral-300 hover:text-white"
                      }`}
                      title={call.isOnHold ? "Resume" : "Hold"}
                    >
                      {call.isOnHold ? <FiPlay size={14} /> : <FiPause size={14} />}
                      <span className="text-[8px] font-bold">{call.isOnHold ? "Resume" : "Hold"}</span>
                    </button>

                    {/* DTMF Keypad Button */}
                    <button
                      onClick={() => setShowKeypad(!showKeypad)}
                      className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 transition cursor-pointer border ${
                        showKeypad
                          ? "bg-cyan-600/30 border-cyan-500 text-cyan-300"
                          : "bg-white/5 border-white/10 text-neutral-300 hover:text-white"
                      }`}
                      title="Keypad for Phone Trees"
                    >
                      <FiGrid size={14} />
                      <span className="text-[8px] font-bold">Keypad</span>
                    </button>

                    {/* Copilot Intelligence Button */}
                    <button
                      onClick={() => setShowCopilot(!showCopilot)}
                      className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 transition cursor-pointer border ${
                        showCopilot
                          ? "bg-amber-500/30 border-amber-400 text-amber-300 shadow-sm"
                          : "bg-white/5 border-white/10 text-neutral-300 hover:text-white"
                      }`}
                      title="AI Call Copilot & Battle-Cards"
                    >
                      <FiCpu size={14} />
                      <span className="text-[8px] font-bold">Copilot</span>
                    </button>

                    {/* Voicemail Drop */}
                    <button
                      onClick={handleVoicemailDrop}
                      className="p-2.5 rounded-2xl bg-white/5 hover:bg-violet-600/20 border border-white/10 hover:border-violet-500/40 text-violet-300 flex flex-col items-center gap-1 transition cursor-pointer"
                      title="Drop Pre-recorded Voicemail"
                    >
                      <FiVoicemail size={14} />
                      <span className="text-[8px] font-bold">VM Drop</span>
                    </button>
                  </div>

                  {/* Quick Transfer Directory Drawer for Active Calls */}
                  <div className="pt-2 border-t border-white/10 text-left">
                    <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-cyan-400 mb-1">
                      <span>Quick Transfer Call</span>
                      <span className="text-neutral-500 font-normal">Warm / Blind</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {INTERNAL_DIRECTORY.slice(0, 4).map(rep => (
                        <div key={rep.id} className="p-1.5 rounded-xl bg-white/[.04] border border-white/5 flex items-center justify-between">
                          <div className="truncate mr-1">
                            <div className="text-[10px] font-bold text-white truncate">{rep.name}</div>
                            <div className="text-[8px] text-neutral-400">{rep.direct}</div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleTransfer(rep.ext, rep.name, true)}
                              className="px-1.5 py-0.5 rounded bg-amber-600/30 hover:bg-amber-600 text-amber-200 hover:text-white text-[8px] font-bold transition"
                              title="Warm Transfer"
                            >
                              Warm
                            </button>
                            <button
                              onClick={() => handleTransfer(rep.ext, rep.name, false)}
                              className="px-1.5 py-0.5 rounded bg-cyan-600/30 hover:bg-cyan-600 text-cyan-200 hover:text-white text-[8px] font-bold transition"
                              title="Blind Transfer"
                            >
                              Blind
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Big Hangup Button */}
                  <div className="pt-1">
                    <button
                      onClick={endCall}
                      className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-black text-xs flex items-center justify-center gap-2 shadow-xl shadow-rose-950/60 transition cursor-pointer"
                    >
                      <FiPhoneOff size={15} />
                      <span>End Call</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ─── State 3: POST-CALL WRAP-UP & LOGGING ─── */}
              {call.status === "wrap_up" && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-1.5 text-xs font-black text-emerald-400 uppercase tracking-wider">
                      <FiCheckCircle /> Call Completed · {formatTimer(call.durationSeconds)}
                    </div>
                    <button
                      onClick={() => setCall(prev => ({ ...prev, status: "idle" }))}
                      className="text-neutral-500 hover:text-white text-xs cursor-pointer"
                    >
                      Skip
                    </button>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                      Call Outcome Disposition
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {QUICK_DISPOSITIONS.map(d => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setSelectedDisposition(d.outcome)}
                          className={`p-2 rounded-xl text-left border text-[11px] font-semibold transition cursor-pointer ${
                            selectedDisposition === d.outcome
                              ? "bg-cyan-600 text-white border-cyan-400 shadow-sm"
                              : "bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10"
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                      Call Notes
                    </label>
                    <textarea
                      value={callNotes}
                      onChange={e => setCallNotes(e.target.value)}
                      placeholder="Summarize conversation, quantities discussed, delivery dates..."
                      rows={3}
                      className="w-full bg-black/60 border border-white/15 rounded-xl p-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div className="pt-1">
                    <button
                      onClick={handleSaveWrapUp}
                      disabled={isSavingLog}
                      className="w-full py-3 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/50 transition cursor-pointer disabled:opacity-40"
                    >
                      <FiCheck size={14} />
                      <span>{isSavingLog ? "Saving..." : "Save Call Outcome to Account"}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
