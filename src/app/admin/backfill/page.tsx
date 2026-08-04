"use client"

import Link from "next/link"
import { FiCheck, FiArrowLeft, FiCloud } from "react-icons/fi"

/**
 * /admin/backfill — RETIRED
 *
 * The one-time data backfill is complete. All historical invoices, sales orders,
 * and quotes have been imported and their costs/VIG/commissions calculated.
 *
 * Ongoing sync is handled automatically by the Books Scripts page.
 */
export default function BackfillPage() {
  return (
    <div className="p-8 max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
      
      <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
        <FiCheck size={36} className="text-emerald-400" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-white">Backfill Complete</h1>
        <p className="text-neutral-400 text-sm leading-relaxed max-w-md">
          The one-time data backfill is finished. All historical invoices, sales orders, and quotes 
          have been imported with their costs, VIG rates, dead profit, and commissions calculated.
        </p>
        <p className="text-neutral-500 text-xs mt-3">
          This page is retired. For ongoing sync and recalculation, use the Books Scripts page.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Link
          href="/admin/books-scripts"
          className="flex items-center gap-2 px-5 py-2.5 bg-sky-700 hover:bg-sky-600 text-white text-sm font-bold rounded-xl transition-colors"
        >
          <FiCloud size={15} />
          Go to Books Scripts
        </Link>
        <Link
          href="/admin"
          className="flex items-center gap-2 px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 text-sm font-bold rounded-xl transition-colors"
        >
          <FiArrowLeft size={15} />
          Back to Admin
        </Link>
      </div>
    </div>
  )
}
