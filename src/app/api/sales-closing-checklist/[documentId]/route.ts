import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkAccountOwnership } from '@/lib/auth-helpers'

export async function PUT(req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params
  const document = await prisma.invoice.findFirst({
    where: { OR: [{ id: documentId }, { zohoId: documentId }] },
    select: { accountId: true },
  }) || await prisma.salesOrder.findFirst({
    where: { OR: [{ id: documentId }, { zohoId: documentId }] },
    select: { accountId: true },
  }) || await prisma.quote.findFirst({
    where: { OR: [{ id: documentId }, { zohoId: documentId }] },
    select: { accountId: true },
  })

  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  const access = await checkAccountOwnership(document.accountId)
  if (!access.authorized) return access.errorResponse

  const body = await req.json()
  const values = {
    paymentVerified: body.paymentVerified === true,
    giftSent: body.giftSent === true,
    satisfactionChecked: body.satisfactionChecked === true,
  }
  const completedAt = Object.values(values).every(Boolean) ? new Date() : null
  const updatedBy = access.user?.dbId || access.user?.id || null
  const checklist = await prisma.salesClosingChecklist.upsert({
    where: { documentId },
    create: { documentId, ...values, completedAt, updatedBy },
    update: { ...values, completedAt, updatedBy },
  })
  return NextResponse.json({ success: true, checklist })
}
