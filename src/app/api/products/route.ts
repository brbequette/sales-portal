import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')

    let whereClause = {}
    if (q) {
      whereClause = {
        OR: [
          { sku: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ]
      }
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
      take: 100, // Limit to 100 to avoid huge payloads if no query is provided
    })

    return NextResponse.json({ success: true, products })
  } catch (error: any) {
    console.error('Fetch products error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
