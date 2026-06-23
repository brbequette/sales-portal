import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { timeEntryId, userId, userEmail, requestedClockIn, requestedClockOut, reason, notes } = body

    if (!timeEntryId || (!userId && !userEmail) || !reason) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    // Try to resolve DB user
    let dbUserId = userId
    if (userEmail) {
      const user = await prisma.user.findUnique({ where: { email: userEmail } })
      if (user) {
        dbUserId = user.id
      }
    }

    const request = await prisma.timeChangeRequest.create({
      data: {
        timeEntryId,
        userId: dbUserId,
        requestedClockIn: requestedClockIn ? new Date(requestedClockIn) : null,
        requestedClockOut: requestedClockOut ? new Date(requestedClockOut) : null,
        reason,
        notes,
        status: "PENDING"
      }
    })

    return NextResponse.json({ success: true, request })
  } catch (error: any) {
    console.error("Error submitting time change request:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
