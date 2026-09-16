import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isRecoveryManagerRole } from "@/lib/write-off-recovery"

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" }

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore })
  const policy = await prisma.writeOffRecoveryPolicy.findUnique({ where: { id: "default" } })
  return NextResponse.json({ responsibilityRateBps: policy?.responsibilityRateBps ?? 5000, zohoSyncEnabled: false }, { headers: noStore })
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore })
  if (!isRecoveryManagerRole(session.user.role)) return NextResponse.json({ error: "Manager access required" }, { status: 403, headers: noStore })
  const { responsibilityRateBps } = await request.json() as { responsibilityRateBps: number }
  if (!Number.isInteger(responsibilityRateBps) || responsibilityRateBps < 0 || responsibilityRateBps > 10_000) {
    return NextResponse.json({ error: "Rate must be an integer from 0 to 10000 basis points" }, { status: 400, headers: noStore })
  }
  const policy = await prisma.writeOffRecoveryPolicy.upsert({
    where: { id: "default" },
    create: { id: "default", responsibilityRateBps, zohoSyncEnabled: false, updatedById: session.user.id },
    update: { responsibilityRateBps, zohoSyncEnabled: false, updatedById: session.user.id },
  })
  return NextResponse.json({ responsibilityRateBps: policy.responsibilityRateBps, zohoSyncEnabled: false }, { headers: noStore })
}
