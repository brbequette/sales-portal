import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendPushNotification } from '@/lib/notifications'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  // Allow only Admin
  const normalizedRole = session.user.role?.toLowerCase() || ""
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("collections") || normalizedRole.includes("manager")
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { userId, title, body, url } = await req.json()
    
    if (!userId || !title || !body) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const result = await sendPushNotification(userId, { title, body, url })

    if (result.subscriptionsSent === 0 && result.message) {
      return NextResponse.json({ success: true, warning: result.message, subscriptionsSent: 0 })
    }

    return NextResponse.json({ success: true, subscriptionsSent: result.subscriptionsSent })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
