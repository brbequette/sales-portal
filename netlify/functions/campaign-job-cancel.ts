import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"

import { prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ success: false }) }

  try {
    const { jobId } = JSON.parse(event.body || "{}")
    if (!jobId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Missing jobId" }) }

    const job = await prisma.campaignJob.findUnique({ where: { id: jobId } })
    if (!job) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Job not found" }) }

    await prisma.campaignJob.update({ where: { id: jobId }, data: { status: "CANCELLED" } })

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, status: "CANCELLED" }) }
  } catch (error: any) {
    console.error("campaign-job-cancel error:", error)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, message: error.message || "Internal server error" }) }
  }
}
