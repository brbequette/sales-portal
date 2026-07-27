"use client"

import React, { useState } from "react"
import { GlobalTopBar } from "@/components/GlobalTopBar"
import { PayPeriodStatementModal } from "@/components/PayPeriodStatementModal"
import { FiDollarSign, FiPercent, FiTrendingUp, FiAward } from "react-icons/fi"

export default function CommissionsPage() {
  const [showStatement, setShowStatement] = useState(false)

  const repSummary = {
    repId: "ben-bequette",
    repName: "Benjamin Bequette",
    invoices: [],
    payouts: [],
    totalEarned: 0,
    totalPaid: 0,
    totalProfit: 0,
    totalSales: 0,
    balance: 0,
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] flex-col">
      <GlobalTopBar />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Sales Commissions & VIG Payroll Statements</h1>
              <p className="text-sm text-[var(--muted-foreground)]">Review estimated profits, VIG deductions, draw balances, and net commission payouts.</p>
            </div>
            <button
              onClick={() => setShowStatement(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 flex items-center gap-2"
            >
              <FiAward className="h-4 w-4" />
              View Pay Statement
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Default VIG Markup</span>
                <FiPercent className="h-5 w-5 text-indigo-400" />
              </div>
              <div className="mt-3 text-2xl font-bold text-[var(--foreground)]">1.30 (30%)</div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Standard dead cost multiplier</p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Commission Split</span>
                <FiDollarSign className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="mt-3 text-2xl font-bold text-[var(--foreground)]">50.0%</div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Share on Net Profit after VIG</p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Pay Period Cycle</span>
                <FiTrendingUp className="h-5 w-5 text-amber-400" />
              </div>
              <div className="mt-3 text-2xl font-bold text-[var(--foreground)]">Semi-Monthly</div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">1st–15th & 16th–End of Month</p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Status</span>
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">Active</span>
              </div>
              <div className="mt-3 text-2xl font-bold text-[var(--foreground)]">Auto-Calculated</div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Synced with Zoho Books Invoices</p>
            </div>
          </div>

          {showStatement && (
            <PayPeriodStatementModal
              rep={repSummary}
              onClose={() => setShowStatement(false)}
            />
          )}
        </div>
      </main>
    </div>
  )
}
