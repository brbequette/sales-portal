"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { InvoiceDetailsModal } from "@/components/InvoiceDetailsModal"
import { getZohoBooksUrl } from "@/lib/zoho-urls"
import {
  FiChevronLeft, FiPrinter, FiCalendar,
  FiDollarSign, FiTrendingUp, FiFileText, FiActivity, FiClock, FiSearch
} from "react-icons/fi"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0)
}

function fmtPct(n: number) {
  return `${(n || 0).toFixed(1)}%`
}

function calculateTotals(documents: any[]) {
  const totals = {
    count: documents.length, invoiceCount: 0, salesOrderCount: 0, draftCount: 0,
    sales: 0, deadCost: 0, profit: 0, deadProfit: 0,
    commission: 0, upfront: 0, final: 0, future: 0,
    shipping: 0, markup: 0,
    paidCount: 0, unpaidCount: 0, pendingPay: 0,
  }
  for (const document of documents) {
    if (document.documentType === "salesorder") totals.salesOrderCount++
    else totals.invoiceCount++
    if (document.isDraft) totals.draftCount++
    totals.sales += document.amount || 0
    totals.deadCost += document.deadCost || 0
    totals.profit += document.profit || 0
    totals.deadProfit += document.deadProfit || 0
    totals.commission += document.commission?.total || 0
    totals.upfront += document.commission?.upfront || 0
    totals.final += document.commission?.final || 0
    totals.future += document.commission?.future || 0
    totals.shipping += document.actualShippingCost || 0
    if (document.documentType !== "invoice" || document.isDraft) continue
    if (document.isPaid) totals.paidCount++
    else {
      totals.unpaidCount++
      totals.pendingPay += document.commission?.future || 0
    }
  }
  totals.markup = totals.deadCost > 0 ? totals.sales / totals.deadCost : 0
  return totals
}

export default function SalesSheetPage() {
  const { zohoContext: user } = useZoho()
  const searchParams = useSearchParams()

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedRepId, setSelectedRepId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [supplementalDocuments, setSupplementalDocuments] = useState<any[]>([])
  const [activeInvoice, setActiveInvoice] = useState<any>(null)
  const [documentSearch, setDocumentSearch] = useState("")
  const [documentType, setDocumentType] = useState<"all" | "invoice" | "draft" | "salesorder">("all")
  const [documentSort, setDocumentSort] = useState<"date-asc" | "date-desc" | "amount-desc" | "amount-asc" | "company">("date-asc")

  const normalizedRole = (user?.role || "").toLowerCase()
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("manager")

  useEffect(() => {
    const repParam = searchParams.get("repId")
    const monthParam = searchParams.get("month")
    const yearParam = searchParams.get("year")
    if (repParam) setSelectedRepId(repParam)
    if (monthParam) setSelectedMonth(parseInt(monthParam))
    if (yearParam) setSelectedYear(parseInt(yearParam))
  }, [searchParams])

  useEffect(() => {
    if (!user) return
    const effectiveRepId = selectedRepId || user.repId || user.id
    if (!effectiveRepId) return

    setLoading(true)
    fetch(`/api/get-commissions?includeHidden=true&year=${selectedYear}&userId=${user.id}&userEmail=${user.email}`)
      .then(r => r.json())
      .then(d => {
        setData(d)
        if (!selectedRepId && user) {
          const repId = user.repId || user.id
          if (repId && d.byRep?.[repId]) setSelectedRepId(repId)
          else if (d.byRep && Object.keys(d.byRep).length > 0) setSelectedRepId(Object.keys(d.byRep)[0])
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [user, selectedYear])

  useEffect(() => {
    if (!user || !selectedRepId) return
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/commissions/monthly-sales-sheet?repId=${encodeURIComponent(selectedRepId)}&month=${selectedMonth}&year=${selectedYear}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("Monthly document request failed")))
      .then(result => setSupplementalDocuments(result.documents || []))
      .catch(error => { if (error.name !== "AbortError") setSupplementalDocuments([]) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [user, selectedRepId, selectedMonth, selectedYear])

  const monthDocuments = useMemo(() => {
    if (!data?.byRep?.[selectedRepId]) return []
    const rep = data.byRep[selectedRepId]
    const invoices = rep.invoices || []
    const regularInvoices = invoices
      .filter((inv: any) => {
        const invNum = inv.invoiceNumber || ''
        if (typeof invNum === 'string' && invNum.startsWith('SO-')) return false
        if (String(inv.status || '').toLowerCase() === 'draft') return false
        const dateStr = inv.issueDate || inv.createdAt
        if (!dateStr) return false
        const d = new Date(dateStr)
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear
      })
      .map((inv: any) => ({ ...inv, documentType: "invoice", documentNumber: inv.invoiceNumber, status: inv.isPaid ? "Paid" : "Unpaid" }))
    const uniqueDocuments = new Map<string, any>()
    for (const document of [...regularInvoices, ...supplementalDocuments]) {
      const identity = `${document.documentType}:${document.zohoId || document.id || document.documentNumber || document.invoiceNumber}`
      if (!uniqueDocuments.has(identity)) uniqueDocuments.set(identity, document)
    }
    return [...uniqueDocuments.values()]
      .sort((a: any, b: any) => new Date(a.issueDate || a.createdAt).getTime() - new Date(b.issueDate || b.createdAt).getTime())
  }, [data, selectedRepId, selectedMonth, selectedYear, supplementalDocuments])

  const totals = useMemo(() => calculateTotals(monthDocuments), [monthDocuments])

  const visibleDocuments = useMemo(() => {
    const query = documentSearch.trim().toLowerCase()
    return monthDocuments
      .filter((document: any) => {
        const matchesType = documentType === "all"
          || (documentType === "draft" ? document.isDraft : document.documentType === documentType && !document.isDraft)
        const matchesSearch = !query || [document.documentNumber, document.invoiceNumber, document.accountName, document.contactPhone, document.status]
          .some(value => String(value || "").toLowerCase().includes(query))
        return matchesType && matchesSearch
      })
      .sort((left: any, right: any) => {
        if (documentSort === "amount-desc") return (right.amount || 0) - (left.amount || 0)
        if (documentSort === "amount-asc") return (left.amount || 0) - (right.amount || 0)
        if (documentSort === "company") return String(left.accountName || "").localeCompare(String(right.accountName || ""), undefined, { sensitivity: "base" })
        const difference = new Date(left.issueDate || left.createdAt).getTime() - new Date(right.issueDate || right.createdAt).getTime()
        return documentSort === "date-desc" ? -difference : difference
      })
  }, [monthDocuments, documentSearch, documentType, documentSort])

  const visibleTotals = useMemo(() => calculateTotals(visibleDocuments), [visibleDocuments])

  const repName = data?.byRep?.[selectedRepId]?.repName || "—"
  const monthLabel = `${MONTHS[selectedMonth]} ${selectedYear}`
  const yearOptions = data?.years || [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2]

  const handlePrint = () => window.print()

  if (!user) return null

  return (
    <div className="flex flex-col h-[100dvh] font-sans" style={{ background: "var(--background, #0f1013)", color: "var(--text, #fff)" }}>
      {/* Header */}
      <div className="flex-shrink-0 border-b backdrop-blur-xl z-20" style={{ background: "rgba(15,16,19,0.92)", borderColor: "var(--border, #262626)" }}>
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/commissions" className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors print:hidden">
              <FiChevronLeft size={20} />
            </Link>
            <img src="/images/brand/titan-diamond-2026.png" alt="Titan Diamond USA" className="h-8 w-auto object-contain" />
            <div>
              <h1 className="text-lg font-bold text-white">Monthly Sales Sheet</h1>
              <p className="text-xs text-neutral-500 uppercase">{repName} — {monthLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <div className="flex items-center gap-1.5">
              <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}
                className="bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm text-white font-medium cursor-pointer focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none">
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
                className="bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm text-white font-medium cursor-pointer focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none">
                {yearOptions.map((y: number) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {isAdmin && data?.byRep && (
              <select value={selectedRepId} onChange={e => setSelectedRepId(e.target.value)}
                className="bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm text-white font-medium cursor-pointer focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none max-w-[180px]">
                {Object.entries(data.byRep).map(([id, rep]: any) => (
                  <option key={id} value={id}>{String(rep.repName || "").toUpperCase()}</option>
                ))}
              </select>
            )}
            <button onClick={handlePrint} className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors" title="Print">
              <FiPrinter size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Summary KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {[
                  { label: "Volume", value: fmt(totals.sales), icon: FiDollarSign, color: "emerald" },
                  { label: "Documents", value: `${totals.count}`, sub: `${totals.invoiceCount} inv · ${totals.salesOrderCount} SO · ${totals.draftCount} draft`, icon: FiFileText, color: "sky" },
                  { label: "Dead Cost", value: fmt(totals.deadCost), icon: FiActivity, color: "amber" },
                  { label: "Dead Profit", value: fmt(totals.deadProfit), icon: FiTrendingUp, color: "cyan" },
                  { label: "Net Profit", value: fmt(totals.profit), sub: `Margin: ${totals.sales > 0 ? fmtPct((totals.profit / totals.sales) * 100) : "—"}`, icon: FiTrendingUp, color: "emerald" },
                  { label: "Markup", value: `${totals.markup.toFixed(2)}x`, icon: FiTrendingUp, color: "violet" },
                  { label: "Commission", value: fmt(totals.commission), sub: `Up: ${fmt(totals.upfront)} · Fin: ${fmt(totals.final)}`, icon: FiDollarSign, color: "violet" },
                  { label: "Pending Commission", value: fmt(totals.pendingPay), sub: `${totals.unpaidCount} invoices`, icon: FiClock, color: totals.unpaidCount > 0 ? "amber" : "neutral" },
                ].map((card, i) => (
                  <div key={i} className="rounded-xl border p-3" style={{ background: "color-mix(in srgb, var(--surface, #18181b) 80%, transparent)", borderColor: "var(--border, #262626)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <card.icon size={13} className="text-neutral-500" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{card.label}</span>
                    </div>
                    <div className="text-lg font-bold text-white">{card.value}</div>
                    {card.sub && <div className="text-[10px] text-neutral-500 mt-0.5">{card.sub}</div>}
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center print:hidden">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Search sales documents</span>
                  <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
                  <input
                    value={documentSearch}
                    onChange={event => setDocumentSearch(event.target.value)}
                    placeholder="Search document, company, phone, or status"
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-900 py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </label>
                <select
                  aria-label="Filter document type"
                  value={documentType}
                  onChange={event => setDocumentType(event.target.value as typeof documentType)}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                >
                  <option value="all">All document types</option>
                  <option value="invoice">Invoices</option>
                  <option value="draft">Draft invoices</option>
                  <option value="salesorder">Uninvoiced sales orders</option>
                </select>
                <select
                  aria-label="Sort sales documents"
                  value={documentSort}
                  onChange={event => setDocumentSort(event.target.value as typeof documentSort)}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                >
                  <option value="date-asc">Oldest first</option>
                  <option value="date-desc">Newest first</option>
                  <option value="amount-desc">Highest volume</option>
                  <option value="amount-asc">Lowest volume</option>
                  <option value="company">Company A–Z</option>
                </select>
                <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  {visibleDocuments.length} of {monthDocuments.length}
                </span>
              </div>

              {/* Sales document table */}
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border, #262626)", background: "var(--surface, #18181b)" }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: "1200px" }}>
                    <thead>
                      <tr className="border-b" style={{ borderColor: "var(--border, #262626)" }}>
                        <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">#</th>
                        <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Document</th>
                        <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Company</th>
                        <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Phone</th>
                        <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Date</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Volume</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Cost</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Profit</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Markup</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">VIG</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Comm.</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Days Old</th>
                        <th className="text-center px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleDocuments.length === 0 ? (
                        <tr>
                          <td colSpan={13} className="px-3 py-12 text-center text-neutral-500">
                            <FiCalendar size={28} className="mx-auto mb-2 text-neutral-600" />
                            <p className="text-sm font-medium">No matching sales documents for {monthLabel}</p>
                            <p className="text-xs text-neutral-600 mt-1">Try changing the month, search, or document filter</p>
                          </td>
                        </tr>
                      ) : visibleDocuments.map((inv: any, idx: number) => {
                        const invVigRate = inv.vigRate || 1.3
                        const docTheme = inv.isDraft
                          ? { label: "DRAFT", border: "#a855f7", link: "text-violet-400 hover:text-violet-300", badge: "bg-violet-500/15 text-violet-300 border-violet-500/30" }
                          : inv.documentType === "salesorder"
                            ? { label: "SO", border: "#f59e0b", link: "text-amber-400 hover:text-amber-300", badge: "bg-amber-500/15 text-amber-300 border-amber-500/30" }
                            : inv.documentType === "estimate"
                              ? { label: "EST", border: "#22d3ee", link: "text-cyan-400 hover:text-cyan-300", badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" }
                              : { label: "INV", border: "#38bdf8", link: "text-sky-400 hover:text-sky-300", badge: "bg-sky-500/15 text-sky-300 border-sky-500/30" }
                        const markup = (inv.deadCost || 0) > 0 ? ((inv.amount || 0) / inv.deadCost).toFixed(2) : "—"
                        const phoneNumber = inv.contactPhone || null
                        const daysOld = inv.daysOld ? Math.round(inv.daysOld) : (inv.issueDate ? Math.round((Date.now() - new Date(inv.issueDate).getTime()) / (1000 * 60 * 60 * 24)) : 0)
                        return (
                        <tr
                          key={inv.id}
                          className={`border-b hover:bg-white/[0.02] transition-colors group ${inv.documentType === "invoice" && !inv.isDraft ? "cursor-pointer" : ""}`}
                          style={{ borderColor: "var(--border, #1a1a1a)", borderLeft: `4px solid ${docTheme.border}`, ...(inv.usedFallbackCost ? { background: 'rgba(245,158,11,0.03)' } : {}) }}
                          onClick={() => { if (inv.documentType === "invoice" && !inv.isDraft) setActiveInvoice(inv) }}
                        >
                          <td className="px-3 py-2 text-xs text-neutral-600 font-mono">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <a
                              href={getZohoBooksUrl(inv.documentType === "salesorder" ? "salesorders" : inv.documentType === "estimate" ? "estimates" : "invoices", inv.zohoId || inv.id)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className={`inline-flex items-center gap-2 text-xs font-bold hover:underline transition-colors ${docTheme.link}`}
                            >
                              <span className={`rounded border px-1.5 py-0.5 text-[9px] no-underline ${docTheme.badge}`}>{docTheme.label}</span>
                              #{inv.documentNumber || inv.invoiceNumber || inv.zohoId?.slice(-6) || "—"}
                            </a>
                          </td>
                          <td className="px-3 py-2 text-xs font-medium text-white max-w-[200px] truncate uppercase">
                            {inv.accountName || "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">
                            {phoneNumber ? (
                              <a href={`tel:${phoneNumber}`} onClick={e => e.stopPropagation()} className="text-indigo-400 hover:text-indigo-300 hover:underline">{phoneNumber}</a>
                            ) : <span className="text-neutral-600">—</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">
                            {new Date(inv.issueDate).toLocaleDateString("en-US", { day: "numeric", month: "short" })}
                          </td>
                          <td className="px-3 py-2 text-xs font-medium text-neutral-200 text-right tabular-nums">
                            {fmt(inv.amount)}
                          </td>
                          <td className="px-3 py-2 text-xs text-neutral-400 text-right tabular-nums" title={inv.usedFallbackCost ? 'Estimated — no real cost data on line items' : ''}>
                            {inv.usedFallbackCost && <span className="text-amber-400 mr-1" title="Estimated cost — needs real data">⚠</span>}
                            {fmt(inv.deadCost)}
                          </td>
                          <td className="px-3 py-2 text-xs font-medium text-right tabular-nums" style={{ color: (inv.profit || 0) >= 0 ? "#34d399" : "#f87171" }}>
                            {fmt(inv.profit)}
                          </td>
                          <td className="px-3 py-2 text-xs text-neutral-300 text-right tabular-nums font-mono">
                            {markup}x
                          </td>
                          <td className="px-3 py-2 text-xs text-right tabular-nums font-mono" style={{ color: invVigRate === 1.0 ? '#60a5fa' : invVigRate > 1.3 ? '#f87171' : '#a3a3a3' }}>
                            {invVigRate.toFixed(1)}x
                          </td>
                          <td className="px-3 py-2 text-xs font-medium text-violet-400 text-right tabular-nums">
                            {fmt(inv.commission?.total || 0)}
                          </td>
                          <td className={`px-3 py-2 text-xs text-right tabular-nums font-mono ${daysOld > 275 ? 'text-red-400 font-bold' : daysOld > 90 ? 'text-amber-400' : 'text-neutral-400'}`}>
                            {daysOld}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              inv.isPaid
                                ? "bg-emerald-950/40 text-emerald-400 border border-emerald-500/20"
                                : inv.isDraft ? "bg-neutral-800 text-neutral-300 border border-neutral-600"
                                : "bg-amber-950/40 text-amber-400 border border-amber-500/20"
                            }`}>
                              {inv.isDraft ? "Invoice · Draft" : inv.documentType === "salesorder" ? `SO · ${inv.status}` : inv.documentType === "estimate" ? `Estimate · ${inv.status}` : inv.isPaid ? "Paid" : "Unpaid"}
                            </span>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                    {visibleDocuments.length > 0 && (
                      <tfoot className="sticky bottom-0" style={{ background: 'var(--surface, #18181b)' }}>
                        <tr className="border-t-2" style={{ borderColor: "var(--border, #333)" }}>
                          <td colSpan={5} className="px-3 py-3 text-xs font-bold uppercase tracking-wider text-neutral-400">
                            Visible Totals ({visibleTotals.count} documents)
                          </td>
                          <td className="px-3 py-3 text-sm font-bold text-white text-right tabular-nums">{fmt(visibleTotals.sales)}</td>
                          <td className="px-3 py-3 text-sm font-bold text-neutral-300 text-right tabular-nums">{fmt(visibleTotals.deadCost)}</td>
                          <td className="px-3 py-3 text-sm font-bold text-right tabular-nums" style={{ color: "#34d399" }}>{fmt(visibleTotals.profit)}</td>
                          <td className="px-3 py-3 text-sm font-bold text-neutral-300 text-right tabular-nums font-mono">{visibleTotals.markup.toFixed(2)}x</td>
                          <td className="px-3 py-3"></td>
                          <td className="px-3 py-3 text-sm font-bold text-violet-400 text-right tabular-nums">{fmt(visibleTotals.commission)}</td>
                          <td className="px-3 py-3"></td>
                          <td className="px-3 py-3 text-center">
                            <span className="text-[10px] text-neutral-500">{visibleTotals.paidCount}P / {visibleTotals.unpaidCount}U</span>
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {activeInvoice && (
        <InvoiceDetailsModal
          invoice={activeInvoice}
          onClose={() => setActiveInvoice(null)}
        />
      )}

      <style jsx global>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { background: white !important; color: black !important; }
          table { border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 4px 8px; }
          .sticky { position: relative; }
        }
      `}</style>
    </div>
  )
}
