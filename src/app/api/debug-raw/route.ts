import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 1. Let's count invoices where items column is null at SQL level
    const sqlItemsNull = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int as count FROM "Invoice" WHERE items IS NULL`
    )

    // 2. Count where line_items is missing or null in JSONB
    const sqlLineItemsNull = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int as count FROM "Invoice" WHERE items->'line_items' IS NULL`
    )

    // 3. Count where line_items is empty array in JSONB
    const sqlLineItemsEmpty = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int as count FROM "Invoice" WHERE items->'line_items' = '[]'::jsonb`
    )

    // 4. Count where line_items has items (array length > 0)
    const sqlLineItemsNotEmpty = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int as count FROM "Invoice" WHERE jsonb_array_length(items->'line_items') > 0`
    )

    // 5. Let's find one invoice where items->'line_items' IS NULL
    const sampleSqlNull = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, "zohoId", "invoiceNumber", items FROM "Invoice" WHERE items->'line_items' IS NULL LIMIT 1`
    )

    // 6. Let's find one invoice where items->'line_items' = '[]'::jsonb
    const sampleSqlEmpty = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, "zohoId", "invoiceNumber", items FROM "Invoice" WHERE items->'line_items' = '[]'::jsonb LIMIT 1`
    )

    return NextResponse.json({
      success: true,
      sqlItemsNull: sqlItemsNull[0]?.count,
      sqlLineItemsNull: sqlLineItemsNull[0]?.count,
      sqlLineItemsEmpty: sqlLineItemsEmpty[0]?.count,
      sqlLineItemsNotEmpty: sqlLineItemsNotEmpty[0]?.count,
      sampleSqlNull: sampleSqlNull[0] || null,
      sampleSqlEmpty: sampleSqlEmpty[0] || null
    })
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 })
  }
}
