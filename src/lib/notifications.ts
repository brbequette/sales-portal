import webpush from 'web-push'
import { prisma } from './prisma'

let vapidDetailsSet = false

function ensureVapidDetails() {
  if (vapidDetailsSet) return
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn("VAPID keys not set. Push notifications will not work.")
    return
  }
  webpush.setVapidDetails(
    'mailto:support@titandiamond.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
  vapidDetailsSet = true
}

export async function sendPushNotification(userId: string, payload: { title: string, body: string, url?: string }) {
  ensureVapidDetails()
  
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

  if (subscriptions.length === 0) {
    return { notification, subscriptionsSent: 0, message: 'No push subscriptions found for this user. They need to enable push notifications in their User Settings first.' }
  }

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || `/?tab=dashboard`
  })

  let sent = 0
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
      sent++
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
  return { notification, subscriptionsSent: sent }
}
