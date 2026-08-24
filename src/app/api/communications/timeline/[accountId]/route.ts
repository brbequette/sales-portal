import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkAccountOwnership } from "@/lib/auth-helpers"

export async function GET(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params
  const access = await checkAccountOwnership(accountId)
  if (!access.authorized) return access.errorResponse

  const url = new URL(req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 250)
  const before = url.searchParams.get("before")
  const beforeDate = before ? new Date(before) : null
  if (beforeDate && Number.isNaN(beforeDate.getTime())) {
    return NextResponse.json({ success: false, error: "Invalid before date" }, { status: 400 })
  }

  const events = await prisma.communicationEvent.findMany({
    where: { accountId, ...(beforeDate ? { occurredAt: { lt: beforeDate } } : {}) },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
      actor: { select: { id: true, name: true } },
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: limit,
  })

  return NextResponse.json({
    success: true,
    events,
    nextBefore: events.length === limit ? events.at(-1)?.occurredAt.toISOString() : null,
  })
}
