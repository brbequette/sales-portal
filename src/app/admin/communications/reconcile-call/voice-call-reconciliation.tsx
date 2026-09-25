"use client"
import { useEffect, useState } from "react"
import type { VoicePreview } from "@/lib/voice-call-preview"

export default function VoiceCallReconciliation() {
  const [fields, setFields] = useState({ zohoCallId: "", retellCallId: "", accountId: "", contactId: "", taskId: "", reason: "" })
  const [preview, setPreview] = useState<{ preview: VoicePreview; token: string; accountName: string; previousAccountId: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [callId, setCallId] = useState("")
  const [audioUrl, setAudioUrl] = useState("")
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl) }, [audioUrl])
  async function submit(mode: "preview" | "apply") {
    if (busy) return
    setBusy(true); setMessage("")
    try {
      const response = await fetch("/api/admin/communications/reconcile-call", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "preview" ? { mode, ...fields, contactId: fields.contactId || null } : { mode, token: preview?.token }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Reconciliation failed")
      if (mode === "preview") { setPreview(data); setCallId(""); setAudioUrl(""); setMessage("Preview ready. Review the exact call, account and evidence before applying.") }
      else { setCallId(data.callId); setPreview(null); setMessage(`${data.replay ? "Existing association verified" : "Portal call association saved"}. Existing task preserved. Native CRM Calls synchronization is NOT complete.`) }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed")
      if (mode === "apply") setPreview(null)
    } finally { setBusy(false) }
  }
  async function play() {
    setBusy(true)
    try {
      const response = await fetch("/api/admin/communications/call-recording", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callId }) })
      if (!response.ok) throw new Error((await response.json()).error || "Recording unavailable")
      setAudioUrl(URL.createObjectURL(await response.blob()))
    } catch (error) { setMessage(error instanceof Error ? error.message : "Recording unavailable") }
    finally { setBusy(false) }
  }
  const labels = { zohoCallId: "Zoho Voice call ID", retellCallId: "Retell call reference (human-confirmed)", accountId: "Portal account ID", contactId: "Portal contact ID (optional)", taskId: "Existing CRM task ID", reason: "Human-confirmed association reason" }
  return <div className="page-content max-w-3xl space-y-4">
    <h1 className="page-title">Reconcile one voice call</h1>
    <p>Preview one provider call, then save its confirmed account association. This does not create tasks, send messages or create a CRM Calls record.</p>
    <fieldset disabled={busy} className="space-y-3">
      {(Object.keys(labels) as Array<keyof typeof labels>).map(key => <label key={key} className="block">{labels[key]}
        <input className="block w-full rounded border p-2 bg-transparent" value={fields[key]} onChange={event => { setFields({ ...fields, [key]: event.target.value }); setPreview(null); setCallId(""); setAudioUrl("") }} />
      </label>)}
      <button onClick={() => submit("preview")} className="btn-primary">{busy ? "Working…" : "Preview exact call"}</button>
    </fieldset>
    <p role="status" aria-live="polite">{message}</p>
    {preview && <section className="space-y-3 rounded border p-4">
      <h2>Confirm association with {preview.accountName}</h2>
      <p>Previous account: {preview.previousAccountId || "No existing call"}. Basis: human confirmation; Retell reference is not independently verified.</p>
      <p>{preview.preview.evidence.zohoCallId} · {preview.preview.evidence.direction} · {preview.preview.evidence.status} · {preview.preview.evidence.startedAt}</p>
      <p>{preview.preview.evidence.fromNumber} → {preview.preview.evidence.toNumber} · {preview.preview.evidence.duration} seconds</p>
      <p>Recording: {preview.preview.evidence.recordingFilename ? "Provider filename available; playback requires verification" : "Unavailable; filename will not be guessed"}</p>
      <pre className="whitespace-pre-wrap">{preview.preview.transcript}</pre>
      <p>{preview.preview.reason}</p>
      <button disabled={busy} className="btn-primary" onClick={() => submit("apply")}>{busy ? "Saving…" : "Apply confirmed association"}</button>
    </section>}
    {callId && <section><p>Portal call ID: {callId}</p><button disabled={busy} onClick={play}>Load protected recording</button></section>}
    {audioUrl && <audio controls src={audioUrl} />}
  </div>
}
