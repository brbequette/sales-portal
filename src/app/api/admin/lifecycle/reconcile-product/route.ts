import { NextResponse } from 'next/server'
import { getAuthenticatedDbUser } from '@/lib/session-user'
import { reconcileExactBooksProduct } from '@/lib/zoho-books-product-reconciliation'

export async function POST(request: Request) {
  const actor = await getAuthenticatedDbUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.isAdmin) return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })
  const { sku, booksItemId } = await request.json().catch(() => ({}))
  if (!sku) return NextResponse.json({ error: 'sku is required' }, { status: 400 })
  const result = await reconcileExactBooksProduct(String(sku), booksItemId ? String(booksItemId) : undefined)
  return NextResponse.json({ success: result.state === 'SUCCEEDED', ...result }, { status: result.state === 'SUCCEEDED' ? 200 : 409 })
}
