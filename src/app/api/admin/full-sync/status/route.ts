import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function GET(req: NextRequest) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const id = req.nextUrl.searchParams.get("jobId")
  if (!id) return NextResponse.json({ error: "jobId is required" }, { status: 400 })
  const job = await prisma.syncJob.findUnique({ where: { id }, select: { id: true, status: true, stage: true, writeBack: true, requestedScope: true, total: true, processed: true, succeeded: true, skipped: true, failed: true, startedAt: true, heartbeatAt: true, cancelRequestedAt: true, completedAt: true, errorCategory: true } })
  if (!job) return NextResponse.json({ error: "Sync job not found" }, { status: 404 })
  return NextResponse.json({ job })
}
