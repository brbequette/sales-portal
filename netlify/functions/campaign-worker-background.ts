import type { Handler } from "@netlify/functions"
import { processCampaignBatch } from "./lib/campaign-worker"
export const handler: Handler = async (event) => { const jobId = event.queryStringParameters?.jobId; if (!jobId) return { statusCode: 400, body: "missing jobId" }; await processCampaignBatch(jobId, 1); return { statusCode: 202, body: JSON.stringify({ accepted: true }) } }
