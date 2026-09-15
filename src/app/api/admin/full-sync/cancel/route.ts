import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function POST(req: NextRequest) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const { jobId } = await req.json().catch(() => ({}))
  if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 })
  const job = await prisma.syncJob.updateMany({ where: { id: jobId, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLING", cancelRequestedAt: new Date(), heartbeatAt: new Date() } })
  if (!job.count) return NextResponse.json({ error: "Sync job is already complete or unavailable" }, { status: 409 })
  return NextResponse.json({ success: true, status: "CANCELLING" })
}
