import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPushNotification } from '@/lib/notifications'

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
      if (method.includes('push') && task.ownerId) {
        try {
          await sendPushNotification(task.ownerId, {
            title: '🔔 Task Reminder',
            body: task.subject,
            url: '/'
          })
        } catch (err: any) {
          console.error(`Push failed for task ${task.id}:`, err.message)
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
