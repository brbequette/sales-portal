import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedDbUser } from "@/lib/session-user"
import { isAdministratorRole } from "@/lib/roles"
import { isMailboxAddress, normalizeMailboxAddress, sameOriginEmailRequest } from "@/lib/email-intelligence-guards"
import { reviewEmailEvent } from "@/lib/email-intelligence-review"

async function requireAdministrator() {
  const auth = await getAuthenticatedDbUser()
  return { session: auth?.session, user: auth?.user, errorResponse: !auth ? NextResponse.json({ error: "Unauthorized" }, { status: 401 }) : !isAdministratorRole(auth.user.role) ? NextResponse.json({ error: "Administrator access required" }, { status: 403 }) : null }
}
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
  const query = url.searchParams.get('accountSearch')?.trim()
  if (query !== undefined && query !== null) {
    const accounts = query.length < 2 ? [] : await prisma.account.findMany({ where: { name: { contains: query.slice(0, 100), mode: 'insensitive' } }, select: { id: true, name: true }, take: 20, orderBy: { name: 'asc' } })
    return NextResponse.json({ accounts }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
  const status = url.searchParams.get("status") || undefined
  const events = await prisma.emailOperationalEvent.findMany({
    where: status && status !== "ALL" ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { email: { select: { subject: true, fromAddress: true, receivedAt: true, sentAt: true, direction: true, mailboxAddress: true, body: true, attachments: { select: { id: true, name: true, classification: true, size: true } } } } },
  })
  const counts = await prisma.emailOperationalEvent.groupBy({ by: ["status"], _count: { _all: true } })
  const [mailboxes, users] = await Promise.all([
    prisma.emailMailbox.findMany({ orderBy: { address: "asc" }, include: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.user.findMany({ where: { email: { not: "" } }, select: { id: true, name: true, email: true, role: true }, orderBy: { name: "asc" } }),
  ])
  return NextResponse.json({ success: true, configuration: getMicrosoftMailConfiguration(), requiredDetails, counts, events, mailboxes, users }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: Request) {
  if (!sameOriginEmailRequest(req)) return NextResponse.json({ error: "Same-origin request required" }, { status: 403 })
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const actorId = auth.user!.id
  const body = await req.json().catch(() => ({})) as { address?: string; displayName?: string; userId?: string; mailboxType?: string; lookbackDays?: number }
  const address = normalizeMailboxAddress(body.address)
  if (!isMailboxAddress(address)) return NextResponse.json({ success: false, error: "A valid mailbox address is required." }, { status: 400 })
  if ((body.displayName !== undefined && typeof body.displayName !== 'string') || (body.userId != null && typeof body.userId !== 'string')) return NextResponse.json({ error: 'Invalid mailbox fields.' }, { status: 400 })
  if (body.userId && !(await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } }))) return NextResponse.json({ success: false, error: "The selected user does not exist." }, { status: 400 })
  if (await prisma.emailMailbox.findUnique({ where: { address } })) return NextResponse.json({ error: "Mailbox already assigned." }, { status: 409 })
  const mailbox = await prisma.emailMailbox.create({ data: {
    address, displayName: String(body.displayName || "").trim() || null, userId: body.userId || null,
    mailboxType: body.mailboxType === "SHARED" ? "SHARED" : "USER", lookbackDays: Math.max(1, Math.min(Math.floor(Number(body.lookbackDays)) || 90, 365)), createdById: actorId || null,
  } })
  return NextResponse.json({ success: true, mailbox })
}

export async function PUT(req: Request) {
  if (!sameOriginEmailRequest(req)) return NextResponse.json({ error: "Same-origin request required" }, { status: 403 })
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const body = await req.json().catch(() => ({})) as { id?: string; address?: string; userId?: string | null; displayName?: string; enabled?: boolean; includeInbox?: boolean; includeSent?: boolean; autoSync?: boolean; lookbackDays?: number; mailboxType?: string }
  if (!body.id) return NextResponse.json({ success: false, error: "Mailbox id is required." }, { status: 400 })
  if ((body.displayName !== undefined && typeof body.displayName !== 'string') || (body.userId != null && typeof body.userId !== 'string')) return NextResponse.json({ error: 'Invalid mailbox fields.' }, { status: 400 })
  if (body.userId && !(await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } }))) return NextResponse.json({ success: false, error: "The selected user does not exist." }, { status: 400 })
  if (['enabled', 'includeInbox', 'includeSent', 'autoSync'].some(key => (body as Record<string, unknown>)[key] !== undefined && typeof (body as Record<string, unknown>)[key] !== 'boolean')) return NextResponse.json({ error: 'Mailbox switches must be on or off.' }, { status: 400 })
  if (!await prisma.emailMailbox.findUnique({ where: { id: body.id } })) return NextResponse.json({ error: 'Mailbox not found.' }, { status: 404 })
  const address = body.address === undefined ? undefined : normalizeMailboxAddress(body.address)
  if (address !== undefined && !isMailboxAddress(address)) return NextResponse.json({ error: "Enter a valid mailbox address." }, { status: 400 })
  if (address) {
    const duplicate = await prisma.emailMailbox.findUnique({ where: { address } })
    if (duplicate && duplicate.id !== body.id) return NextResponse.json({ error: "Mailbox already assigned." }, { status: 409 })
  }
  const mailbox = await prisma.emailMailbox.update({ where: { id: body.id }, data: {
    address,
    userId: body.userId === undefined ? undefined : body.userId || null,
    displayName: body.displayName === undefined ? undefined : body.displayName.trim() || null,
    enabled: body.enabled, includeInbox: body.includeInbox, includeSent: body.includeSent, autoSync: body.autoSync,
    lookbackDays: body.lookbackDays === undefined ? undefined : Math.max(1, Math.min(Math.floor(Number(body.lookbackDays)) || 90, 365)),
    mailboxType: body.mailboxType === undefined ? undefined : body.mailboxType === "SHARED" ? "SHARED" : "USER",
  } })
  return NextResponse.json({ success: true, mailbox })
}

export async function PATCH(req: Request) {
  if (!sameOriginEmailRequest(req)) return NextResponse.json({ error: "Same-origin request required" }, { status: 403 })
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const body = await req.json().catch(() => ({})) as { id?: string; action?: string; expectedUpdatedAt?: string; accountId?: string; ownerId?: string; dueDate?: string }
  if (!body.id || !body.action || !body.expectedUpdatedAt) return NextResponse.json({ error: "Event id, action and current revision are required." }, { status: 400 })
  try {
    const result = await reviewEmailEvent({ ...body, id: body.id, action: body.action, expectedUpdatedAt: body.expectedUpdatedAt, actorId: auth.user!.id })
    return NextResponse.json({ success: true, ...result })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Review failed.' }, { status: 409 }) }
}
