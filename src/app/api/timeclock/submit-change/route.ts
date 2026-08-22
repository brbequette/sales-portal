import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    const body = await req.json()
    const { timeEntryId, requestedClockIn, requestedClockOut, reason, notes } = body

    if ((!timeEntryId && !requestedClockIn) || !reason) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    const sessionUser = session.user as typeof session.user & { dbId?: string }
    const user = sessionUser.dbId
      ? await prisma.user.findUnique({ where: { id: sessionUser.dbId } })
      : await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: "Signed-in user is not linked to a local account" }, { status: 403 })
    const dbUserId = user.id

    if (timeEntryId) {
      const entry = await prisma.timeEntry.findUnique({ where: { id: timeEntryId }, select: { userId: true } })
      if (!entry || entry.userId !== dbUserId) return NextResponse.json({ error: "You can only change your own time entries" }, { status: 403 })
    }

    const request = await prisma.timeChangeRequest.create({
      data: {
        timeEntryId: timeEntryId || null,
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
