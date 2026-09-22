"use client"

import { useEffect, useMemo, useState } from "react"
import { FiAlertTriangle, FiCheckCircle, FiImage, FiSend } from "react-icons/fi"
import { useZoho } from "@/components/ZohoProvider"
import { isAdministratorRole } from "@/lib/roles"
import {
  blobToDataUrl,
  normalizeSingleRecipient,
  optimizeMmsImage,
  submitMmsCanary,
  type MmsCanaryResult,
  type OptimizedMmsImage,
} from "@/lib/mms-canary"

type Step = "edit" | "confirm" | "result"
const APPROVED_CANARY_RECIPIENT = "+16183355304"
const APPROVED_CANARY_MESSAGE = "🔥 FREE WASHER & DRYER! 🔥 Purchase a contractor pack of select Titan premium diamond blades and get a washer-and-dryer set FREE! Limited-time offer—call or text us today to claim yours!"

export function MmsCanaryPanel() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const administrator = isAdministratorRole(currentUser?.role)
  const [recipient, setRecipient] = useState(APPROVED_CANARY_RECIPIENT)
  const [sender, setSender] = useState("")
  const [message, setMessage] = useState(APPROVED_CANARY_MESSAGE)
  const [image, setImage] = useState<OptimizedMmsImage | null>(null)
  const [imageDataUrl, setImageDataUrl] = useState("")
  const [step, setStep] = useState<Step>("edit")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<MmsCanaryResult | null>(null)
  const [suppression, setSuppression] = useState<{ allowed: boolean; protectedSuppression: boolean; technicalSuppression: boolean; reason: string | null; providerCode: string | null; lastCheckedAt: string | null } | null>(null)

  useEffect(() => {
    if (!isInitialized || !administrator) return
    let active = true
    void fetch("/api/manage-zoho-numbers", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load the configured Zoho Voice sender.")
        const numbers = Array.isArray(payload.numbers) ? payload.numbers : []
        const configured = numbers.find((number: { isDefault?: boolean }) => number.isDefault) || numbers[0]
        if (active && configured?.number) setSender(String(configured.number))
      })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load sender configuration.") })
    return () => { active = false }
  }, [administrator, isInitialized])

  const confirmation = useMemo(() => {
    if (step === "edit") return null
    try {
      return { recipient: normalizeSingleRecipient(recipient), sender: normalizeSingleRecipient(sender) }
    } catch { return null }
  }, [recipient, sender, step])

  async function handleImage(file: File | undefined) {
    setError("")
    setImage(null)
    setImageDataUrl("")
    if (!file) return
    setBusy(true)
    try {
      const optimized = await optimizeMmsImage(file)
      setImage(optimized)
      setImageDataUrl(await blobToDataUrl(optimized.blob))
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : "Image optimization failed.")
    } finally {
      setBusy(false)
    }
  }

  async function review() {
    setError("")
    try {
      const normalizedRecipient = normalizeSingleRecipient(recipient)
      normalizeSingleRecipient(sender)
      if (!message.trim()) throw new Error("Message is required.")
      if (!image || !imageDataUrl) throw new Error("Choose and optimize an image before review.")
      const response = await fetch("/api/admin/sms-suppression-preflight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: normalizedRecipient, traffic: "TEST" }) })
      const decision = await response.json()
      if (!response.ok) throw new Error(decision.error || "Suppression status unavailable")
      setSuppression(decision)
      setStep("confirm")
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Review the canary fields.")
    }
  }

  async function sendOnce() {
    if (!confirmation || busy) return
    setBusy(true)
    setError("")
    try {
      const sendResult = await submitMmsCanary({ recipient: confirmation.recipient, sender: confirmation.sender, message, imageDataUrl })
      setResult(sendResult)
      setStep("result")
    } catch (sendError) {
      setResult(null)
      setError(sendError instanceof Error ? sendError.message : "The canary request failed.")
      setStep("result")
    } finally {
      setBusy(false)
    }
  }

  if (!isInitialized || !administrator) return null

  return (
    <section data-testid="mms-canary-panel" className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/[.06] p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2 text-amber-300"><FiSend /></div>
        <div>
          <h2 className="text-lg font-black text-white">Secure MMS Canary</h2>
          <p className="text-sm text-neutral-400">Sends one authenticated test message only. This panel never creates or starts a campaign and never retries automatically.</p>
        </div>
      </div>

      {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"><FiAlertTriangle className="mt-0.5 shrink-0" />{error}</div>}

      {step === "edit" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-bold uppercase tracking-wide text-neutral-400">Recipient phone number
              <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="+16185551234" inputMode="tel" className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-neutral-400">Sender number
              <input value={sender} onChange={(event) => setSender(event.target.value)} placeholder="Configured Zoho Voice sender" inputMode="tel" className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none" />
            </label>
          </div>
          <label className="block text-xs font-bold uppercase tracking-wide text-neutral-400">Message
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none" />
          </label>
          <label className="block rounded-xl border border-dashed border-white/15 bg-black/20 p-4 text-sm text-neutral-300">
            <span className="flex items-center gap-2 font-bold text-white"><FiImage /> JPEG or PNG image</span>
            <span className="mt-1 block text-xs text-neutral-500">Optimized locally to JPEG, at most 1024 × 1536 and 900,000 bytes.</span>
            <input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={(event) => void handleImage(event.target.files?.[0])} className="mt-3 block w-full text-xs" />
          </label>
          {image && <dl className="grid gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[.06] p-4 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-neutral-500">Filename</dt><dd className="break-all font-medium text-white">{image.filename}</dd></div>
            <div><dt className="text-xs text-neutral-500">Dimensions</dt><dd className="font-medium text-white">{image.width} × {image.height}</dd></div>
            <div><dt className="text-xs text-neutral-500">MIME type</dt><dd className="font-medium text-white">{image.mimeType}</dd></div>
            <div><dt className="text-xs text-neutral-500">Byte size</dt><dd className="font-medium text-white">{image.byteSize.toLocaleString()}</dd></div>
          </dl>}
          <div className="flex justify-end"><button type="button" onClick={() => void review()} disabled={busy} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-black text-black disabled:opacity-50">{busy ? "Optimizing…" : "Review exact send"}</button></div>
        </div>
      )}

      {step === "confirm" && confirmation && image && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-500/30 bg-black/30 p-4">
            <div className="mb-3 text-xs font-black uppercase tracking-widest text-amber-300">Exact confirmation</div>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-neutral-500">Recipient</dt><dd className="font-mono text-white">{confirmation.recipient}</dd></div>
              <div><dt className="text-neutral-500">Sender</dt><dd className="font-mono text-white">{confirmation.sender}</dd></div>
              <div><dt className="text-neutral-500">Message</dt><dd className="whitespace-pre-wrap text-white">{message.trim()}</dd></div>
              <div><dt className="text-neutral-500">Image</dt><dd className="text-white">{image.filename} · {image.width} × {image.height} · {image.mimeType} · {image.byteSize.toLocaleString()} bytes</dd></div>
            </dl>
            <div className={`mt-4 rounded-lg border p-3 text-sm ${suppression?.allowed ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-red-500/30 bg-red-500/10 text-red-200"}`}>
              <strong>Suppression preflight:</strong> {suppression?.allowed ? "Sendable" : "BLOCKED"}{suppression?.protectedSuppression ? " · protected opt-out/legal restriction" : ""}{suppression?.technicalSuppression ? " · technical suppression" : ""}{suppression?.reason ? ` · ${suppression.reason}` : ""}{suppression?.providerCode ? ` · ${suppression.providerCode}` : ""}{suppression?.lastCheckedAt ? ` · checked ${new Date(suppression.lastCheckedAt).toLocaleString()}` : ""}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setStep("edit")} disabled={busy} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-neutral-300">Back</button>
            <button type="button" onClick={() => void sendOnce()} disabled={busy || !suppression?.allowed} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{busy ? "Sending once…" : "Send exactly one MMS"}</button>
          </div>
        </div>
      )}

      {step === "result" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 font-bold text-white"><FiCheckCircle className="text-emerald-400" /> Provider result</div>
          <pre className="max-h-96 overflow-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs text-neutral-200">{JSON.stringify(result || { error }, null, 2)}</pre>
          <button type="button" onClick={() => { setStep("edit"); setResult(null); setError("") }} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-neutral-300">Prepare another review</button>
        </div>
      )}
    </section>
  )
}
