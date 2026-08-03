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

    const { targetBatchSize = 50, forceReUp = false } = await req.json()
    const userId = session.user.id

    // 1. Get current active claimed leads for this rep that have NOT been converted
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

    // Count unprocessed leads (disposition is null)
    const unprocessed = existingClaimed.filter(l => !l.disposition)
    const processedCount = existingClaimed.length - unprocessed.length

    // Re-up constraint rule: Rep must have <= 20 unprocessed leads remaining (meaning processed >= 30 out of 50)
    if (!forceReUp && existingClaimed.length > 0 && unprocessed.length > 20) {
      return NextResponse.json({
        success: true,
        leads: existingClaimed,
        isExisting: true,
        canReUp: false,
        processedCount,
        unprocessedCount: unprocessed.length,
        message: `You currently have ${unprocessed.length} unprocessed leads. You must process at least 30 leads (<= 20 remaining) before re-upping to 50.`
      })
    }

    // Calculate how many new company groups needed to reach 50 total
    const currentGroupCount = new Set(existingClaimed.map(l => l.companyGroupId)).size
    const neededGroups = Math.max(0, targetBatchSize - currentGroupCount)

    if (neededGroups > 0) {
      // Find unallocated CONFIRMED company groups randomly
      const availableGroups = await prisma.lead.findMany({
        where: {
          matchStatus: "CONFIRMED",
          status: { not: "Converted" },
          convertedAccountId: null,
          claimedById: null
        },
        select: { companyGroupId: true },
        distinct: ["companyGroupId"],
        take: 500
      })

      if (availableGroups.length > 0) {
        // Shuffle randomly to ensure equal random distribution across reps
        const shuffled = availableGroups.sort(() => 0.5 - Math.random())
        const selectedGroups = shuffled.slice(0, neededGroups).map(g => g.companyGroupId).filter(Boolean) as string[]

        // Claim selected company groups for rep
        await prisma.lead.updateMany({
          where: {
            companyGroupId: { in: selectedGroups },
            matchStatus: "CONFIRMED",
            status: { not: "Converted" },
            convertedAccountId: null,
            claimedById: null
          },
          data: {
            claimedById: userId,
            claimedAt: new Date()
          }
        })
      }
    }

    // Return the updated total batch of active claimed leads
    const updatedBatch = await prisma.lead.findMany({
      where: {
        claimedById: userId,
        status: { not: "Converted" },
        convertedAccountId: null
      },
      include: {
        owner: { select: { id: true, name: true, email: true } }
      },
      orderBy: { company: "asc" }
    })

    const updatedUnprocessed = updatedBatch.filter(l => !l.disposition).length
    const updatedProcessed = updatedBatch.length - updatedUnprocessed

    return NextResponse.json({
      success: true,
      leads: updatedBatch,
      isExisting: false,
      canReUp: updatedUnprocessed <= 20,
      processedCount: updatedProcessed,
      unprocessedCount: updatedUnprocessed,
      message: `Batch updated! You now have ${updatedBatch.length} leads in your calling queue.`
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
