import { NextRequest, NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { ExportRow, invoiceExportRecord, normalizeAccountName } from "@/lib/invoice-export-import"

export const dynamic = "force-dynamic"
export const maxDuration = 300

type IncomingDocument = { invoiceId: string; rows: ExportRow[] }

export async function POST(req: NextRequest) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const body = await req.json().catch(() => ({}))
  const mode = body.mode === "apply" ? "apply" : "preview"
  const documents: IncomingDocument[] = Array.isArray(body.documents) ? body.documents.slice(0, 100) : []
  if (!documents.length) return NextResponse.json({ error: "No invoice documents supplied" }, { status: 400 })

  const parsed = []
  const invalid: Array<{ invoiceId: string; error: string }> = []
  for (const document of documents) {
    try { parsed.push(invoiceExportRecord(document.rows || [])) }
    catch (error) { invalid.push({ invoiceId: document.invoiceId, error: error instanceof Error ? error.message : "INVALID_INVOICE" }) }
  }

  const zohoIds = parsed.map(item => item.zohoId)
  const customerIds = [...new Set(parsed.map(item => item.accountZohoId).filter(Boolean))]
  const customerNames = [...new Set(parsed.map(item => item.accountName).filter(Boolean))]
  const salespersonNames = [...new Set(parsed.map(item => item.salesperson).filter(Boolean))]
  const [existingInvoices, accounts, users] = await Promise.all([
    prisma.invoice.findMany({ where: { zohoId: { in: zohoIds } }, select: { id: true, zohoId: true, accountId: true } }),
    prisma.account.findMany({
      where: { OR: [
        { zohoId: { in: customerIds } },
        { name: { in: customerNames, mode: "insensitive" } },
      ] },
      select: { id: true, zohoId: true, name: true },
    }),
    prisma.user.findMany({
      where: { name: { in: salespersonNames, mode: "insensitive" } },
      select: { id: true, name: true },
    }),
  ])
  const invoiceByZoho = new Map(existingInvoices.map(item => [item.zohoId, item]))
  const accountByZoho = new Map(accounts.filter(item => item.zohoId).map(item => [item.zohoId!, item]))
  const accountByName = new Map<string, typeof accounts[number] | null>()
  for (const account of accounts) {
    const key = normalizeAccountName(account.name)
    accountByName.set(key, accountByName.has(key) ? null : account)
  }
  const userByName = new Map<string, typeof users[number] | null>()
  for (const user of users) {
    const key = normalizeAccountName(user.name)
    userByName.set(key, userByName.has(key) ? null : user)
  }

  const missingAccounts = new Map<string, { zohoId: string; name: string; ownerId: string; salesperson: string }>()
  for (const record of parsed) {
    if (!record.accountZohoId || accountByZoho.has(record.accountZohoId) || accountByName.get(normalizeAccountName(record.accountName))) continue
    const owner = userByName.get(normalizeAccountName(record.salesperson))
    if (owner) missingAccounts.set(record.accountZohoId, {
      zohoId: record.accountZohoId,
      name: record.accountName,
      ownerId: owner.id,
      salesperson: record.salesperson,
    })
  }
  const hasUnresolvableAccount = parsed.some(record => {
    const existing = invoiceByZoho.get(record.zohoId)
    return !existing?.accountId
      && !accountByZoho.has(record.accountZohoId)
      && !accountByName.get(normalizeAccountName(record.accountName))
      && !missingAccounts.has(record.accountZohoId)
  })
  if (mode === "apply" && invalid.length === 0 && !hasUnresolvableAccount && missingAccounts.size) {
    for (const missing of missingAccounts.values()) {
      const account = await prisma.account.upsert({
        where: { zohoId: missing.zohoId },
        update: {},
        create: {
          zohoId: missing.zohoId,
          name: missing.name,
          ownerId: missing.ownerId,
          status: "Active",
          rawData: { importedFromCsv: true, source: "Zoho Books invoice export", salesperson: missing.salesperson },
        },
        select: { id: true, zohoId: true, name: true },
      })
      accountByZoho.set(account.zohoId, account)
    }
  }

  const unresolved: Array<{ zohoId: string; invoiceNumber: string; customerId: string; customerName: string }> = []
  let creates = 0, updates = 0
  const operations = []
  for (const record of parsed) {
    const existing = invoiceByZoho.get(record.zohoId)
    const accountId = existing?.accountId
      || accountByZoho.get(record.accountZohoId)?.id
      || accountByName.get(normalizeAccountName(record.accountName))?.id
      || (mode === "preview" && missingAccounts.has(record.accountZohoId) ? `preview:${record.accountZohoId}` : undefined)
    if (!accountId) {
      unresolved.push({ zohoId: record.zohoId, invoiceNumber: record.invoiceNumber, customerId: record.accountZohoId, customerName: record.accountName })
      continue
    }
    if (existing) updates++
    else creates++
    if (mode === "apply") {
      operations.push(prisma.invoice.upsert({
        where: { zohoId: record.zohoId },
        update: record.update,
        create: { zohoId: record.zohoId, accountId, ...record.update },
      }))
    }
  }
  if (mode === "apply" && operations.length) await prisma.$transaction(operations)

  return NextResponse.json({
    success: invalid.length === 0,
    mode,
    received: documents.length,
    valid: parsed.length,
    creates,
    updates,
    accountCreates: missingAccounts.size,
    accountCreateSample: [...missingAccounts.values()].map(({ zohoId, name, salesperson }) => ({ zohoId, name, salesperson })),
    unresolved: unresolved.length,
    unresolvedSample: unresolved.slice(0, 20),
    invalid: invalid.length,
    invalidSample: invalid.slice(0, 20),
    zohoCalls: 0,
  })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const body = await req.json().catch(() => ({}))
  if (body.confirmation !== "FINALIZE PORTAL INVOICE IMPORT") return NextResponse.json({ error: "Confirmation required" }, { status: 400 })
  const invoiceIds = Array.isArray(body.invoiceIds) ? body.invoiceIds.map(String).filter(Boolean) : []
  if (!invoiceIds.length || invoiceIds.length > 20_000) return NextResponse.json({ error: "Invalid invoice ID set" }, { status: 400 })
  const result = await prisma.invoice.updateMany({
    where: { zohoId: { notIn: invoiceIds }, status: { notIn: ["Orphaned", "orphaned"] } },
    data: { status: "Orphaned", pendingZohoFetch: false, pendingCostSync: false },
  })
  return NextResponse.json({ success: true, orphaned: result.count, zohoCalls: 0 })
}
