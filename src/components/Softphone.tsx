"use client"

import React, { useState, useEffect, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { FiPhone, FiMessageSquare, FiClock, FiMinus, FiPhoneCall, FiPhoneOff, FiSave, FiSearch, FiSend, FiMic, FiVolume2, FiSettings } from "react-icons/fi"
import { useZoho } from "./ZohoProvider"

type SoftphoneTab = "dialer" | "sms" | "recent"

type MediaDeviceOption = {
  deviceId: string
  label: string
}

type ZohoVoiceCallState = {
  callId?: string
  callStatus?: string
  number?: string
  isOutgoing?: boolean
}

type ZohoVoiceSdkConfig = {
  success: boolean
  accessToken?: string
  outboundNumber?: string
  defaultCountry?: string
  error?: string
}

type ZohoVoiceSdk = {
  ajaxOpts?: {
    isOAuth?: boolean
    oAuthCallBack?: (callback: (token: string) => void) => void
  }
  initialize?: () => void
  makeCall?: (numberOrOptions: string | { number: string; name?: string }) => void
  hangUp?: (options?: { callId?: string }) => void
  endCall?: (options?: { callId?: string }) => void
  setOutgoingNumber?: (number: { number: string; numberId?: string; isDefault?: boolean }) => void
  setDefaultCountry?: (country: string) => void
  on?: (eventName: string, callback: (payload?: any) => void) => void
}

declare global {
  interface Window {
    ZohoVoice?: new (options: Record<string, unknown>) => ZohoVoiceSdk
    zohovoice?: ZohoVoiceSdk
  }
}

const ZOHO_VOICE_SDK_SRC = "https://js.zohostatic.com/zvoice_plugin/latest/js/zohovoice.min.js"
let zohoVoiceSdkScriptPromise: Promise<void> | null = null

export default function Softphone() {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<SoftphoneTab>("dialer")
  
  // Dialer State
  const [dialNumber, setDialNumber] = useState("")
  const [callState, setCallState] = useState<"idle" | "calling" | "connected" | "wrapup">("idle")
  const [callDuration, setCallDuration] = useState(0)
  const [callNotes, setCallNotes] = useState("")
  const [callStatus, setCallStatus] = useState("completed")
  const [currentCallId, setCurrentCallId] = useState<string | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const [communicationError, setCommunicationError] = useState("")
  const [voiceSdkStatus, setVoiceSdkStatus] = useState("Zoho Voice SDK not connected")
  const [zohoVoice, setZohoVoice] = useState<ZohoVoiceSdk | null>(null)
  const [zohoVoiceReady, setZohoVoiceReady] = useState(false)
  const zohoVoiceRef = useRef<ZohoVoiceSdk | null>(null)
  const zohoVoiceReadyRef = useRef(false)
  const pendingSdkCallRef = useRef(false)
  const registrationWaitersRef = useRef<Array<{ resolve: () => void; reject: (error: Error) => void }>>([])
  const callStartTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Search State
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [contextAccountName, setContextAccountName] = useState<string | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // SMS State
  const [smsMessages, setSmsMessages] = useState<any[]>([])
  const [smsInput, setSmsInput] = useState("")
  const [isSendingSms, setIsSendingSms] = useState(false)
  const smsEndRef = useRef<HTMLDivElement>(null)

  // Browser media device state
  const [microphones, setMicrophones] = useState<MediaDeviceOption[]>([])
  const [speakers, setSpeakers] = useState<MediaDeviceOption[]>([])
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("")
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("")
  const [mediaStatus, setMediaStatus] = useState("Microphone not connected")
  const [devicePanelOpen, setDevicePanelOpen] = useState(false)
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  // Context State (If we are on an account page, we want to know the account ID)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { zohoContext: currentUser } = useZoho()
  const [contextAccountId, setContextAccountId] = useState<string | null>(null)

  const loadZohoVoiceScript = async () => {
    if (window.ZohoVoice) return
    if (!zohoVoiceSdkScriptPromise) {
      zohoVoiceSdkScriptPromise = new Promise((resolve, reject) => {
        const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${ZOHO_VOICE_SDK_SRC}"]`)
        if (existingScript) {
          existingScript.addEventListener("load", () => resolve(), { once: true })
          existingScript.addEventListener("error", () => reject(new Error("Zoho Voice SDK failed to load")), { once: true })
          return
        }

        const script = document.createElement("script")
        script.src = ZOHO_VOICE_SDK_SRC
        script.async = true
        script.onload = () => resolve()
        script.onerror = () => reject(new Error("Zoho Voice SDK failed to load"))
        document.head.appendChild(script)
      })
    }

    await zohoVoiceSdkScriptPromise
  }

  const updateAccountLastCalled = async () => {
    if (!contextAccountId) return
    await fetch("/api/calls/make", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "mark-connected",
        accountId: contextAccountId,
      })
    }).catch(() => undefined)
  }

  const clearCallStartTimeout = () => {
    if (callStartTimeoutRef.current) {
      clearTimeout(callStartTimeoutRef.current)
      callStartTimeoutRef.current = null
    }
  }

  const failPendingRegistration = (message: string) => {
    registrationWaitersRef.current.splice(0).forEach((waiter) => waiter.reject(new Error(message)))
  }

  const completePendingRegistration = () => {
    registrationWaitersRef.current.splice(0).forEach((waiter) => waiter.resolve())
  }

  const waitForZohoVoiceRegistration = () => {
    if (zohoVoiceReadyRef.current) return Promise.resolve()

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        registrationWaitersRef.current = registrationWaitersRef.current.filter((waiter) => waiter.resolve !== resolve)
        reject(new Error("Zoho Voice did not register the browser phone. Open audio settings and confirm the SDK status before dialing."))
      }, 15000)

      registrationWaitersRef.current.push({
        resolve: () => {
          clearTimeout(timeout)
          resolve()
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      })
    })
  }

  const initializeZohoVoiceSdk = async () => {
    if (zohoVoiceRef.current) return zohoVoiceRef.current

    setVoiceSdkStatus("Connecting Zoho Voice SDK...")
    await loadZohoVoiceScript()
    const res = await fetch("/api/zoho-voice/sdk-config", { cache: "no-store" })
    const config: ZohoVoiceSdkConfig = await res.json()

    if (!res.ok || !config.success || !config.accessToken) {
      throw new Error(config.error || "Zoho Voice SDK config is unavailable")
    }
    if (!config.outboundNumber) {
      throw new Error("No outbound Zoho Voice number is configured. Configure one in Admin > Communications.")
    }
    if (!window.ZohoVoice) {
      throw new Error("Zoho Voice SDK is unavailable in this browser")
    }
    const accessToken = config.accessToken

    const sdk = new window.ZohoVoice({
      development: false,
      debug: false,
      autoRegister: true,
      defaultCountry: config.defaultCountry || "us",
      outgoingNumber: {
        number: config.outboundNumber,
        numberId: config.outboundNumber,
        isDefault: true,
      },
      outgoingNumberList: [{
        number: config.outboundNumber,
        numberId: config.outboundNumber,
        isDefault: true,
      }],
    })

    sdk.ajaxOpts = sdk.ajaxOpts || {}
    sdk.ajaxOpts.isOAuth = true
    sdk.ajaxOpts.oAuthCallBack = (callback) => callback(accessToken)

    sdk.on?.("regState", (regObject: any) => {
      const rawStatus = String(regObject?.status || "")
      const status = rawStatus.toLowerCase()
      const isRegistered = status === "registered"
      zohoVoiceReadyRef.current = isRegistered
      setZohoVoiceReady(isRegistered)
      setVoiceSdkStatus(rawStatus ? `Zoho Voice ${rawStatus}` : "Zoho Voice registration changed")
      if (isRegistered) {
        completePendingRegistration()
      } else if (status === "failed" || status === "error" || status === "disconnected" || status === "websocket closed" || status === "unregistered") {
        failPendingRegistration(`Zoho Voice registration ${status}`)
      }
    })

    sdk.on?.("callState", (callerObject?: ZohoVoiceCallState) => {
      const status = String(callerObject?.callStatus || "").toLowerCase()
      if (callerObject?.callId) setCurrentCallId(callerObject.callId)
      if (callerObject?.number) setDialNumber(callerObject.number)

      if (status === "connecting" || status === "ringing" || status === "incoming") {
        clearCallStartTimeout()
        pendingSdkCallRef.current = false
        setCallState("calling")
      } else if (status === "connected") {
        clearCallStartTimeout()
        pendingSdkCallRef.current = false
        setCallState("connected")
        updateAccountLastCalled()
      } else if (status === "callend" || status === "ended" || status === "disconnected") {
        clearCallStartTimeout()
        pendingSdkCallRef.current = false
        setCallState((state) => state === "idle" ? "idle" : "wrapup")
      }
    })

    sdk.on?.("error", (errorObject: any) => {
      clearCallStartTimeout()
      pendingSdkCallRef.current = false
      setCallState("idle")
      setCommunicationError(errorObject?.desc || errorObject?.message || "Zoho Voice could not place the call")
    })

    sdk.on?.("login", () => {
      zohoVoiceReadyRef.current = true
      setZohoVoiceReady(true)
      setVoiceSdkStatus("Zoho Voice ready")
      completePendingRegistration()
    })

    sdk.initialize?.()
    if (config.outboundNumber) {
      sdk.setOutgoingNumber?.({
        number: config.outboundNumber,
        numberId: config.outboundNumber,
        isDefault: true,
      })
    }
    sdk.setDefaultCountry?.("us")

    window.zohovoice = sdk
    zohoVoiceRef.current = sdk
    setZohoVoice(sdk)
    return sdk
  }

  // Try to infer the Account ID from the URL context
  useEffect(() => {
    if (!pathname) return
    let accId = null
    
    // E.g. /account?id=cls...
    if (pathname.includes("/account") && searchParams?.get("id")) {
      accId = searchParams.get("id")
    }
    // E.g. /collections (might need to select row context, but for now we leave it null)
    
    setContextAccountId(accId)
  }, [pathname, searchParams])

  // Call Timer
  useEffect(() => {
    if (callState === "connected") {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1)
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [callState])

  useEffect(() => {
    if (contextAccountId) {
      fetchSmsHistory(contextAccountId)
    }
  }, [contextAccountId])

  useEffect(() => {
    const storedMic = window.localStorage.getItem("softphone.microphoneId") || ""
    const storedSpeaker = window.localStorage.getItem("softphone.speakerId") || ""
    setSelectedMicrophoneId(storedMic)
    setSelectedSpeakerId(storedSpeaker)
    refreshMediaDevices()
    initializeZohoVoiceSdk().catch((err) => {
      setVoiceSdkStatus(err instanceof Error ? err.message : "Zoho Voice SDK is unavailable")
    })

    if (!navigator.mediaDevices?.addEventListener) return
    navigator.mediaDevices.addEventListener("devicechange", refreshMediaDevices)
    return () => navigator.mediaDevices.removeEventListener("devicechange", refreshMediaDevices)
  }, [])

  useEffect(() => {
    if (!selectedSpeakerId || !audioPreviewRef.current) return
    const audioEl = audioPreviewRef.current as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> }
    if (!audioEl.setSinkId) return
    audioEl.setSinkId(selectedSpeakerId).catch(() => {
      setMediaStatus("This browser blocked speaker selection")
    })
  }, [selectedSpeakerId])

  useEffect(() => {
    smsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [smsMessages])

  // Search Debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }
    const delay = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await fetch(`/api/global-search?q=${encodeURIComponent(searchQuery)}`)
        const data = await res.json()
        if (data.success && data.results?.accounts) {
          setSearchResults(data.results.accounts)
        }
      } catch (e) { }
      setIsSearching(false)
    }, 300)
    return () => clearTimeout(delay)
  }, [searchQuery])

  // Click outside search
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults([])
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelectAccount = async (acc: any) => {
    setContextAccountId(acc.id)
    setContextAccountName(acc.name)
    setSearchQuery("")
    setSearchResults([])

    // Fetch account details to get phone number
    try {
      const res = await fetch(`/api/get-account-details?id=${acc.id}`)
      const data = await res.json()
      if (data.success && data.account.contacts?.length > 0) {
        const contact = data.account.contacts.find((c:any) => c.isPrimary) || data.account.contacts[0]
        const num = contact.mobilePhone || contact.phone
        if (num) {
          setDialNumber(num.replace(/[^\d+]/g, ''))
        }
      }
    } catch (e) {}
  }

  const fetchSmsHistory = async (accountId: string) => {
    try {
      const res = await fetch(`/api/messages/${accountId}`)
      const data = await res.json()
      if (data.success) {
        setSmsMessages(data.messages)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleSendSms = async () => {
    if (!smsInput.trim() || !contextAccountId) return

    const lastOurMsg = [...smsMessages].reverse().find(m => m.direction === 'OUTBOUND')
    const fromNumber = lastOurMsg?.fromNumber

    try {
      setIsSendingSms(true)
      const res = await fetch(`/api/messages/${contextAccountId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: smsInput, fromNumber })
      })
      const data = await res.json()
      if (data.success) {
        setSmsInput('')
        fetchSmsHistory(contextAccountId)
      } else {
        alert('Error sending message: ' + data.error)
      }
    } catch (e) {
      alert('Error sending message.')
    } finally {
      setIsSendingSms(false)
    }
  }

  const refreshMediaDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMediaStatus("Browser media devices are unavailable")
      return
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }))
      const audioOutputs = devices
        .filter((device) => device.kind === "audiooutput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Speaker ${index + 1}`,
        }))

      setMicrophones(audioInputs)
      setSpeakers(audioOutputs)
      setSelectedMicrophoneId((current) => current || audioInputs[0]?.deviceId || "")
      setSelectedSpeakerId((current) => current || audioOutputs[0]?.deviceId || "")
    } catch {
      setMediaStatus("Unable to list audio devices")
    }
  }

  const prepareMedia = async (microphoneId = selectedMicrophoneId) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaStatus("Browser microphone access is unavailable")
      return false
    }

    try {
      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: microphoneId ? { deviceId: { exact: microphoneId } } : true,
      })
      localStreamRef.current = stream
      setMediaStatus("Microphone ready")
      await refreshMediaDevices()
      return true
    } catch {
      setMediaStatus("Microphone permission is required before dialing")
      return false
    }
  }

  const handleMicrophoneChange = async (deviceId: string) => {
    setSelectedMicrophoneId(deviceId)
    window.localStorage.setItem("softphone.microphoneId", deviceId)
    await prepareMedia(deviceId)
  }

  const handleSpeakerChange = async (deviceId: string) => {
    setSelectedSpeakerId(deviceId)
    window.localStorage.setItem("softphone.speakerId", deviceId)
    setMediaStatus(deviceId ? "Speaker ready" : mediaStatus)
  }

  // Global Event Listener
  useEffect(() => {
    const handleOpenSoftphone = (e: any) => {
      setIsOpen(true)
      setCommunicationError("")
      setCallState((state) => state === "wrapup" ? state : "idle")
      if (e.detail?.number) {
        setDialNumber(e.detail.number)
      }
      if (e.detail?.accountId) {
        setContextAccountId(e.detail.accountId)
      }
      if (e.detail?.accountName) {
        setContextAccountName(e.detail.accountName)
      }
      if (e.detail?.tab) {
        setActiveTab(e.detail.tab)
      }
      if (e.detail?.message || e.detail?.text) {
        setSmsInput(e.detail.message || e.detail.text)
        setActiveTab("sms")
      }
      prepareMedia()
    }
    
    window.addEventListener("open-softphone", handleOpenSoftphone)
    return () => window.removeEventListener("open-softphone", handleOpenSoftphone)
  }, [])

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  const handleDialClick = (digit: string) => {
    setDialNumber((prev) => prev + digit)
  }

  const handleBackspace = () => {
    setDialNumber((prev) => prev.slice(0, -1))
  }

  const handleInitiateCall = async () => {
    if (!dialNumber) return
    const mediaReady = await prepareMedia()
    if (!mediaReady) return
    setCommunicationError("")
    pendingSdkCallRef.current = true

    try {
      const sdk = zohoVoice || await initializeZohoVoiceSdk()
      await waitForZohoVoiceRegistration()
      if (!sdk.makeCall) {
        throw new Error("Zoho Voice SDK does not expose outbound dialing in this browser session")
      }

      setCallState("calling")
      clearCallStartTimeout()
      callStartTimeoutRef.current = setTimeout(() => {
        if (!pendingSdkCallRef.current) return
        pendingSdkCallRef.current = false
        setCallState("idle")
        setCommunicationError("Zoho Voice did not start the outbound call. Confirm the agent is available in Zoho Voice and the selected outbound number is assigned to this user.")
      }, 12000)

      sdk.makeCall({
        number: dialNumber.replace(/[^\d+]/g, ""),
        name: contextAccountName || "Titan customer",
      })
      return
    } catch (err) {
      clearCallStartTimeout()
      pendingSdkCallRef.current = false
      setCommunicationError(err instanceof Error ? err.message : "Zoho Voice SDK call failed")
      setCallState("idle")
      return
    }
    
  }

  const handleEndCall = () => {
    const callId = currentCallId || undefined
    zohoVoiceRef.current?.hangUp?.({ callId })
    zohoVoiceRef.current?.endCall?.({ callId })
    clearCallStartTimeout()
    pendingSdkCallRef.current = false
    setCallState("wrapup")
  }

  const handleSaveWrapup = async () => {
    if (!contextAccountId && !confirm("No Account context detected. Save log anyway?")) {
       return
    }

    try {
      const res = await fetch("/api/calls/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: contextAccountId || "unknown", // Normally require a real ID
          fromNumber: currentUser?.email || "Softphone",
          toNumber: dialNumber,
          direction: "OUTBOUND",
          duration: callDuration,
          status: callStatus,
          notes: callNotes,
          zohoCallId: currentCallId
        })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        setCommunicationError(data.error || "Failed to save call log.")
        return
      }
      
      // Reset state
      setCallState("idle")
      setDialNumber("")
      setCallDuration(0)
      setCallNotes("")
      setCurrentCallId(null)
      setCommunicationError("")
      
    } catch (err) {
      setCommunicationError("Failed to save call log.")
    }
  }

  if (!isOpen) {
    return (
      <div 
        className="fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-2xl cursor-pointer hover:bg-blue-700 transition-all z-50 flex items-center justify-center"
        onClick={() => setIsOpen(true)}
        style={{ width: "60px", height: "60px" }}
      >
        <FiPhone size={24} />
      </div>
    )
  }

  return (
    <div className="fixed bottom-0 right-6 w-80 bg-slate-900 border border-slate-700 rounded-t-xl shadow-2xl z-50 flex flex-col overflow-hidden transition-all duration-300" style={{ height: "650px", maxHeight: "85vh" }}>
      {/* Header */}
      <div className="bg-slate-800 p-3 flex flex-col border-b border-slate-700">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-white font-medium text-sm">Communications Hub</span>
          </div>
          <div className="flex items-center text-slate-400 gap-3">
            <button onClick={() => setDevicePanelOpen((open) => !open)} className="hover:text-white transition-colors" title="Audio devices">
              <FiSettings />
            </button>
            <button onClick={() => setIsOpen(false)} className="hover:text-white transition-colors">
              <FiMinus />
            </button>
          </div>
        </div>

        {devicePanelOpen && (
          <div className="mb-3 grid gap-2 text-xs">
            <audio ref={audioPreviewRef} className="hidden" aria-hidden="true" />
            <label className="flex items-center gap-2 text-slate-300">
              <FiMic className="text-slate-500 flex-shrink-0" />
              <select
                value={selectedMicrophoneId}
                onChange={(e) => handleMicrophoneChange(e.target.value)}
                className="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white"
              >
                {microphones.length === 0 ? (
                  <option value="">No microphone found</option>
                ) : microphones.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-slate-300">
              <FiVolume2 className="text-slate-500 flex-shrink-0" />
              <select
                value={selectedSpeakerId}
                onChange={(e) => handleSpeakerChange(e.target.value)}
                className="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white"
              >
                {speakers.length === 0 ? (
                  <option value="">System default speaker</option>
                ) : speakers.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                ))}
              </select>
            </label>
            <div className="text-[11px] text-slate-500">{mediaStatus}</div>
            <div className={`text-[11px] ${zohoVoiceReady ? "text-emerald-400" : "text-amber-300"}`}>{voiceSdkStatus}</div>
          </div>
        )}
        
        {/* Search Bar */}
        <div className="relative" ref={searchRef}>
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 focus-within:border-blue-500 transition-colors">
            <FiSearch className="text-slate-500 mr-2" />
            <input 
              type="text" 
              placeholder="Search Accounts..." 
              className="bg-transparent text-sm text-white w-full outline-none placeholder:text-slate-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => { if (searchQuery.length >= 2 && searchResults.length === 0) setSearchQuery(searchQuery + ' ') }}
            />
          </div>
          
          {/* Search Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-md shadow-xl z-50 max-h-48 overflow-y-auto">
              {searchResults.map((acc: any) => (
                <div 
                  key={acc.id} 
                  className="p-2 border-b border-slate-700 last:border-0 hover:bg-slate-700 cursor-pointer"
                  onClick={() => handleSelectAccount(acc)}
                >
                  <div className="text-white text-sm">{acc.name}</div>
                  {acc.industry && <div className="text-xs text-slate-400">{acc.industry}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-900">
        <button 
          onClick={() => setActiveTab("dialer")}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-2 ${activeTab === "dialer" ? "text-blue-400 border-b-2 border-blue-400 bg-slate-800" : "text-slate-400 hover:text-slate-300"}`}
        >
          <FiPhone /> Keypad
        </button>
        <button 
          onClick={() => setActiveTab("sms")}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-2 ${activeTab === "sms" ? "text-blue-400 border-b-2 border-blue-400 bg-slate-800" : "text-slate-400 hover:text-slate-300"}`}
        >
          <FiMessageSquare /> SMS
        </button>
        <button 
          onClick={() => setActiveTab("recent")}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-2 ${activeTab === "recent" ? "text-blue-400 border-b-2 border-blue-400 bg-slate-800" : "text-slate-400 hover:text-slate-300"}`}
        >
          <FiClock /> Recent
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 bg-slate-950 p-4 flex flex-col relative overflow-y-auto overflow-x-hidden scrollbar-thin">
        
        {activeTab === "dialer" && (
          <div className="flex flex-col h-full min-h-[500px]">
            {callState === "wrapup" ? (
              <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4">
                <h3 className="text-white font-medium mb-4">Call Wrap-up</h3>
                <div className="mb-4">
                  <label className="text-xs text-slate-400 mb-1 block">Outcome</label>
                  <select 
                    value={callStatus}
                    onChange={(e) => setCallStatus(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white"
                  >
                    <option value="completed">Completed</option>
                    <option value="voicemail">Left Voicemail</option>
                    <option value="no_answer">No Answer</option>
                    <option value="busy">Busy</option>
                    <option value="wrong_number">Wrong Number</option>
                  </select>
                </div>
                <div className="mb-4 flex-1 flex flex-col">
                  <label className="text-xs text-slate-400 mb-1 block">Notes</label>
                  <textarea 
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white flex-1 resize-none"
                    placeholder="Type call notes here..."
                  ></textarea>
                </div>
                <button 
                  onClick={handleSaveWrapup}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-medium flex items-center justify-center gap-2"
                >
                  <FiSave /> Save Log
                </button>
              </div>
            ) : (
              <>
                {/* Number Display */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-6 flex flex-col items-center justify-center min-h-24">
                  <div className="text-3xl text-white font-light tracking-wider overflow-hidden text-ellipsis whitespace-nowrap w-full text-center">
                    {dialNumber || "..."}
                  </div>
                  {contextAccountName ? (
                    <div className="text-xs text-blue-400 mt-2 flex items-center gap-1 font-medium">
                      <span>{contextAccountName}</span>
                    </div>
                  ) : contextAccountId ? (
                    <div className="text-xs text-blue-400 mt-2 flex items-center gap-1">
                      <span>Linked Context Detected</span>
                    </div>
                  ) : null}
                  {callState === "connected" && (
                    <div className="text-emerald-400 font-mono mt-2 flex items-center gap-2 animate-pulse">
                      <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                      {formatDuration(callDuration)}
                    </div>
                  )}
                  {callState === "calling" && (
                    <div className="text-blue-400 font-mono mt-2 animate-pulse">
                      {pendingSdkCallRef.current ? "Dialing through Zoho Voice..." : "Calling..."}
                    </div>
                  )}
                  {communicationError && (
                    <div className="text-red-300 text-xs mt-2 text-center">
                      {communicationError}
                    </div>
                  )}
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-3 mb-6 px-4">
                  {['1','2','3','4','5','6','7','8','9','*','0','#'].map((digit) => (
                    <button 
                      key={digit}
                      onClick={() => handleDialClick(digit)}
                      className="aspect-square rounded-full bg-slate-800 hover:bg-slate-700 text-white text-xl font-light flex items-center justify-center transition-colors active:bg-slate-600"
                    >
                      {digit}
                    </button>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex justify-center gap-6 mt-auto pb-6">
                  {callState === "idle" && (
                    <button 
                      onClick={handleInitiateCall}
                      disabled={!dialNumber}
                      className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 transition-transform active:scale-95 disabled:opacity-50"
                    >
                      <FiPhoneCall size={24} />
                    </button>
                  )}
                  {(callState === "calling" || callState === "connected") && (
                    <button 
                      onClick={handleEndCall}
                      className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/20 transition-transform active:scale-95"
                    >
                      <FiPhoneOff size={24} />
                    </button>
                  )}
                  {callState === "idle" && (
                    <button 
                      onClick={handleBackspace}
                      disabled={!dialNumber}
                      className="w-16 h-16 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center disabled:opacity-50"
                    >
                      <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" height="24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><line x1="18" y1="9" x2="12" y2="15"></line><line x1="12" y1="9" x2="18" y2="15"></line></svg>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "sms" && (
          <div className="flex flex-col h-full relative">
            {!contextAccountId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-sm text-center">
                <FiSearch size={32} className="mb-4 text-slate-700" />
                <p>Search and select an account above to text them.</p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto mb-14 scrollbar-thin pr-2 flex flex-col gap-3">
                  {smsMessages.length === 0 ? (
                    <div className="text-center text-slate-500 text-xs py-4">No message history found.</div>
                  ) : (
                    smsMessages.map((msg, i) => {
                      const isMe = msg.direction === 'OUTBOUND'
                      return (
                        <div key={msg.id || i} className={`flex flex-col max-w-[85%] ${isMe ? 'self-end' : 'self-start'}`}>
                          <div className={`p-3 text-sm rounded-lg ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'}`}>
                            {msg.body}
                          </div>
                          <div className={`text-[10px] text-slate-500 mt-1 ${isMe ? 'text-right' : 'text-left'}`}>
                            {new Date(msg.createdAt).toLocaleDateString()} {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={smsEndRef} />
                </div>
                
                {/* SMS Input */}
                <div className="absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 pt-2 flex items-end gap-2">
                  <textarea 
                    value={smsInput}
                    onChange={(e) => setSmsInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendSms()
                      }
                    }}
                    placeholder="Type message..."
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white resize-none max-h-24 scrollbar-thin"
                    rows={1}
                  />
                  <button 
                    onClick={handleSendSms}
                    disabled={isSendingSms || !smsInput.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white p-2.5 rounded-lg flex-shrink-0 transition-colors"
                  >
                    <FiSend />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "recent" && (
          <div className="flex flex-col h-full overflow-y-auto">
             <div className="text-xs text-slate-500 text-center py-8">
               Recent calls will appear here.
             </div>
          </div>
        )}

      </div>
    </div>
  )
}
