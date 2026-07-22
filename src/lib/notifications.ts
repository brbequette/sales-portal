import webpush from 'web-push'
import { prisma } from './prisma'

// -- Types ------------------------------------------------------

export type NotificationChannel = 'in_app' | 'email' | 'sms'

interface SendNotificationOptions {
  userId: string
  channel: NotificationChannel
  title: string
  body: string
  url?: string
  templateId?: string
  variables?: Record<string, string>
}

// -- VAPID Setup ------------------------------------------------

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

// -- Template Resolution ----------------------------------------

/** Resolve template variables like {{dealName}}, {{accountName}} */
function resolveTemplate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`)
}

// -- In-App + Push (original sendPushNotification preserved) ----

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

// -- Alias for in-app (DB record + web push) --------------------

export async function sendInAppNotification(userId: string, title: string, body: string, url?: string) {
  return sendPushNotification(userId, { title, body, url })
}

// -- Email via ZeptoMail ----------------------------------------

export async function sendEmailNotification(userId: string, title: string, body: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
  if (!user?.email) return

  const zeptoApiKey = process.env.ZEPTO_MAIL_API_KEY
  if (zeptoApiKey) {
    try {
      await fetch('https://api.zeptomail.com/v1.1/email', {
        method: 'POST',
        headers: {
          'Authorization': `Zoho-enczapikey ${zeptoApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: { address: process.env.ZEPTO_FROM_EMAIL || 'notifications@tdusales.com', name: 'Titan Diamond Sales' },
          to: [{ email_address: { address: user.email, name: user.name || '' } }],
          subject: title,
          htmlbody: `<div style="font-family:sans-serif;padding:20px;"><h2>${title}</h2><p>${body}</p></div>`
        })
      })
    } catch (e) {
      console.error('Email notification failed:', e)
    }
  } else {
    console.log(`[Email Notification] To: ${user.email} | ${title}: ${body}`)
  }
}

// -- SMS via Zoho Voice -----------------------------------------

export async function sendSmsNotification(userId: string, body: string) {
  // Look up user's phone from their account or user record
  console.log(`[SMS Notification] To userId: ${userId} | ${body}`)
  // TODO: Integrate with existing Zoho Voice SMS when credentials are provided
}

// -- Unified Dispatcher -----------------------------------------

export async function sendNotification(options: SendNotificationOptions) {
  let { title, body } = options

  // If template provided, resolve it
  if (options.templateId) {
    const template = await prisma.notificationTemplate.findUnique({ where: { id: options.templateId } })
    if (template && template.isActive) {
      title = options.variables ? resolveTemplate(template.subject || template.name, options.variables) : (template.subject || template.name)
      body = options.variables ? resolveTemplate(template.body, options.variables) : template.body
    }
  }

  switch (options.channel) {
    case 'in_app':
      await sendInAppNotification(options.userId, title, body, options.url)
      break
    case 'email':
      await sendEmailNotification(options.userId, title, body)
      break
    case 'sms':
      await sendSmsNotification(options.userId, body)
      break
  }
}

// -- Batch: Stage-triggered Notifications -----------------------

export async function sendStageNotifications(
  dealId: string,
  stageNotifications: any[],
  variables: Record<string, string>
) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { ownerId: true }
  })
  if (!deal) return

  for (const notif of stageNotifications) {
    if (notif.timing === 'immediate') {
      await sendNotification({
        userId: deal.ownerId,
        channel: notif.channel,
        title: variables.stageName || 'Stage Update',
        body: `Deal has entered stage: ${variables.stageName}`,
        templateId: notif.templateId,
        variables
      })
    }
    // Delayed and recurring notifications would be handled by a cron/scheduler
    if (notif.timing === 'delayed' || notif.timing === 'recurring') {
      console.log(`[Scheduled Notification] ${notif.timing} for deal ${dealId}, delay: ${notif.delayMinutes}min`)
    }
  }
}
