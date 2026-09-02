import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"
import { getMicrosoftMailConfiguration } from "@/lib/microsoft-graph-mail"

export const dynamic = "force-dynamic"

const requiredDetails = [
  { key: "microsoft_admin", label: "Microsoft 365 administrator", detail: "Name/email of the person who can register an Entra application and grant tenant-wide admin consent.", source: "Microsoft 365 Admin Center → Users → Active users; identify a Global Administrator or Application Administrator.", sourceUrl: "https://admin.microsoft.com/", required: true },
  { key: "mailboxes", label: "Mailboxes to monitor", detail: "Start with ben@titandiamond.net; list any shared purchasing, accounting, shipping, returns, or support mailboxes.", source: "Microsoft 365 Admin Center → Teams & groups → Shared mailboxes, plus each rep's portal profile email.", sourceUrl: "https://admin.microsoft.com/", required: true },
  { key: "entra_credentials", label: "Microsoft Entra application credentials", detail: "Tenant ID, application/client ID, and a client secret stored only as server environment variables.", source: "Entra Admin Center → Identity → Applications → App registrations. The Overview page has Tenant ID and Client ID; Certificates & secrets creates the secret. Copy the secret value immediately—it is shown only once.", sourceUrl: "https://entra.microsoft.com/", required: true },
  { key: "graph_permissions", label: "Microsoft Graph permissions", detail: "Application permission Mail.Read with administrator consent. Mail.Send is not needed for ingestion.", source: "Entra app registration → API permissions → Add a permission → Microsoft Graph → Application permissions → Mail.Read → Grant admin consent.", sourceUrl: "https://entra.microsoft.com/", required: true },
  { key: "trusted_senders", label: "Trusted operational senders/domains", detail: "Vendors, carriers, payment providers, Zoho, and notification services whose messages may create review events.", source: "Search recent Outlook messages for shipping, invoice, receipt, order, return, tracking, BOL, and freight; record the From addresses/domains.", sourceUrl: "https://outlook.office.com/mail/", required: true },
  { key: "document_rules", label: "Document-number rules", detail: "Examples/prefixes for invoice, sales order, purchase order, package, RMA, and vendor order numbers.", source: "Collect 2–3 recent examples from Zoho Books and matching vendor/carrier emails. Redact customer details if exported outside the portal.", sourceUrl: "https://books.zoho.com/", required: true },
  { key: "shipping_policy", label: "Shipping-cost allocation policy", detail: "How freight spanning several orders/SKUs should be allocated: exact assignment, weight, quantity, revenue, or manual review.", source: "Ask the person who currently enters freight/dead cost into Zoho; document the current accounting rule and exceptions.", required: true },
  { key: "approvers", label: "Review owners", detail: "Who approves shipping costs, address changes, cancellations, payments, credits, and returns.", source: "Create an internal owner list by process: accounting, shipping, purchasing, returns, and sales management.", required: true },
  { key: "history", label: "Initial history window", detail: "Recommended: 90 days, then extend after accuracy is measured.", source: "Choose a date range in Outlook that includes several examples from every major sender; 90 days is the recommended pilot.", sourceUrl: "https://outlook.office.com/mail/", required: false },
  { key: "retention", label: "Email and attachment retention", detail: "How long extracted bodies, metadata, and downloaded documents may be retained locally.", source: "Confirm with company management/accounting and any applicable legal or customer-contract requirements.", required: false },
  { key: "vendor_examples", label: "Additional example emails", detail: "Two or three examples from each major vendor/carrier, especially invoices, backorders, credits, and delivery exceptions.", source: "Outlook search by sender/domain; save representative messages or attachments without forwarding credentials or unrelated personal mail.", sourceUrl: "https://outlook.office.com/mail/", required: false },
]

export async function GET(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const url = new URL(req.url)
  const status = url.searchParams.get("status") || undefined
  const events = await prisma.emailOperationalEvent.findMany({
    where: status && status !== "ALL" ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { email: { select: { subject: true, fromAddress: true, receivedAt: true, sentAt: true, direction: true, mailboxAddress: true } } },
  })
  const counts = await prisma.emailOperationalEvent.groupBy({ by: ["status"], _count: { _all: true } })
  const [mailboxes, users] = await Promise.all([
    prisma.emailMailbox.findMany({ orderBy: { address: "asc" }, include: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.user.findMany({ where: { email: { not: "" } }, select: { id: true, name: true, email: true, role: true }, orderBy: { name: "asc" } }),
  ])
  return NextResponse.json({ success: true, configuration: getMicrosoftMailConfiguration(), requiredDetails, counts, events, mailboxes, users })
}

export async function POST(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const actorId = String((auth.session?.user as { dbId?: string; id?: string } | undefined)?.dbId || (auth.session?.user as { id?: string } | undefined)?.id || "")
  const body = await req.json() as { address?: string; displayName?: string; userId?: string; mailboxType?: string; lookbackDays?: number }
  const address = String(body.address || "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return NextResponse.json({ success: false, error: "A valid mailbox address is required." }, { status: 400 })
  if (body.userId && !(await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } }))) return NextResponse.json({ success: false, error: "The selected user does not exist." }, { status: 400 })
  const mailbox = await prisma.emailMailbox.create({ data: {
    address, displayName: String(body.displayName || "").trim() || null, userId: body.userId || null,
    mailboxType: body.mailboxType === "SHARED" ? "SHARED" : "USER", lookbackDays: Math.max(1, Math.min(Number(body.lookbackDays) || 90, 365)), createdById: actorId || null,
  } })
  return NextResponse.json({ success: true, mailbox })
}

export async function PUT(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const body = await req.json() as { id?: string; userId?: string | null; displayName?: string; enabled?: boolean; includeInbox?: boolean; includeSent?: boolean; autoSync?: boolean; lookbackDays?: number; mailboxType?: string }
  if (!body.id) return NextResponse.json({ success: false, error: "Mailbox id is required." }, { status: 400 })
  if (body.userId && !(await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } }))) return NextResponse.json({ success: false, error: "The selected user does not exist." }, { status: 400 })
  const mailbox = await prisma.emailMailbox.update({ where: { id: body.id }, data: {
    userId: body.userId === undefined ? undefined : body.userId || null,
    displayName: body.displayName === undefined ? undefined : body.displayName.trim() || null,
    enabled: body.enabled, includeInbox: body.includeInbox, includeSent: body.includeSent, autoSync: body.autoSync,
    lookbackDays: body.lookbackDays === undefined ? undefined : Math.max(1, Math.min(Number(body.lookbackDays) || 90, 365)),
    mailboxType: body.mailboxType === undefined ? undefined : body.mailboxType === "SHARED" ? "SHARED" : "USER",
  } })
  return NextResponse.json({ success: true, mailbox })
}

export async function PATCH(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const actorId = String((auth.session?.user as { dbId?: string; id?: string } | undefined)?.dbId || (auth.session?.user as { id?: string } | undefined)?.id || "")
  const body = await req.json() as { id?: string; action?: "APPROVE" | "REJECT" | "REOPEN" }
  if (!body.id || !body.action) return NextResponse.json({ success: false, error: "Event id and action are required." }, { status: 400 })
  const status = body.action === "APPROVE" ? "APPROVED" : body.action === "REJECT" ? "REJECTED" : "REVIEW_REQUIRED"
  const event = await prisma.emailOperationalEvent.update({
    where: { id: body.id },
    data: { status, reviewedById: actorId || null, reviewedAt: status === "REVIEW_REQUIRED" ? null : new Date() },
  })
  return NextResponse.json({ success: true, event, note: status === "APPROVED" ? "Approved for a future apply step; no business record was changed." : undefined })
}
