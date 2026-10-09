import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  try {
    const products = await prisma.product.findMany({
      where: { giftItem: true },
      select: { id: true, sku: true, name: true, category: true, stock: true, price: true, vendor: true, manufacturer: true, size: true, imageUrl: true, updatedAt: true },
      orderBy: [{ name: 'asc' }, { sku: 'asc' }],
    })
    return NextResponse.json({ products }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Gift inventory could not be loaded. Please try again.' }, { status: 500 })
  }
}
