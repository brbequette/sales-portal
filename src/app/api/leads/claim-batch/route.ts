import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedDbUser } from "@/lib/session-user"

export async function POST(req: Request) {
  try {
    const auth = await getAuthenticatedDbUser()
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { targetBatchSize = 50, forceReUp = false } = await req.json().catch(() => ({}))

    const userId = auth.user.id

    // A manually entered local lead belongs in its owner's workstation
    // immediately, including leads created before this reservation rule.
    await prisma.lead.updateMany({
      where: { ownerId: userId, claimedById: null, convertedAccountId: null, zohoId: { startsWith: "lead_local_" } },
      data: { claimedById: userId, claimedAt: new Date() },
    })

    // 2. Get current active claimed leads for this rep
    const existingClaimed = await prisma.lead.findMany({
      where: {
        claimedById: userId,
        status: { notIn: ["Converted", "DNR", "Inactive"] },
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

    // Re-up constraint rule: Rep must have <= 20 unprocessed leads remaining
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

    // Calculate needed leads to reach target batch size (50)
    const neededCount = Math.max(0, targetBatchSize - existingClaimed.length)

    if (neededCount > 0) {
      // Find unallocated leads randomly
      let availableLeads = await prisma.lead.findMany({
        where: {
          claimedById: null,
          status: { notIn: ["Converted", "DNR", "Inactive"] },
          convertedAccountId: null
        },
        select: { id: true },
        take: 500
      })

      // If no unassigned leads exist in local DB, convert any unassigned leads or assign from pool
      if (availableLeads.length === 0) {
        availableLeads = await prisma.lead.findMany({
          where: {
            claimedById: null
          },
          select: { id: true },
          take: 500
        })
      }

      if (availableLeads.length > 0) {
        // Shuffle randomly
        const shuffled = availableLeads.sort(() => 0.5 - Math.random())
        const selectedIds = shuffled.slice(0, neededCount).map(l => l.id)

        // Claim selected leads for rep
        await prisma.lead.updateMany({
          where: {
            id: { in: selectedIds },
            claimedById: null,
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
        status: { notIn: ["Converted", "DNR", "Inactive"] },
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
      message: `Successfully loaded ${updatedBatch.length} leads into your calling workstation batch!`
    })

  } catch (error: any) {
    console.error("Claim Lead Batch Error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
