import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from "next/server"
import { checkAccountOwnership } from "@/lib/auth-helpers"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { 
      id, // Pass ID if updating an existing log
      accountId, 
      fromNumber, 
      toNumber, 
      direction, 
      duration, 
      status, 
      notes, 
      zohoCallId 
    } = body

    if (id) {
      const existing = await prisma.callLog.findUnique({ where: { id }, select: { accountId: true } })
      if (!existing) return NextResponse.json({ error: "Call log not found" }, { status: 404 })
      const access = await checkAccountOwnership(existing.accountId)
      if (!access.authorized) return access.errorResponse
      const updatedLog = await prisma.callLog.update({
        where: { id },
        data: {
          duration,
          status,
          notes,
          editedAt: new Date()
        }
      })
      return NextResponse.json({ success: true, callLog: updatedLog })
    } else {
      // Create new Call Log
      if (!accountId || !fromNumber || !toNumber || !direction || !status || !zohoCallId) {
        return NextResponse.json({ error: "New call logs require complete fields and a real provider call ID" }, { status: 400 })
      }

      const account = await prisma.account.findFirst({
        where: { OR: [{ id: accountId }, { zohoId: accountId }] },
        select: { id: true },
      })
      if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 })
      const access = await checkAccountOwnership(account.id)
      if (!access.authorized) return access.errorResponse
      const authorId = String(access.user?.dbId || "")
      if (!authorId) return NextResponse.json({ error: "User is not linked to a local account" }, { status: 403 })

      const newLog = await prisma.$transaction(async tx => {
        const savedLog = await tx.callLog.create({
          data: {
            accountId: account.id,
            authorId,
            fromNumber,
            toNumber,
            direction,
            duration: duration || 0,
            status,
            notes: notes || "",
            zohoCallId
          }
        })
        if (direction === "OUTBOUND" && status === "COMPLETED") {
          await tx.account.update({ where: { id: account.id }, data: { lastCalledAt: savedLog.createdAt } })
        }
        await tx.communicationEvent.create({
          data: {
            accountId: account.id,
            actorId: authorId,
            channel: "CALL",
            direction,
            eventType: "CALL_LOGGED",
            sourceType: "CallLog",
            sourceId: savedLog.id,
            subject: status,
            summary: String(notes || `${direction} call`).slice(0, 1000),
            occurredAt: savedLog.createdAt,
            metadata: { fromNumber, toNumber, duration: duration || 0, zohoCallId }
          }
        })
        return savedLog
      })

      return NextResponse.json({ success: true, callLog: newLog })
    }

  } catch (err: unknown) {
    console.error("Log Call Error:", err)
    return NextResponse.json({ error: "Failed to log call" }, { status: 500 })
  }
}
