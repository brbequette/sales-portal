"use client"

const SCRIPT_ID = "zoho-voice-websdk"
const SCRIPT_URL = "https://js.zohostatic.com/zvoice_plugin/latest/js/zohovoice.min.js"

type ZohoVoiceClient = {
  makeCall: (options: string | { number: string }) => unknown | Promise<unknown>
}

type ZohoVoiceConstructor = new (options: {
  apiKey: string
  development?: boolean
  debug?: boolean
  draggable?: boolean
}) => ZohoVoiceClient

declare global {
  interface Window {
    ZohoVoice?: ZohoVoiceConstructor
    __titanZohoVoiceClient?: ZohoVoiceClient
    __titanZohoVoicePromise?: Promise<ZohoVoiceClient | null>
  }
}

function loadScript(): Promise<void> {
  if (window.ZohoVoice) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("Zoho Voice WebSDK failed to load")), { once: true })
      return
    }

    const script = document.createElement("script")
    script.id = SCRIPT_ID
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Zoho Voice WebSDK failed to load"))
    document.head.appendChild(script)
  })
}

async function getClient(): Promise<ZohoVoiceClient | null> {
  if (typeof window === "undefined") return null
  if (window.__titanZohoVoiceClient) return window.__titanZohoVoiceClient

  const apiKey = process.env.NEXT_PUBLIC_ZOHO_VOICE_WEBSDK_API_KEY?.trim()
  if (!apiKey) return null

  if (!window.__titanZohoVoicePromise) {
    window.__titanZohoVoicePromise = (async () => {
      await loadScript()
      if (!window.ZohoVoice) throw new Error("Zoho Voice WebSDK is unavailable")
      const client = new window.ZohoVoice({ apiKey, development: false, debug: false, draggable: true })
      window.__titanZohoVoiceClient = client
      return client
    })().catch(error => {
      window.__titanZohoVoicePromise = undefined
      console.error("Zoho Voice WebSDK initialization failed", error)
      return null
    })
  }

  return window.__titanZohoVoicePromise
}

export async function makeZohoVoiceCall(phone: string): Promise<boolean> {
  const normalized = phone.replace(/[^\d+]/g, "")
  if (!normalized) return false

  const client = await getClient()
  if (!client) return false

  await client.makeCall({ number: normalized })
  return true
}

export function hasZohoVoiceWebSdkConfiguration(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_ZOHO_VOICE_WEBSDK_API_KEY?.trim())
}
