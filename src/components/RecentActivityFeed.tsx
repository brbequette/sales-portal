"use client"
import React, { useEffect, useState } from "react"
import Link from "next/link"
import { FiActivity, FiUserPlus, FiFileText, FiCheckSquare, FiAlertCircle } from "react-icons/fi"

type ActivityEvent = {
  id: string
  title: string
  description: string
  timestamp: Date
  type: "account" | "invoice" | "task" | "system"
  link?: string
}

export function RecentActivityFeed() {
  const [activities, setActivities] = useState<ActivityEvent[]>([])

  useEffect(() => {
    // In a real app this would be a WebSocket or Server-Sent Events (SSE)
    // For now, we simulate an activity stream.
    setActivities([
      { id: "1", title: "New Lead Created", description: "John Doe from Acme Corp", timestamp: new Date(Date.now() - 1000 * 60 * 5), type: "account", link: "/accounts" },
      { id: "2", title: "Invoice Paid", description: "INV-10492 ($450.00) paid by XYZ Inc", timestamp: new Date(Date.now() - 1000 * 60 * 22), type: "invoice", link: "/invoices" },
      { id: "3", title: "Task Completed", description: "Follow up with Sarah", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), type: "task", link: "/tasks" },
      { id: "4", title: "Zoho Sync Complete", description: "48 accounts synchronized", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4), type: "system", link: "/admin" },
    ])
  }, [])

  return (
    <div className="glass-panel border border-[var(--border)] rounded-2xl flex flex-col h-[350px] overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2 bg-black/10">
        <FiActivity className="text-[var(--primary)]" />
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Live Activity Stream</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activities.map(activity => {
          const content = (
            <>
              <div className={`mt-0.5 shrink-0 w-7 h-7 rounded-lg flex items-center justify-center shadow-lg
                ${activity.type === 'account' ? 'bg-emerald-500/10 text-emerald-400' :
                  activity.type === 'invoice' ? 'bg-blue-500/10 text-blue-400' :
                  activity.type === 'task' ? 'bg-amber-500/10 text-amber-400' :
                  'bg-neutral-500/10 text-neutral-400'
                }
              `}>
                {activity.type === 'account' ? <FiUserPlus size={14} /> :
                 activity.type === 'invoice' ? <FiFileText size={14} /> :
                 activity.type === 'task' ? <FiCheckSquare size={14} /> :
                 <FiAlertCircle size={14} />}
              </div>
              <div>
                <div className="text-xs font-bold text-white group-hover:text-[var(--primary)] transition-colors">{activity.title}</div>
                <div className="text-[11px] text-neutral-400 mt-0.5">{activity.description}</div>
                <div className="text-[9px] font-black text-neutral-500 uppercase tracking-wider mt-1">
                  {formatTimeAgo(activity.timestamp)}
                </div>
              </div>
            </>
          )

          return activity.link ? (
            <Link key={activity.id} href={activity.link} className="flex gap-3 items-start group hover:bg-white/5 p-2 rounded-lg transition-colors -m-2">
              {content}
            </Link>
          ) : (
            <div key={activity.id} className="flex gap-3 items-start group p-2 rounded-lg -m-2">
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatTimeAgo(date: Date) {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
  let interval = seconds / 31536000
  if (interval > 1) return Math.floor(interval) + " years ago"
  interval = seconds / 2592000
  if (interval > 1) return Math.floor(interval) + " months ago"
  interval = seconds / 86400
  if (interval > 1) return Math.floor(interval) + " days ago"
  interval = seconds / 3600
  if (interval > 1) return Math.floor(interval) + " hours ago"
  interval = seconds / 60
  if (interval > 1) return Math.floor(interval) + " minutes ago"
  return Math.floor(seconds) + " seconds ago"
}
