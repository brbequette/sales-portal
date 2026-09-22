import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function GET(req: Request) {
  const auth = await requireAdministrator(); if (auth.errorResponse) return auth.errorResponse
  const url = new URL(req.url); const exportJob = url.searchParams.get("exportJob")
  const detailJob = url.searchParams.get("jobId")
  if (exportJob) {
    const job = await prisma.campaignJob.findUnique({ where: { id: exportJob }, include: { recipients: { include: { attempts: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { originalIndex: "asc" } } } })
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ job: { id: job.id, status: job.status, quarantineReason: job.quarantineReason, legacyRecordedAccepted: job.legacyRecordedAccepted, legacyRecordedFailed: job.legacyRecordedFailed, legacyRawMissingCount: job.legacyRawMissingCount }, recipients: job.recipients.map(r => ({ index: r.originalIndex, accountId: r.accountId, contactId: r.contactId, number: r.normalizedPhone, state: r.state, deliveryStatus: r.deliveryStatus, sender: r.attempts[0]?.sender, providerCode: r.lastProviderCode, providerMessage: r.lastProviderMessage, disposition: r.dispositionReason, acceptedAt: r.acceptedAt, deliveredAt: r.deliveredAt })) }, { headers: { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="campaign-${job.id}-review.json"` } })
  }
  if (detailJob) { const recipients = await prisma.campaignRecipient.findMany({ where: { campaignJobId: detailJob }, orderBy: { originalIndex: "asc" }, take: 250, select: { id: true, campaignJobId: true, originalIndex: true, accountId: true, contactId: true, normalizedPhone: true, state: true, deliveryStatus: true, dispositionReason: true, lastProviderCode: true, lastProviderMessage: true, acceptedAt: true, deliveredAt: true } }); return NextResponse.json({ recipients }, { headers: { "Cache-Control": "no-store" } }) }
  const jobs = await prisma.campaignJob.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { recipients: { select: { state: true, deliveryStatus: true } } } })
  return NextResponse.json({ jobs: jobs.map(job => ({ id: job.id, name: job.campaignName, status: job.status, reviewState: job.reviewState, total: job.total, updatedAt: job.updatedAt, workerHeartbeatAt: job.workerHeartbeatAt, quarantineReason: job.quarantineReason, legacyRecordedAccepted: job.legacyRecordedAccepted, legacyRecordedFailed: job.legacyRecordedFailed, legacyRawMissingCount: job.legacyRawMissingCount, recipientCounts: Object.fromEntries(["PENDING","LEASED","SENDING","ACCEPTED","FAILED","AMBIGUOUS","SKIPPED"].map(state => [state, job.recipients.filter(r => r.state === state).length])), deliveryCounts: Object.fromEntries(["submitted","queued","sent","delivered","undeliverable","rejected","blocked","expired","unknown"].map(state => [state, job.recipients.filter(r => r.deliveryStatus === state).length])) })) }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(req: Request) {
  const auth = await requireAdministrator(); if (auth.errorResponse) return auth.errorResponse
  const body = await req.json(); const job = await prisma.campaignJob.findUnique({ where: { id: String(body.jobId || "") } })
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (job.status === "LEGACY_QUARANTINED") return NextResponse.json({ error: "Quarantined campaigns require a separate reviewed campaign and cannot be resumed." }, { status: 409 })
  if (body.action === "resume-pending") { await prisma.campaignJob.update({ where: { id: job.id }, data: { status: "RECOVERING", errorMessage: null } }); return NextResponse.json({ success: true }) }
  if (body.action === "retry-ambiguous") {
    if (!body.recipientId || body.confirmation !== "RETRY AMBIGUOUS RECIPIENT") return NextResponse.json({ error: "Explicit per-recipient confirmation required" }, { status: 400 })
    await prisma.campaignRecipient.updateMany({ where: { id: String(body.recipientId), campaignJobId: job.id, state: "AMBIGUOUS" }, data: { state: "PENDING", ambiguousAt: null, dispositionReason: "Administrator explicitly approved a new attempt" } }); await prisma.campaignJob.update({ where: { id: job.id }, data: { status: "RECOVERING" } }); return NextResponse.json({ success: true })
  }
  return NextResponse.json({ error: "Unsupported action" }, { status: 400 })
}
