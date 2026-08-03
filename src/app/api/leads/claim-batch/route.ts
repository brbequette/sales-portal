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

    const { batchSize = 10, forceNew = false } = await req.json()
    const userId = session.user.id

    // Check if rep already has an active claimed batch of unconverted leads
    if (!forceNew) {
      const existingClaimed = await prisma.lead.findMany({
        where: {
          claimedById: userId,
          status: { not: "Converted" },
          convertedAccountId: null
        },
        include: {
          owner: { select: { id: true, name: true, email: true } }
        },
        orderBy: { claimedAt: "desc" }
      })

      if (existingClaimed.length > 0) {
        return NextResponse.json({
          success: true,
          leads: existingClaimed,
          isExisting: true,
          message: `Returned ${existingClaimed.length} leads from your current active batch.`
        })
      }
    }

    // Get unallocated 100% CONFIRMED company groups
    const availableGroups = await prisma.lead.findMany({
      where: {
        matchStatus: "CONFIRMED",
        status: { not: "Converted" },
        convertedAccountId: null,
        claimedById: null
      },
      select: { companyGroupId: true, company: true },
      distinct: ["companyGroupId"],
      take: 200
    })

    if (availableGroups.length === 0) {
      return NextResponse.json({
        success: true,
        leads: [],
        message: "No available unallocated confirmed lead batches remaining."
      })
    }

    // Shuffle & pick randomized batch of company groups
    const shuffled = availableGroups.sort(() => 0.5 - Math.random())
    const selectedGroups = shuffled.slice(0, batchSize).map(g => g.companyGroupId).filter(Boolean) as string[]

    // Claim all leads belonging to selected company groups
    await prisma.lead.updateMany({
      where: {
        companyGroupId: { in: selectedGroups },
        matchStatus: "CONFIRMED",
        status: { not: "Converted" },
        convertedAccountId: null
      },
      data: {
        claimedById: userId,
        claimedAt: new Date()
      }
    })

    // Return the newly claimed leads
    const claimedLeads = await prisma.lead.findMany({
      where: {
        companyGroupId: { in: selectedGroups },
        claimedById: userId
      },
      include: {
        owner: { select: { id: true, name: true, email: true } }
      },
      orderBy: { company: "asc" }
    })

    return NextResponse.json({
      success: true,
      leads: claimedLeads,
      isExisting: false,
      message: `Claimed ${selectedGroups.length} company lead groups (${claimedLeads.length} total contacts).`
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
