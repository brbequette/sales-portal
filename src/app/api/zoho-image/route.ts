import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ error: 'LOCAL_DATA_INCOMPLETE' }, {
    status: 409,
    headers: { 'Cache-Control': 'private, no-store', 'X-Data-Source': 'POSTGRESQL', 'X-Zoho-Calls': '0', 'X-OAuth-Refreshes': '0' },
  })
}
