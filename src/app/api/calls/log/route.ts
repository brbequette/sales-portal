import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from "next/server"

import { getServerSession } from "next-auth/next"

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })
    
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

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
      // Update existing Call Log
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
      if (!accountId || !fromNumber || !toNumber || !direction || !status) {
        return NextResponse.json({ error: "Missing required fields for new log" }, { status: 400 })
      }

      const newLog = await prisma.callLog.create({
        data: {
          accountId,
          authorId: user.id,
          fromNumber,
          toNumber,
          direction,
          duration: duration || 0,
          status,
          notes: notes || "",
          zohoCallId: zohoCallId || `zv_log_${Date.now()}`
        }
      })
      
      // Also update the Account's lastCalledAt timestamp if it's an outbound completed call
      if (direction === "OUTBOUND") {
        await prisma.account.update({
          where: { id: accountId },
          data: { lastCalledAt: new Date() }
        })
      }

      return NextResponse.json({ success: true, callLog: newLog })
    }

  } catch (err: any) {
    console.error("Log Call Error:", err)
    return NextResponse.json({ error: "Failed to log call" }, { status: 500 })
  }
}
