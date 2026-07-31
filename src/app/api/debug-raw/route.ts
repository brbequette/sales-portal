import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function tryQuery(label: string, sql: string) {
  try {
    const res = await prisma.$queryRawUnsafe<any[]>(sql)
    return { success: true, result: res }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function GET() {
  const sqlItemsNull = await tryQuery("sqlItemsNull", `SELECT COUNT(*)::int as count FROM "Invoice" WHERE items IS NULL`)
  const sqlLineItemsNull = await tryQuery("sqlLineItemsNull", `SELECT COUNT(*)::int as count FROM "Invoice" WHERE items->'line_items' IS NULL`)
  const sqlLineItemsEmpty = await tryQuery("sqlLineItemsEmpty", `SELECT COUNT(*)::int as count FROM "Invoice" WHERE items->'line_items' = '[]'::jsonb`)
  const sqlLineItemsNotEmpty = await tryQuery("sqlLineItemsNotEmpty", `SELECT COUNT(*)::int as count FROM "Invoice" WHERE jsonb_array_length(items->'line_items') > 0`)
  const sampleSqlNull = await tryQuery("sampleSqlNull", `SELECT id, "zohoId", items FROM "Invoice" WHERE items->'line_items' IS NULL LIMIT 1`)
  const sampleSqlEmpty = await tryQuery("sampleSqlEmpty", `SELECT id, "zohoId", items FROM "Invoice" WHERE items->'line_items' = '[]'::jsonb LIMIT 1`)

  // Let's also retrieve the first 5 invoices to see their JSON keys at SQL level
  const first5Invoices = await tryQuery("first5", `SELECT id, jsonb_object_keys(items) as key FROM "Invoice" LIMIT 20`)

  const safeData = JSON.parse(JSON.stringify({
    sqlItemsNull,
    sqlLineItemsNull,
    sqlLineItemsEmpty,
    sqlLineItemsNotEmpty,
    sampleSqlNull,
    sampleSqlEmpty,
    first5Invoices
  }, (key, value) => 
    typeof value === 'bigint' ? value.toString() : value
  ))

  return NextResponse.json({
    success: true,
    ...safeData
  })
}
