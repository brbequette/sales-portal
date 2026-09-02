import { NextResponse } from "next/server"

import { syncMicrosoftMailbox } from "@/lib/microsoft-graph-mail"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedDbUser } from "@/lib/session-user"

export async function POST(req: Request) {
  const auth = await getAuthenticatedDbUser()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { mailboxId?: string }
  const mailbox = body.mailboxId
    ? await prisma.emailMailbox.findFirst({ where: { id: body.mailboxId, userId: auth.user.id, mailboxType: "USER", enabled: true } })
    : null
  if (!mailbox) return NextResponse.json({ error: "Enabled mailbox not found." }, { status: 404 })

  try {
    const result = await syncMicrosoftMailbox({ mailboxId: mailbox.id, maxPerFolder: 50 })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mailbox sync failed." }, { status: 500 })
  }
}
