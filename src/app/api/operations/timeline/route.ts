import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function GET(request: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const url = new URL(request.url)
  const entityType = url.searchParams.get("entityType")
  const entityId = url.searchParams.get("entityId")
  if (!entityType || !entityId) return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 })
  const [events, actions, assignment] = await Promise.all([
    prisma.operationalEvent.findMany({ where: { entityType, entityId }, orderBy: { occurredAt: "desc" }, take: 200 }),
    prisma.operationalAction.findMany({ where: { entityType, entityId }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.workAssignment.findUnique({ where: { entityType_entityId: { entityType, entityId } } }),
  ])
  return NextResponse.json({ events, actions, assignment })
}
