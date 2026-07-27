"use client"

import React from "react"
import { SalesBoard } from "@/components/SalesBoard"
import { GlobalTopBar } from "@/components/GlobalTopBar"

export default function SalesPage() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] flex-col">
      <GlobalTopBar />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-6 text-2xl font-bold tracking-tight text-[var(--foreground)]">Sales Leaderboard & Rep KPIs</h1>
          <SalesBoard />
        </div>
      </main>
    </div>
  )
}
