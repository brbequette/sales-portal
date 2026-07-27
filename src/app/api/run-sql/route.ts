import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'Endpoint permanently disabled for security' }, { status: 404 })
}

