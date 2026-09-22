/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Handler } from "@netlify/functions"
import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { corsHeaders, handleOptions } from "./lib/cors"
import { prisma } from "./lib/prisma"
import { isAdministratorRole } from "../../src/lib/roles"

const handlerImpl: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()
  if (event.httpMethod !== "GET") return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ success: false }) }
  const session = await authenticateFunction(event as any)
  const user = await prisma.user.findFirst({ where: { OR: [session.dbId ? { id: session.dbId } : undefined, session.email ? { email: { equals: session.email, mode: "insensitive" } } : undefined].filter(Boolean) as any }, select: { id: true } })
  if (!user) return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false }) }
  const scope = isAdministratorRole(session.role) ? {} : { authorId: user.id }
  const include = { author: { select: { name: true } }, recipients: { select: { state: true } } } as const
  const job = event.queryStringParameters?.recoverLatest === "true"
    ? await prisma.campaignJob.findFirst({ where: { ...scope, status: { in: ["QUEUED","RUNNING","RECOVERING","PAUSED"] } }, orderBy: { updatedAt: "desc" }, include })
    : await prisma.campaignJob.findFirst({ where: { id: event.queryStringParameters?.jobId || "", ...scope }, include })
  const headers = { ...corsHeaders, "Cache-Control": "no-store" }
  if (!job) return { statusCode: 200, headers, body: JSON.stringify({ success: true, active: false }) }
  const states = ["PENDING","LEASED","SENDING","ACCEPTED","FAILED","AMBIGUOUS","SKIPPED"] as const
  const counts = Object.fromEntries(states.map(state => [state, job.recipients.filter(r => r.state === state).length])) as Record<(typeof states)[number], number>
  return { statusCode: 200, headers, body: JSON.stringify({ success: true, active: ["QUEUED","RUNNING","RECOVERING","PAUSED"].includes(job.status), jobId: job.id, blastId: job.blastId, status: job.status, reviewState: job.reviewState, progress: job.total - counts.PENDING - counts.LEASED - counts.SENDING, total: job.total, sentCount: counts.ACCEPTED, failedCount: counts.FAILED, recipientCounts: counts, name: job.campaignName, channel: job.channel, authorName: job.author.name, serverSideProcessing: true, workerHeartbeatAt: job.workerHeartbeatAt, error: job.errorMessage, quarantineReason: job.quarantineReason, legacyRawMissingCount: job.legacyRawMissingCount }) }
}
export const handler = withFunctionAuth(handlerImpl)
