"use client"

import { useMemo } from "react"
import { FiTrendingUp, FiPackage, FiClock, FiBarChart2 } from "react-icons/fi"

export function AccountAnalytics({
  invoices = [],
  deals = [],
  quotes = [],
  salesOrders = [],
  onDrillDown,
}: {
  invoices?: any[]
  deals?: any[]
  quotes?: any[]
  salesOrders?: any[]
  onDrillDown?: (title: string, invoices: any[]) => void
}) {
  const analytics = useMemo(() => {
    if (!invoices.length) return null

    // Revenue & order stats
    const totalRevenue = invoices.reduce((s, inv) => s + parseFloat(inv.amount || 0), 0)
    const totalProfit = invoices.reduce((s, inv) => s + parseFloat(inv.items?.profit || 0), 0)
    const avgOrderValue = totalRevenue / invoices.length
    const avgProfitValue = invoices.length ? totalProfit / invoices.length : 0
    const margin = totalRevenue ? Math.round((totalProfit / totalRevenue) * 100) : 0

    // Paid vs Overdue
    const paidCount = invoices.filter((i) => i.status === "Paid").length
    const overdueCount = invoices.filter((i) => i.status === "Overdue").length
    const payRate = invoices.length ? Math.round((paidCount / invoices.length) * 100) : 0

    // Purchase frequency (days between orders)
    const sorted = [...invoices]
      .filter((i) => i.issueDate)
      .sort((a, b) => new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime())

    let avgDaysBetween: number | null = null
    if (sorted.length >= 2) {
      let totalGap = 0
      for (let i = 1; i < sorted.length; i++) {
        totalGap +=
          (new Date(sorted[i].issueDate).getTime() - new Date(sorted[i - 1].issueDate).getTime()) /
          (1000 * 3600 * 24)
      }
      avgDaysBetween = Math.round(totalGap / (sorted.length - 1))
    }

    // Top items from invoice line items
    const itemCounts: Record<string, { count: number; revenue: number }> = {}
    for (const inv of invoices) {
      if (Array.isArray(inv.items)) {
        for (const item of inv.items) {
          const name = typeof item === "string" ? item : item.name || "Unknown"
          if (!itemCounts[name]) itemCounts[name] = { count: 0, revenue: 0 }
          itemCounts[name].count++
          itemCounts[name].revenue += parseFloat(item.amount || inv.amount / (inv.items.length || 1) || 0)
        }
      }
    }
    const topItems = Object.entries(itemCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)

    // Yearly spend trend (last 3 years)
    const yearBuckets: Record<string, number> = {}
    for (const inv of invoices) {
      if (inv.issueDate) {
        const yr = new Date(inv.issueDate).getFullYear().toString()
        yearBuckets[yr] = (yearBuckets[yr] || 0) + parseFloat(inv.amount || 0)
      }
    }
    const years = Object.entries(yearBuckets)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .slice(-4)

    const maxYearRevenue = Math.max(...years.map((y) => y[1]), 1)

    return {
      totalRevenue,
      avgOrderValue,
      totalProfit,
      avgProfitValue,
      margin,
      payRate,
      overdueCount,
      paidCount,
      avgDaysBetween,
      topItems,
      years,
      maxYearRevenue,
      invoiceCount: invoices.length,
      dealCount: deals.length,
      quoteCount: quotes.length,
      salesOrderCount: salesOrders.length,
    }
  }, [invoices, deals, quotes, salesOrders])

  if (!analytics) {
    return (
      <div className="text-sm text-neutral-500 italic py-4">No purchase history to analyze yet.</div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-white flex items-center gap-2">
        <FiBarChart2 className="text-purple-400" /> Account Analytics
      </h2>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        <div 
          onClick={() => onDrillDown?.("Lifetime Value (All Invoices)", invoices)}
          className="bg-neutral-800/50 rounded-xl p-3 border border-neutral-800 cursor-pointer hover:bg-neutral-800 transition-colors"
        >
          <div className="text-[10px] uppercase text-neutral-500 font-semibold mb-1">Lifetime Value</div>
          <div className="text-lg font-bold text-emerald-400">${analytics.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="text-[10px] text-neutral-500 mt-0.5">{analytics.invoiceCount} invoices</div>
        </div>
        <div 
          onClick={() => onDrillDown?.("Profit & Margin (All Invoices)", invoices)}
          className="bg-neutral-800/50 rounded-xl p-3 border border-neutral-800 cursor-pointer hover:bg-neutral-800 transition-colors"
        >
          <div className="text-[10px] uppercase text-neutral-500 font-semibold mb-1">Total Profit</div>
          <div className="text-lg font-bold text-sky-400">${analytics.totalProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="text-[10px] text-neutral-500 mt-0.5">{analytics.margin}% avg margin</div>
        </div>
        <div 
          onClick={() => onDrillDown?.("Average Order (All Invoices)", invoices)}
          className="bg-neutral-800/50 rounded-xl p-3 border border-neutral-800 cursor-pointer hover:bg-neutral-800 transition-colors"
        >
          <div className="text-[10px] uppercase text-neutral-500 font-semibold mb-1">Avg Order</div>
          <div className="text-lg font-bold text-blue-400">${analytics.avgOrderValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="text-[10px] text-neutral-500 mt-0.5">per invoice</div>
        </div>
        <div 
          onClick={() => onDrillDown?.("Overdue Invoices", invoices.filter(i => i.status === "Overdue"))}
          className="bg-neutral-800/50 rounded-xl p-3 border border-neutral-800 cursor-pointer hover:bg-neutral-800 transition-colors"
        >
          <div className="text-[10px] uppercase text-neutral-500 font-semibold mb-1">Pay Rate</div>
          <div className={`text-lg font-bold ${analytics.payRate >= 80 ? "text-emerald-400" : analytics.payRate >= 60 ? "text-amber-400" : "text-red-400"}`}>
            {analytics.payRate}%
          </div>
          <div className="text-[10px] text-neutral-500 mt-0.5">{analytics.overdueCount} overdue</div>
        </div>
        <div 
          onClick={() => onDrillDown?.("Order Frequency (All Invoices)", invoices)}
          className="bg-neutral-800/50 rounded-xl p-3 border border-neutral-800 cursor-pointer hover:bg-neutral-800 transition-colors"
        >
          <div className="text-[10px] uppercase text-neutral-500 font-semibold mb-1">Order Freq.</div>
          <div className="text-lg font-bold text-purple-400">
            {analytics.avgDaysBetween !== null ? `${analytics.avgDaysBetween}d` : "—"}
          </div>
          <div className="text-[10px] text-neutral-500 mt-0.5">avg between orders</div>
        </div>
      </div>

      {/* Activity Counts */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Open Deals", value: analytics.dealCount, color: "text-blue-400" },
          { label: "Quotes", value: analytics.quoteCount, color: "text-purple-400" },
          { label: "Sales Orders", value: analytics.salesOrderCount, color: "text-emerald-400" },
        ].map((stat) => (
          <div key={stat.label} className="bg-neutral-800/30 rounded-lg p-2 text-center border border-neutral-800">
            <div className={`text-base font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-[10px] text-neutral-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Year-over-Year Revenue */}
      {analytics.years.length > 1 && (
        <div className="bg-neutral-800/30 rounded-xl p-4 border border-neutral-800">
          <div className="text-xs font-semibold text-neutral-400 uppercase mb-3 flex items-center gap-2">
            <FiTrendingUp className="text-emerald-500" /> Annual Revenue Trend
          </div>
          <div className="space-y-2">
            {analytics.years.map(([year, value]) => (
              <div 
                key={year} 
                className="flex items-center gap-3 cursor-pointer hover:bg-neutral-800/50 p-1 -mx-1 rounded transition-colors"
                onClick={() => onDrillDown?.(`Invoices for ${year}`, invoices.filter(i => new Date(i.issueDate).getFullYear().toString() === year))}
              >
                <div className="w-10 text-xs text-neutral-500 shrink-0">{year}</div>
                <div className="flex-1 bg-neutral-900 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${(value / analytics.maxYearRevenue) * 100}%` }}
                  />
                </div>
                <div className="w-20 text-right text-xs font-bold text-white shrink-0">
                  ${(value / 1000).toFixed(1)}k
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Products */}
      {analytics.topItems.length > 0 && (
        <div className="bg-neutral-800/30 rounded-xl p-4 border border-neutral-800">
          <div className="text-xs font-semibold text-neutral-400 uppercase mb-3 flex items-center gap-2">
            <FiPackage className="text-blue-400" /> Most Purchased Items
          </div>
          <div className="space-y-2">
            {analytics.topItems.map(([name, data], i) => (
              <div 
                key={name} 
                className="flex items-center gap-3 cursor-pointer hover:bg-neutral-800/50 p-1 -mx-1 rounded transition-colors"
                onClick={() => onDrillDown?.(`Invoices containing ${name}`, invoices.filter(inv => inv.items?.some((item: any) => (typeof item === 'string' ? item : item.name || "Unknown") === name)))}
              >
                <div className="w-5 h-5 rounded-full bg-neutral-700 flex items-center justify-center text-[10px] font-bold text-neutral-300 shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate">{name}</div>
                </div>
                <div className="text-[10px] text-neutral-500 shrink-0">{data.count}x ordered</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
