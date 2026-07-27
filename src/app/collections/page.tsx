"use client"

import React, { useState } from "react"
import { GlobalTopBar } from "@/components/GlobalTopBar"
import { CollectionsModal } from "@/components/CollectionsModal"
import { FiDollarSign, FiPhoneCall, FiClock, FiAlertCircle } from "react-icons/fi"

export default function CollectionsPage() {
  const [selectedRep, setSelectedRep] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(true)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] flex-col">
      <GlobalTopBar />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Collections & Aging Command Center</h1>
              <p className="text-sm text-[var(--muted-foreground)]">Track overdue invoices, log collection calls, and manage payment arrangements.</p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Open Call Workspace
            </button>
          </div>

          {showModal && (
            <CollectionsModal
              repFilter={selectedRep}
              onClose={() => setShowModal(false)}
            />
          )}
        </div>
      </main>
    </div>
  )
}
