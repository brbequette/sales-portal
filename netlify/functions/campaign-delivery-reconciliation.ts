import type { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"

// Zoho Voice delivery callbacks are authoritative. No documented non-message
// carrier lookup exists in this integration, so this bounded sweep only moves
// overdue receipts into review; it never guesses delivery or sends a probe.
export const handler: Handler = async () => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const jobs = await prisma.campaignJob.findMany({ where: { reviewState: { in: ["AWAITING_DELIVERY_RECEIPTS", "RECONCILING"] }, submissionCompletedAt: { not: null } }, orderBy: { submissionCompletedAt: "asc" }, take: 20, select: { id: true, submissionCompletedAt: true } })
  for (const job of jobs) {
    const awaiting = await prisma.campaignRecipient.count({ where: { campaignJobId: job.id, state: "ACCEPTED", deliveryStatus: { in: ["submitted", "queued", "sent", "unknown"] } } })
    await prisma.campaignJob.update({ where: { id: job.id }, data: { reviewState: awaiting > 0 && job.submissionCompletedAt! > cutoff ? "RECONCILING" : "REVIEW_READY" } })
  }
  return { statusCode: 200, body: JSON.stringify({ reviewed: jobs.length }) }
}
