import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkAccountOwnership } from '@/lib/auth-helpers'
import { getDealPackage } from '@/lib/deal-package'
export const dynamic = 'force-dynamic'
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const deal = await prisma.deal.findUnique({ where: { id }, select: { accountId: true } })
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
  const auth = await checkAccountOwnership(deal.accountId)
  if (!auth.authorized) return auth.errorResponse!
  const pkg = await getDealPackage(id)
  if (pkg.account.id !== deal.accountId || (!auth.isAdmin && pkg.account.ownerId !== auth.user?.dbId)) return NextResponse.json({ error: 'Account access changed; reload the record.' }, { status: 403 })
  return NextResponse.json(pkg, { headers: { 'Cache-Control': 'private, no-store', ...(new URL(req.url).searchParams.has('download') ? { 'Content-Disposition': `attachment; filename="deal-${id}.json"` } : {}) } })
}
