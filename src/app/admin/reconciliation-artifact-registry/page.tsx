"use client"

import { useState } from "react"

const CHUNK_SIZE = 512 * 1024
export default function ReconciliationArtifactRegistryPage() {
  const [file, setFile] = useState<File | null>(null); const [progress, setProgress] = useState(0); const [status, setStatus] = useState("No package selected"); const [cancelled, setCancelled] = useState(false)
  async function upload() {
    if (!file || file.size > 8 * 1024 * 1024 || !file.name.endsWith(".json.gz")) { setStatus("Select a valid registration package"); return }
    setCancelled(false); const sessionId = crypto.randomUUID(); const total = Math.ceil(file.size / CHUNK_SIZE)
    for (let index = 0; index < total; index++) {
      if (cancelled) { setStatus("Upload cancelled"); return }
      const bytes = new Uint8Array(await file.slice(index * CHUNK_SIZE, Math.min(file.size, (index + 1) * CHUNK_SIZE)).arrayBuffer()); let binary = ""; bytes.forEach(byte => { binary += String.fromCharCode(byte) })
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(byte => byte.toString(16).padStart(2, "0")).join("")
      const response = await fetch("/.netlify/functions/reconciliation-artifact-registration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chunk", sessionId, index, total, sha256, data: btoa(binary) }) })
      if (!response.ok) { setStatus("Upload rejected"); return }; setProgress(Math.round(((index + 1) / total) * 100))
    }
    const response = await fetch("/.netlify/functions/reconciliation-artifact-registration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "finalize", sessionId, total }) })
    setStatus(response.ok ? "REGISTERED_UNAPPROVED" : "Registration rejected")
  }
  return <main><h1>Reconciliation Artifact Registry</h1><p>Administrator-only registration. Approval and Apply are unavailable.</p><input type="file" accept=".json.gz" onChange={event => setFile(event.target.files?.[0] || null)} /><button type="button" onClick={() => void upload()} disabled={!file}>Register package</button><button type="button" onClick={() => setCancelled(true)}>Cancel</button><p>{status} {progress}%</p></main>
}
