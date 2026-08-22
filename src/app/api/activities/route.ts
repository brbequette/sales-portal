import { prisma } from '@/lib/prisma';
import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    // Fetch latest data from various tables
    const [accounts, tasks, invoices, calls, sms] = await Promise.all([
      prisma.account.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, name: true, createdAt: true }
      }),
      prisma.task.findMany({
        where: { status: 'COMPLETED' },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { id: true, subject: true, updatedAt: true, account: { select: { name: true } } }
      }),
      prisma.invoice.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, zohoId: true, amount: true, status: true, createdAt: true, account: { select: { name: true } } }
      }),
      prisma.callLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, direction: true, duration: true, createdAt: true, account: { select: { name: true } } }
      }),
      prisma.smsMessage.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, direction: true, createdAt: true, account: { select: { name: true } } }
      })
    ])

    const activities = [
      ...accounts.map(a => ({
        id: `acc_${a.id}`,
        title: "New Account Created",
        description: `${a.name} was added to the system`,
        timestamp: a.createdAt,
        type: "account",
        link: `/account/${a.id}`
      })),
      ...tasks.map(t => ({
        id: `task_${t.id}`,
        title: "Task Completed",
        description: `${t.subject} for ${t.account?.name || 'Unknown'}`,
        timestamp: t.updatedAt,
        type: "task",
        link: `/tasks`
      })),
      ...invoices.map(i => ({
        id: `inv_${i.id}`,
        title: `Invoice ${i.status}`,
        description: `Invoice ${i.zohoId} ($${i.amount}) - ${i.account?.name || 'Unknown'}`,
        timestamp: i.createdAt,
        type: "invoice",
        link: `/sales`
      })),
      ...calls.map(c => ({
        id: `call_${c.id}`,
        title: `${c.direction === 'INBOUND' ? 'Inbound' : 'Outbound'} Call`,
        description: `Call with ${c.account?.name || 'Unknown'} (${c.duration}s)`,
        timestamp: c.createdAt,
        type: "system", // Or standard type
        link: `/admin/communications`
      })),
      ...sms.map(s => ({
        id: `sms_${s.id}`,
        title: `${s.direction === 'INBOUND' ? 'Received' : 'Sent'} SMS`,
        description: `SMS with ${s.account?.name || 'Unknown'}`,
        timestamp: s.createdAt,
        type: "system",
        link: `/admin/communications`
      }))
    ]

    // Sort descending by timestamp
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Take top 20
    const recentActivities = activities.slice(0, 20)

    return NextResponse.json({ success: true, activities: recentActivities })
  } catch (err: any) {
    console.error("Activities fetch error:", err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
