import webpush from 'web-push'
import { prisma } from './prisma'

webpush.setVapidDetails(
  'mailto:support@titandiamond.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
)

export async function sendPushNotification(userId: string, payload: { title: string, body: string, url?: string }) {
  // Save notification to DB
  const notification = await prisma.notification.create({
    data: {
      userId,
      title: payload.title,
      body: payload.body,
      url: payload.url
    }
  })

  // Get active push subscriptions for user
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId }
  })

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || `/?tab=dashboard`
  })

  // Send to all endpoints, remove invalid ones
  const promises = subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      }, pushPayload)
    } catch (error: any) {
      if (error.statusCode === 410 || error.statusCode === 404) {
        // Subscription expired or no longer valid
        await prisma.pushSubscription.delete({ where: { id: sub.id } })
      } else {
        console.error('Error sending push notification:', error)
      }
    }
  })

  await Promise.all(promises)
  return notification
}
