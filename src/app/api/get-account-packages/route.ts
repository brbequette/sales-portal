import { NextResponse } from 'next/server'
import { checkAccountOwnership } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'


export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('accountId')

    if (!accountId) {
      return NextResponse.json({ success: false, error: 'Missing accountId' }, { status: 400 })
    }

    const check = await checkAccountOwnership(accountId)
    if (!check.authorized) {
      return check.errorResponse || NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const account = await prisma.account.findFirst({
      where: { OR: [{ id: accountId }, { zohoId: accountId }] },
      select: { id: true }
    })
    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 })
    }

    const salesOrders = await prisma.salesOrder.findMany({
      where: { accountId: account.id },
      select: { zohoId: true, items: true }
    })
    const salesOrderIds = salesOrders.map(order => order.zohoId).filter((id): id is string => Boolean(id))
    const salesOrderNumbers = salesOrders.map(order => {
      const items = order.items as any
      return items?.salesOrderNumber || items?.salesorder_number
    }).filter(Boolean)

    const packages = (salesOrderIds.length || salesOrderNumbers.length)
      ? await prisma.package.findMany({
          where: {
            OR: [
              { salesOrderId: { in: salesOrderIds } },
              { salesOrderNumber: { in: salesOrderNumbers } }
            ]
          },
          orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }]
        })
      : []

    return NextResponse.json({
      success: true,
      packages: packages.map(pkg => ({
        package_id: pkg.zohoId,
        package_number: pkg.packageNumber,
        salesorder_id: pkg.salesOrderId,
        salesorder_number: pkg.salesOrderNumber,
        shipment_date: pkg.date?.toISOString().split('T')[0] || null,
        status: pkg.status,
        shipping_charge: pkg.shippingCharge,
        shipment_order: pkg.carrier,
        tracking_number: pkg.trackingNumber,
        items: pkg.items
      }))
    })
  } catch (error: any) {
    console.error('Failed to fetch packages:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
