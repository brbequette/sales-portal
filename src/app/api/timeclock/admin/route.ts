import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const month = url.searchParams.get("month") // Optional YYYY-MM

    const where: any = {}
    if (month) {
      where.date = { startsWith: month }
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        changeRequests: {
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    return NextResponse.json({ success: true, entries })
  } catch (error: any) {
    console.error("Error fetching admin time entries:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const { type } = body

    if (type === "HANDLE_REQUEST") {
      const { requestId, status, manualClockIn, manualClockOut, timeEntryId } = body
      
      await prisma.$transaction(async (tx) => {
        // Update request status
        await tx.timeChangeRequest.update({
          where: { id: requestId },
          data: { status }
        })

        // If approved, update the time entry overrides
        if (status === "APPROVED") {
          const updateData: any = {}
          if (manualClockIn) updateData.manualClockIn = new Date(manualClockIn)
          if (manualClockOut) updateData.manualClockOut = new Date(manualClockOut)
          
          if (Object.keys(updateData).length > 0) {
            await tx.timeEntry.update({
              where: { id: timeEntryId },
              data: updateData
            })
          }
        }
      })
      
      return NextResponse.json({ success: true })
    } 
    
    if (type === "MANUAL_OVERRIDE") {
      const { timeEntryId, manualClockIn, manualClockOut } = body
      
      const updateData: any = {}
      if (manualClockIn !== undefined) updateData.manualClockIn = manualClockIn ? new Date(manualClockIn) : null
      if (manualClockOut !== undefined) updateData.manualClockOut = manualClockOut ? new Date(manualClockOut) : null

      const entry = await prisma.timeEntry.update({
        where: { id: timeEntryId },
        data: updateData
      })
      
      return NextResponse.json({ success: true, entry })
    }

    return NextResponse.json({ success: false, error: "Invalid type" }, { status: 400 })
  } catch (error: any) {
    console.error("Error handling admin timeclock action:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
