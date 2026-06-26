import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendPushNotification } from '@/lib/notifications'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  // Allow only Admin
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { userId, title, body, url } = await req.json()
    
    if (!userId || !title || !body) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    await sendPushNotification(userId, { title, body, url })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
