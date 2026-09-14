import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function POST(req: NextRequest) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const body = await req.json().catch(() => ({}))
  const writeBack = body.writeBack === true
  const actorId = auth.session?.user?.dbId || auth.session?.user?.id
  const [issuedAt, signature] = typeof body.reauthToken === "string" ? body.reauthToken.split(".") : []
  const expected = createHmac("sha256", process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "").update(`${actorId}:${issuedAt}`).digest("hex")
  const validReauth = Boolean(issuedAt && signature && /^\d+$/.test(issuedAt) && Date.now() - Number(issuedAt) <= 10 * 60_000 && signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
  if (writeBack && (body.confirmation !== "WRITE BACK TO ZOHO" || !validReauth)) {
    return NextResponse.json({ error: "Recent password reauthentication and typed confirmation are required" }, { status: 400 })
  }
  const active = await prisma.syncJob.findFirst({ where: { status: { in: ["QUEUED", "RUNNING", "CANCELLING"] } }, select: { id: true } })
  if (active) return NextResponse.json({ error: "A Full Sync job is already active", jobId: active.id }, { status: 409 })
  if (!actorId) return NextResponse.json({ error: "Authenticated actor is unavailable" }, { status: 403 })
  const [invoiceCount, salesOrderCount, quoteCount] = await Promise.all([prisma.invoice.count(), prisma.salesOrder.count(), prisma.quote.count()])
  const job = await prisma.syncJob.create({ data: { actorId, writeBack, total: invoiceCount + salesOrderCount + quoteCount, requestedScope: { entities: ["invoices", "salesorders", "estimates"], source: "Zoho Books", mode: writeBack ? "READ_WRITE" : "READ_ONLY" } }, select: { id: true, status: true, stage: true, writeBack: true, total: true, processed: true, succeeded: true, skipped: true, failed: true } })
  return NextResponse.json({ job, warning: writeBack ? "Invoice calculation stages write approved custom fields to Zoho." : "Read-only synchronization; no Zoho writes will be attempted." })
}
