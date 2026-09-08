import { NextResponse } from "next/server"

import { getMicrosoftMailConfiguration } from "@/lib/microsoft-graph-mail"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedDbUser } from "@/lib/session-user"

const normalizeAddress = (value: unknown) => String(value || "").trim().toLowerCase()
const isEmailAddress = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export async function GET() {
  const auth = await getAuthenticatedDbUser()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const configuration = getMicrosoftMailConfiguration()
  const mailboxes = await prisma.emailMailbox.findMany({
    where: { userId: auth.user.id, mailboxType: "USER" },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({
    configuration: { configured: configuration.configured, missing: configuration.missing },
    mailboxes,
  })
}

export async function POST(req: Request) {
  const auth = await getAuthenticatedDbUser()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { address?: string; displayName?: string }
  const address = normalizeAddress(body.address)
  if (!isEmailAddress(address)) return NextResponse.json({ error: "Enter a valid Microsoft 365 email address." }, { status: 400 })
  if (address !== normalizeAddress(auth.user.email)) {
    return NextResponse.json({ error: "You can add your portal email yourself. Ask an administrator to assign additional or shared mailboxes." }, { status: 403 })
  }

  const existing = await prisma.emailMailbox.findUnique({ where: { address } })
  if (existing && existing.userId !== auth.user.id) {
    return NextResponse.json({ error: "That mailbox is already assigned. Ask an administrator for help." }, { status: 409 })
  }

  const mailbox = await prisma.emailMailbox.upsert({
    where: { address },
    create: {
      address,
      displayName: String(body.displayName || "").trim() || null,
      userId: auth.user.id,
      createdById: auth.user.id,
      mailboxType: "USER",
      enabled: true,
      includeInbox: true,
      includeSent: true,
      autoSync: true,
      lookbackDays: 90,
    },
    update: { enabled: true, userId: auth.user.id, mailboxType: "USER" },
  })

  return NextResponse.json({ success: true, mailbox })
}

export async function PUT(req: Request) {
  const auth = await getAuthenticatedDbUser()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    id?: string
    enabled?: boolean
    includeInbox?: boolean
    includeSent?: boolean
    autoSync?: boolean
    lookbackDays?: number
  }
  if (!body.id) return NextResponse.json({ error: "Mailbox id is required." }, { status: 400 })

  const owned = await prisma.emailMailbox.findFirst({ where: { id: body.id, userId: auth.user.id, mailboxType: "USER" } })
  if (!owned) return NextResponse.json({ error: "Mailbox not found." }, { status: 404 })

  const mailbox = await prisma.emailMailbox.update({
    where: { id: owned.id },
    data: {
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      includeInbox: typeof body.includeInbox === "boolean" ? body.includeInbox : undefined,
      includeSent: typeof body.includeSent === "boolean" ? body.includeSent : undefined,
      autoSync: typeof body.autoSync === "boolean" ? body.autoSync : undefined,
      lookbackDays: Number.isFinite(body.lookbackDays) ? Math.min(365, Math.max(1, Number(body.lookbackDays))) : undefined,
    },
  })

  return NextResponse.json({ success: true, mailbox })
}
