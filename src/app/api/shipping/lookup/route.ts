import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const q = searchParams.get('q')

  if (!q) {
    return NextResponse.json({ results: [] })
  }

  try {
    if (type === 'vendor') {
      const vendors = await prisma.vendor.findMany({
        where: {
          OR: [
            { companyName: { contains: q, mode: 'insensitive' } },
            { contactName: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 10,
      })

      const results = vendors.map((v: any) => {
        const addr = (v.shippingAddress as any) || {}
        return {
          id: v.id,
          name: v.companyName || v.contactName,
          address: addr.address,
          city: addr.city,
          state: addr.state,
          zip: addr.zip,
          country: addr.country_code || 'US',
        }
      })

      return NextResponse.json({ results })
    }

    if (type === 'customer') {
      const customers = await prisma.account.findMany({
        where: {
          name: { contains: q, mode: 'insensitive' },
        },
        take: 10,
      })

      const results = customers.map((c: any) => ({
        id: c.id,
        name: c.name,
        address: c.shippingStreet,
        city: c.shippingCity,
        state: c.shippingState,
        zip: c.shippingZip,
        country: 'US',
      }))

      return NextResponse.json({ results })
    }

    return NextResponse.json({ results: [] })
  } catch (error) {
    console.error('Lookup API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
