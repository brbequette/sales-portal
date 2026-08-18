import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const { poId, trackingNumber, shippingCharge } = await req.json()

    if (!poId) {
      return NextResponse.json({ error: 'Missing poId' }, { status: 400 })
    }

    const updateData: any = {}
    if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber
    
    // If shipping charge is provided, store it in the items JSON
    const existing = await prisma.purchaseOrder.findUnique({ where: { id: poId } })
    if (shippingCharge !== undefined && existing) {
      const items = (existing.items as any) || {}
      items.shipping_charge = parseFloat(shippingCharge) || 0
      updateData.items = items
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true, message: 'Nothing to update' })
    }

    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: updateData,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Update dropship error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
