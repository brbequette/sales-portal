import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { isAdministratorRole } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isAdministratorRole(session.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const [sourceRecords, eligibleSalespeople, newestInvoice, newestOrder, newestQuote, missingInvoiceRep, missingOrderRep] = await Promise.all([
    Promise.all([prisma.invoice.count(), prisma.salesOrder.count(), prisma.quote.count()]),
    prisma.user.count({ where: { isSalesperson: true, NOT: { role: { in: ["ADMIN", "Administrator", "MASTER_ADMIN", "Master Administrator"] } } } }),
    prisma.invoice.aggregate({ _max: { updatedAt: true } }),
    prisma.salesOrder.aggregate({ _max: { updatedAt: true } }),
    prisma.quote.aggregate({ _max: { updatedAt: true } }),
    prisma.invoice.count({ where: { computedSalesperson: null } }),
    prisma.salesOrder.count({ where: { items: { equals: Prisma.JsonNull } } }),
  ])
  return NextResponse.json({ success: true, sourceRecords: { invoices: sourceRecords[0], salesOrders: sourceRecords[1], quotes: sourceRecords[2] }, eligibleSalespeople, exclusions: { nonSalesStaff: "role-filtered", terminalDocuments: "status-filtered", missingSalesperson: missingInvoiceRep + missingOrderRep }, newestSourceTimestamp: [newestInvoice._max.updatedAt, newestOrder._max.updatedAt, newestQuote._max.updatedAt].filter(Boolean).sort().at(-1) || null, displayedAggregateTotals: "available through TV payload" }, { headers: { "Cache-Control": "no-store" } })
}
