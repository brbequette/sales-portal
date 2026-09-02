import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const { id } = await context.params
  const action = await prisma.operationalAction.findUnique({ where: { id } })
  if (!action) return NextResponse.json({ error: "Action not found" }, { status: 404 })
  if (!["FAILED", "DEAD_LETTER"].includes(action.status)) return NextResponse.json({ error: "Only failed actions can be queued" }, { status: 409 })
  const updated = await prisma.operationalAction.update({ where: { id }, data: { status: "PENDING", nextAttemptAt: new Date(), errorCode: null } })
  return NextResponse.json({ success: true, action: updated, receipt: { actionId: updated.id, status: "PENDING", message: "Action is ready for a reviewed retry" } })
}
