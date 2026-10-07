import { NextResponse } from 'next/server'
import { authenticateRequest } from '../../../../../netlify/functions/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { isAdminRole } from '@/lib/roles'
import { documentReferences, overviewDocument } from '@/lib/collection-overview'

const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(req: Request) {
  let auth
  try { auth = await authenticateRequest(req) } catch { return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers }) }
  try {
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Invoice required' }, { status: 400, headers })
    const user = await prisma.user.findFirst({ where: { OR: [
      ...(auth.dbId ? [{ id: auth.dbId }] : []), ...(auth.userId ? [{ id: auth.userId }] : []),
      ...(auth.email ? [{ email: { equals: auth.email, mode: 'insensitive' as const } }] : []),
    ] }, select: { id: true, email: true, role: true } })
    if (!user) return NextResponse.json({ error: 'Access unavailable' }, { status: 403, headers })
    const manager = await prisma.systemSetting.findUnique({ where: { key: 'collections_manager_id' }, select: { value: true } })
    const company = isAdminRole(user.role) || manager?.value === user.id || user.email.toLowerCase() === 'brian@titandiamond.net'
    const invoice = await prisma.invoice.findFirst({ where: { id, ...(company ? {} : { account: { ownerId: user.id } }) }, include: {
      lineItems: true, account: { select: {
        id: true, name: true, status: true, quality: true,
        billingStreet: true, billingCity: true, billingState: true, billingZip: true,
        shippingStreet: true, shippingCity: true, shippingState: true, shippingZip: true,
        lastCalledAt: true, nextActionDate: true,
        owner: { select: { name: true, email: true } },
        contacts: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, mobilePhone: true, isPrimary: true } },
      } },
    } })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found or unavailable to you' }, { status: 404, headers })
    const references = documentReferences(invoice, 'salesorder')
    const orderWhere = references.flatMap(ref => [
      { id: ref }, { zohoId: ref },
      ...['salesOrderNumber', 'salesorder_number'].map(key => ({ items: { path: [key], equals: ref } })),
      { items: { path: ['_zohoRaw', 'salesorder_number'], equals: ref } },
      { rawData: { path: ['salesorder_number'], equals: ref } },
    ])
    const orders = orderWhere.length ? await prisma.salesOrder.findMany({ where: { accountId: invoice.accountId, OR: orderWhere }, include: { lineItems: true } }) : []
    const quoteRefs = [...new Set([invoice, ...orders].flatMap(d => documentReferences(d, 'estimate')))]
    const quotes = quoteRefs.length ? await prisma.quote.findMany({ where: { accountId: invoice.accountId, OR: quoteRefs.flatMap(ref => [
      { id: ref }, { zohoId: ref }, { items: { path: ['estimateNumber'], equals: ref } }, { items: { path: ['estimate_number'], equals: ref } },
      { items: { path: ['_zohoRaw', 'estimate_number'], equals: ref } }, { rawData: { path: ['estimate_number'], equals: ref } },
    ]) }, include: { lineItems: true } }) : []
    // Resolve package/PO links only from orders verified to belong to this account.
    const orderIds = orders.flatMap(o => [o.id, o.zohoId].filter((v): v is string => !!v))
    const orderNumbers = orders.map(o => overviewDocument(o, 'Sales order').number).filter((v): v is string => !!v)
    const links = [{ salesOrderId: { in: orderIds } }, { salesOrderNumber: { in: orderNumbers } }]
    const [packages, purchases, payments] = await Promise.all([
      orders.length ? prisma.package.findMany({ where: { OR: links }, orderBy: { date: 'desc' } }) : [],
      prisma.purchaseOrder.findMany({ where: { OR: [{ invoiceId: { in: [invoice.id, invoice.zohoId] } }, ...(orders.length ? links : [])] }, orderBy: { date: 'desc' } }),
      prisma.payment.findMany({ where: { OR: [{ invoiceDbId: invoice.id }, { invoiceId: invoice.zohoId }] }, orderBy: { date: 'desc' } }),
    ])
    const documents = [overviewDocument(invoice, 'Invoice'), ...orders.map(o => overviewDocument(o, 'Sales order')), ...quotes.map(q => overviewDocument(q, 'Estimate'))]
    // Explicit allowlists keep private provider payloads and user credentials out of the response.
    return NextResponse.json({ account: invoice.account, documents,
      packages: packages.map(p => ({ number: p.packageNumber, date: p.date, status: p.status, carrier: p.carrier, tracking: p.trackingNumber, shippingCharge: p.shippingCharge, salesOrder: p.salesOrderNumber,
        lines: overviewDocument(p, 'Package').lines })),
      purchases: purchases.map(p => ({ number: p.poNumber, vendor: p.vendorName, date: p.date, status: p.status, total: p.total, dropship: p.isDropshipment, tracking: p.trackingNumber, shipTo: p.shipToName, shippingAddress: p.shippingAddress, salesOrder: p.salesOrderNumber,
        lines: overviewDocument({ ...p, amount: p.total }, 'Purchase order').lines })),
      payments: payments.map(p => ({ date: p.date, amount: p.amount, mode: p.mode, status: p.status, reference: p.referenceNumber })),
      missingOrderLinks: references.length > 0 && !orders.length,
    }, { headers })
  } catch { return NextResponse.json({ error: 'Could not load the saved order overview. Please retry.' }, { status: 500, headers }) }
}
