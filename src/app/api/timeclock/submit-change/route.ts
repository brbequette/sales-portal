import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { timeEntryId, userId, requestedClockIn, requestedClockOut, reason, notes } = body

    if (!timeEntryId || !userId || !reason) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    const request = await prisma.timeChangeRequest.create({
      data: {
        timeEntryId,
        userId,
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
