"use client"

import Link from "next/link"
import { FiCheck, FiArrowLeft, FiCloud, FiAlertCircle } from "react-icons/fi"

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
    <div className="page-content">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-neutral-500/10 border border-neutral-500/20 rounded-xl flex items-center justify-center">
            <FiAlertCircle className="text-neutral-400" size={17} />
          </div>
          <div>
            <h1 className="page-title">Data Backfill</h1>
            <p className="page-subtitle">One-time historical data import utility</p>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <FiCheck size={36} className="text-emerald-400" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">Backfill Complete</h2>
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
              className="td-btn td-btn-primary"
            >
              <FiCloud size={15} />
              Go to Books Scripts
            </Link>
            <Link
              href="/admin"
              className="td-btn td-btn-ghost"
            >
              <FiArrowLeft size={15} />
              Back to Admin
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
