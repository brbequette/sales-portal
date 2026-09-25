import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

// Database-only inspection; never calls a provider during a page-facing read.
export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const records = await prisma.operationalAction.findMany({
    where: { actionType: "RETELL_UNASSIGNED_EVIDENCE", entityType: "RETELL_CALL" },
    orderBy: { createdAt: "desc" }, take: 25,
    select: { id: true, entityId: true, createdAt: true },
  })
  return NextResponse.json({ records, limit: 25, meaning: "Unassigned when received; later reconciliation does not delete this audit evidence." }, { headers: { "Cache-Control": "private, no-store" } })
}
