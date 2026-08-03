import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const { leadId, companyGroupId, releaseAllUnconverted = false } = await req.json()

    let releasedCount = 0

    if (releaseAllUnconverted) {
      // Recirculate all unconverted leads for this rep back to the pool
      const result = await prisma.lead.updateMany({
        where: {
          claimedById: userId,
          status: { not: "Converted" },
          convertedAccountId: null
        },
        data: {
          claimedById: null,
          claimedAt: null
        }
      })
      releasedCount = result.count
    } else if (companyGroupId) {
      const result = await prisma.lead.updateMany({
        where: {
          companyGroupId,
          claimedById: userId,
          status: { not: "Converted" },
          convertedAccountId: null
        },
        data: {
          claimedById: null,
          claimedAt: null
        }
      })
      releasedCount = result.count
    } else if (leadId) {
      const result = await prisma.lead.updateMany({
        where: {
          id: leadId,
          claimedById: userId,
          status: { not: "Converted" },
          convertedAccountId: null
        },
        data: {
          claimedById: null,
          claimedAt: null
        }
      })
      releasedCount = result.count
    }

    return NextResponse.json({
      success: true,
      releasedCount,
      message: `Released ${releasedCount} lead(s) back to the general pool for other reps.`
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
