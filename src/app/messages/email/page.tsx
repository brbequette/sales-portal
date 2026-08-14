"use client"

import { EmailInbox } from "@/components/EmailInbox"

export default function EmailPage() {
  return (
    <div className="flex-1 h-full p-4 md:p-6 overflow-hidden flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white mb-1">Email Inbox</h1>
        <p className="text-sm text-[var(--muted)]">Manage your emails across all accounts</p>
      </div>
      
      <div className="flex-1 min-h-0 bg-[var(--surface-2)] rounded-2xl shadow-xl overflow-hidden p-1">
        <EmailInbox />
      </div>
    </div>
  )
}
