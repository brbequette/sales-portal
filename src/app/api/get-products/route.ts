import { handler } from '../../../../netlify/functions/get-products'
import { executeSessionScopedNetlifyHandler } from '@/lib/netlify-route-adapter'
import type { NextRequest } from 'next/server'

export function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.has('reseed')) {
    return Response.json({ error: 'Use the separately authorized product import action.' }, { status: 405 })
  }
  return executeSessionScopedNetlifyHandler(req, handler, { includeDatabaseFreshness: true })
}
