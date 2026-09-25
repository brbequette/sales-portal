import Retell from "retell-sdk"
import { NextResponse } from "next/server"
import { evidenceHash, RETELL_EVENTS, retellEvidence, row, validRetellId } from "@/lib/retell-evidence"
import { confirmedRetellAssociation, persistRetellEvidence, persistUnassignedRetellEvidence } from "@/lib/retell-sync"

export async function POST(req: Request) {
  const key = process.env.RETELL_API_KEY
  if (!key) return new Response(null, { status: 503 })
  const signature = req.headers.get("x-retell-signature")
  if (!signature) return new Response(null, { status: 401 })
  try {
    const raw = await req.text()
    if (Buffer.byteLength(raw) > 1024 * 1024) return new Response(null, { status: 413 })
    if (!await Retell.verify(raw, key, signature)) return new Response(null, { status: 401 })
    const body = row(JSON.parse(raw)), call = row(body.call)
    if (!RETELL_EVENTS.includes(String(body.event)) || !validRetellId(call.call_id)) return new Response(null, { status: 204 })
    // Transfer notifications can contain only a call ID; this is still signed
    // event evidence, never sufficient to manufacture a transcript or identity.
    const evidence = retellEvidence(call, call.call_id, true)
    if (!await confirmedRetellAssociation(call.call_id)) {
      // Durably retain events without guessing identity from a forwarded number.
      // A later audited reconciliation can use the exact call ID to read them.
      await persistUnassignedRetellEvidence(evidence, String(body.event), evidenceHash(body))
      return new Response(null, { status: 204 })
    }
    // Include signed attempt context in identity without storing arbitrary raw
    // metadata/URLs. Separate attempts must not collapse into a single event.
    await persistRetellEvidence(evidence, String(body.event), null, evidenceHash(body))
    return new Response(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: "Event not persisted; retry required" }, { status: 503 })
  }
}
