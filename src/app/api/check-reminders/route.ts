import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import * as webpush from 'web-push'

const prisma = new PrismaClient()

webpush.setVapidDetails(
  'mailto:admin@titandiamond.net',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const now = new Date()

    // Find tasks with pending reminders
    const tasks = await prisma.task.findMany({
      where: {
        reminderAt: { lte: now },
        reminderFired: false,
        status: { not: 'Completed' },
      },
    })

    let processed = 0

    for (const task of tasks) {
      const method = (task.reminderMethod || '').toLowerCase()

      // Handle push notifications
      if (method.includes('push')) {
        try {
          const subs = await prisma.pushSubscription.findMany({
            where: { userId: task.ownerId },
          })
          for (const sub of subs) {
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.p256dh, auth: sub.auth },
                },
                JSON.stringify({
                  title: 'Task Reminder',
                  body: task.subject,
                  url: '/',
                })
              )
            } catch (pushErr: any) {
              console.error(`Push failed for sub ${sub.id}:`, pushErr.message)
              // If subscription is expired/invalid (410 or 404), clean it up
              if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
                await prisma.pushSubscription.delete({ where: { id: sub.id } })
              }
            }
          }
        } catch (err: any) {
          console.error(`Error sending push for task ${task.id}:`, err.message)
        }
      }

      // Handle SMS reminders (placeholder)
      if (method.includes('sms')) {
        console.log(`[SMS Reminder] Task "${task.subject}" (${task.id}) — owner: ${task.ownerId}`)
      }

      // Handle email reminders (placeholder)
      if (method.includes('email')) {
        console.log(`[Email Reminder] Task "${task.subject}" (${task.id}) — owner: ${task.ownerId}`)
      }

      // Mark reminder as fired
      await prisma.task.update({
        where: { id: task.id },
        data: { reminderFired: true },
      })

      processed++
    }

    return NextResponse.json({ success: true, processed })
  } catch (error: any) {
    console.error('Check Reminders Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
