import type { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"
import { processCampaignBatch, recoverInterruptedRecipients } from "./lib/campaign-worker"
export const handler: Handler = async () => { await recoverInterruptedRecipients(); const jobs = await prisma.campaignJob.findMany({ where: { status: { in: ["QUEUED","RUNNING","RECOVERING"] } }, orderBy: { updatedAt: "asc" }, take: 1, select: { id: true } }); for (const job of jobs) await processCampaignBatch(job.id, 15); return { statusCode: 200, body: JSON.stringify({ jobs: jobs.length }) } }
