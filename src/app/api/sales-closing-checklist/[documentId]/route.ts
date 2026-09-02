import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkAccountOwnership } from '@/lib/auth-helpers'

export async function PUT(req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params
  const invoice = await prisma.invoice.findFirst({
    where: { OR: [{ id: documentId }, { zohoId: documentId }] },
    select: { id: true, zohoId: true, accountId: true, balance: true, status: true, payments: { select: { id: true, amount: true, date: true } } },
  })
  const salesOrder = invoice ? null : await prisma.salesOrder.findFirst({
    where: { OR: [{ id: documentId }, { zohoId: documentId }] },
    select: { id: true, zohoId: true, accountId: true },
  })
  const quote = invoice || salesOrder ? null : await prisma.quote.findFirst({
    where: { OR: [{ id: documentId }, { zohoId: documentId }] },
    select: { id: true, zohoId: true, accountId: true },
  })
  const document = invoice || salesOrder || quote

  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  const access = await checkAccountOwnership(document.accountId)
  if (!access.authorized) return access.errorResponse

  const body = await req.json()
  const [packages, satisfactionEvents] = await Promise.all([
    salesOrder?.zohoId ? prisma.package.findMany({ where: { salesOrderId: salesOrder.zohoId }, select: { id: true, packageNumber: true, trackingNumber: true, status: true } }) : Promise.resolve([]),
    prisma.communicationEvent.findMany({ where: { accountId: document.accountId, OR: [{ eventType: { contains: "review", mode: "insensitive" } }, { summary: { contains: "satisfaction", mode: "insensitive" } }, { summary: { contains: "review", mode: "insensitive" } }] }, select: { id: true, eventType: true, occurredAt: true }, orderBy: { occurredAt: "desc" }, take: 5 }),
  ])
  const paymentEvidence = invoice && (Number(invoice.balance || 0) <= 0 || invoice.payments.length > 0)
  const giftEvidence = packages.some(pkg => Boolean(pkg.trackingNumber) || ["shipped", "delivered"].includes(String(pkg.status).toLowerCase()))
  const evidence = {
    paymentVerified: body.paymentVerified ? paymentEvidence ? { source: "PAYMENT", verified: true, paymentIds: invoice?.payments.map(payment => payment.id) } : { source: "MANUAL_CONFIRMATION", verified: false, actor: access.user?.dbId || access.user?.id } : null,
    giftSent: body.giftSent ? giftEvidence ? { source: "PACKAGE", verified: true, packageIds: packages.map(pkg => pkg.id) } : { source: "MANUAL_CONFIRMATION", verified: false, actor: access.user?.dbId || access.user?.id } : null,
    satisfactionChecked: body.satisfactionChecked ? satisfactionEvents.length ? { source: "COMMUNICATION", verified: true, eventIds: satisfactionEvents.map(event => event.id) } : { source: "MANUAL_CONFIRMATION", verified: false, actor: access.user?.dbId || access.user?.id } : null,
  }
  const values = {
    paymentVerified: body.paymentVerified === true,
    giftSent: body.giftSent === true,
    satisfactionChecked: body.satisfactionChecked === true,
  }
  const completedAt = Object.values(values).every(Boolean) ? new Date() : null
  const updatedBy = access.user?.dbId || access.user?.id || null
  const checklist = await prisma.salesClosingChecklist.upsert({
    where: { documentId },
    create: { documentId, ...values, completedAt, updatedBy, evidence },
    update: { ...values, completedAt, updatedBy, evidence },
  })
  await prisma.operationalEvent.create({ data: { entityType: invoice ? "INVOICE" : salesOrder ? "SALES_ORDER" : "QUOTE", entityId: document.zohoId || document.id, accountId: document.accountId, eventType: "CLOSEOUT_UPDATED", title: completedAt ? "Sales closeout completed" : "Sales closeout updated", metadata: { values, evidence }, actorId: updatedBy, actorName: access.user?.name || access.user?.email } })
  return NextResponse.json({ success: true, checklist, evidence, warnings: Object.entries(evidence).filter(([, value]) => value && value.verified === false).map(([key]) => `${key} was manually confirmed without linked source evidence`) })
}
