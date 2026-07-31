import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const res = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, "zohoId", "invoiceNumber", items FROM "Invoice" 
       WHERE items->'line_items' IS DISTINCT FROM '[]'::jsonb 
       AND (items->'line_items' IS NULL OR jsonb_typeof(items->'line_items') != 'array')
       LIMIT 5`
    )

    const safeData = JSON.parse(JSON.stringify(res, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value
    ))

    return NextResponse.json({
      success: true,
      data: safeData
    })
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message
    })
  }
}
