import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isRecoveryManagerRole } from "@/lib/write-off-recovery"
import { DEFAULT_WRITE_OFF_RESPONSIBILITY_RATE_BPS, writeOffBpsToPercentage, writeOffPercentageToBps } from "@/lib/write-off-recovery-shared"

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" }

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore })
  const policy = await prisma.writeOffRecoveryPolicy.findUnique({ where: { id: "default" } })
  const responsibilityRateBps = policy?.responsibilityRateBps ?? DEFAULT_WRITE_OFF_RESPONSIBILITY_RATE_BPS
  return NextResponse.json({ responsibilityRateBps, responsibilityPercentage: writeOffBpsToPercentage(responsibilityRateBps), zohoSyncEnabled: false }, { headers: noStore })
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore })
  if (!isRecoveryManagerRole(session.user.role)) return NextResponse.json({ error: "Manager access required" }, { status: 403, headers: noStore })
  const { responsibilityPercentage } = await request.json() as { responsibilityPercentage: string }
  let responsibilityRateBps: number
  try { responsibilityRateBps = writeOffPercentageToBps(responsibilityPercentage) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid percentage" }, { status: 400, headers: noStore }) }
  const policy = await prisma.writeOffRecoveryPolicy.upsert({
    where: { id: "default" },
    create: { id: "default", responsibilityRateBps, zohoSyncEnabled: false, updatedById: session.user.id },
    update: { responsibilityRateBps, zohoSyncEnabled: false, updatedById: session.user.id },
  })
  return NextResponse.json({ responsibilityRateBps: policy.responsibilityRateBps, responsibilityPercentage: writeOffBpsToPercentage(policy.responsibilityRateBps), zohoSyncEnabled: false }, { headers: noStore })
}
