"use client"

import { prepareInAppCall } from "@/lib/internal-phone"
import { CollectionOverview } from "@/components/CollectionOverview"
import { CollectionCardStatus } from "@/components/CollectionCardStatus"
import styles from './collections.module.css'
import { publishCommunicationContext } from '@/lib/communication-context'
import Link from 'next/link'

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { 
  FiDollarSign, FiPhoneCall, FiClock, FiAlertCircle, FiSearch, 
  FiRefreshCw, FiUser, FiCreditCard, FiTruck, FiFileText, FiFilter
} from "react-icons/fi"
import { CollectionsModal, Invoice } from "@/components/CollectionsModal"
import { toast } from "react-hot-toast"
import { sessionGet, sessionSet, TTL } from "@/lib/dataCache"
import { UpdateBanner } from '@/lib/useStaleCheck'
import { PeriodSelector, isInPeriod, type PeriodValue } from "@/components/PeriodSelector"
import { useZoho } from "@/components/ZohoProvider"
import { isAdminRole } from "@/lib/roles"

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0)
}

export default function CollectionsPage() {
  const { zohoContext: currentUser } = useZoho()
  const [managerScope, setManagerScope] = useState(false)
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)
  const canViewAllReps = isAdminRole(currentUser?.role) || managerScope
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [dataSig, setDataSig] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const userKey = currentUser?.id || currentUser?.email || ""
  const [search, setSearch] = useState("")
  const [selectedRep, setSelectedRep] = useState<string>("all")
  const [sortBy, setSortBy] = useState("days_desc")
  const [collPeriod, setCollPeriod] = useState<PeriodValue>("all")
  const [collCustomStart, setCollCustomStart] = useState("")
  const [collCustomEnd, setCollCustomEnd] = useState("")
  
  // Modal state
  const [activeModal, setActiveModal] = useState<{
    mode: 'call' | 'card' | 'return' | 'campaign' | null;
    invoice: Invoice | null;
  }>({ mode: null, invoice: null })

  useEffect(() => {
    if (!dataSig || !userKey) return
    let active = true
    const version = requestVersion.current
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/get-collections?checkOnly=true', { signal: controller.signal, cache: 'no-store' })
        const data = await res.json()
        if (active && version === requestVersion.current && res.ok && data.success && data.checkOnly && typeof data.dataSignature === 'string') {
          setUpdateAvailable(data.dataSignature !== dataSig)
        }
      } catch { /* A failed check is not evidence of changed data. */ }
    }, 2000)
    return () => { active = false; clearTimeout(timer); controller.abort() }
  }, [dataSig, userKey])

  const fetchCollections = useCallback(async (force = false) => {
    if (!currentUser?.id && !currentUser?.email) return
    const version = ++requestVersion.current
    setDataSig(null)
    setUpdateAvailable(false)
    const cacheKey = `collections-v8-${userKey}`
    const cached = !force && currentUser
      ? sessionGet<{ invoices: Invoice[]; canViewCompanyCollections: boolean; dataSignature: string }>(cacheKey, TTL.TEN_MIN)
      : null
    if (cached && Array.isArray(cached.invoices) && typeof cached.dataSignature === 'string') {
      setInvoices(cached.invoices)
      setManagerScope(cached.canViewCompanyCollections === true)
      setDataSig(cached.dataSignature)
      setLoading(false)
      return
    }
    // First load with no data: full spinner. Subsequent: subtle refresh
    if (invoices.length === 0) setLoading(true)
    try {
      const emailParam = currentUser?.email ? `?email=${encodeURIComponent(currentUser.email)}` : ''
      const res = await fetch(`/api/get-collections${emailParam}`)
      const data = await res.json()
      if (version !== requestVersion.current) return
      if (res.ok && data.success && Array.isArray(data.invoices)) {
        setManagerScope(data.canViewCompanyCollections === true)
        setInvoices(data.invoices)
        sessionSet(cacheKey, { invoices: data.invoices, canViewCompanyCollections: data.canViewCompanyCollections === true, dataSignature: data.dataSignature })
        setDataSig(typeof data.dataSignature === 'string' ? data.dataSignature : null)
        setUpdateAvailable(false)
      } else {
        toast.error(data.error || "Failed to load collections")
      }
    } catch (e: any) {
      if (version !== requestVersion.current) return
      console.error("Collections fetch error:", e)
      toast.error("Failed to connect to collections service")
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }, [userKey, currentUser?.email])

  useEffect(() => {
    fetchCollections()
    return () => { requestVersion.current++ }
  }, [fetchCollections])

  // Extract unique sales reps for filter dropdown
  const salesReps = useMemo(() => {
    const set = new Set<string>()
    invoices.forEach(inv => {
      if (inv.salesperson_name) set.add(inv.salesperson_name)
    })
    return Array.from(set).sort()
  }, [invoices])

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    const filtered = invoices.filter(inv => {
      const matchesSearch = 
        !search ||
        inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
        inv.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        inv.salesperson_name?.toLowerCase().includes(search.toLowerCase()) ||
        inv.customer_contacts?.some(contact =>
          contact.name?.toLowerCase().includes(search.toLowerCase()) ||
          contact.phone?.includes(search)
        )
      
      const matchesRep = 
        selectedRep === "all" || 
        inv.salesperson_name === selectedRep

      const matchesPeriod = collPeriod === "all" || isInPeriod(inv.due_date, collPeriod, collCustomStart, collCustomEnd)

      return matchesSearch && matchesRep && matchesPeriod
    })

    return filtered.sort((a, b) => {
      if (sortBy === "balance_desc") return (b.balance || 0) - (a.balance || 0)
      if (sortBy === "balance_asc") return (a.balance || 0) - (b.balance || 0)
      if (sortBy === "due_asc") return new Date(a.due_date || "9999-12-31").getTime() - new Date(b.due_date || "9999-12-31").getTime()
      if (sortBy === "customer_asc") return (a.customer_name || "").localeCompare(b.customer_name || "")
      return (b.days_overdue || 0) - (a.days_overdue || 0)
    })
  }, [invoices, search, selectedRep, collPeriod, collCustomStart, collCustomEnd, sortBy])

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalBalance = filteredInvoices.reduce((sum, i) => sum + (i.balance || 0), 0)
    const over90Balance = filteredInvoices
      .filter(i => (i.days_overdue || 0) >= 90)
      .reduce((sum, i) => sum + (i.balance || 0), 0)
    
    return {
      count: filteredInvoices.length,
      accountCount: new Set(filteredInvoices.map(invoice => invoice.customer_id).filter(Boolean)).size,
      totalBalance,
      over90Balance,
      avgOverdue: filteredInvoices.length > 0 
        ? Math.round(filteredInvoices.reduce((sum, i) => sum + (i.days_overdue || 0), 0) / filteredInvoices.length)
        : 0
    }
  }, [filteredInvoices])

  const toggleInvoice = (invoice: Invoice) => {
    setExpandedInvoice(current => current === invoice.id ? null : invoice.id)
    publishCommunicationContext(expandedInvoice === invoice.id ? null : { kind: 'Invoice', recordId: invoice.id, accountId: invoice.account_id, title: `${invoice.customer_name} · Invoice #${invoice.invoice_number}` })
  }

  return (
    <div className={`page-content ${styles.page}`}>

      {/* ─── Header ────────────────────────────────────────── */}
      <div className={`page-header ${styles.header}`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center">
            <FiPhoneCall className="text-red-400" size={17} />
          </div>
          <div>
            <h1 className="page-title">Collections & Aging</h1>
            <p className="page-subtitle">Track overdue invoices, log calls, run payments & manage arrangements</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/collections/stats" className="td-btn td-btn-sm">Collection stats</Link>
          <button
            onClick={() => fetchCollections(true)}
            disabled={loading}
            className="td-btn td-btn-ghost td-btn-sm"
            title="Refresh"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} size={14} />
          </button>
          <button
            onClick={() => setActiveModal({ mode: 'campaign', invoice: null })}
            disabled={filteredInvoices.length === 0}
            className="td-btn td-btn-sm bg-gradient-to-r from-red-600 to-amber-600 text-white border-transparent hover:opacity-90 disabled:opacity-50 shadow-lg shadow-red-900/20"
          >
            <FiPhoneCall size={13} />
            Call Campaign ({filteredInvoices.length})
          </button>
        </div>
      </div>

      {/* ─── Body ──────────────────────────────────────────── */}
      <div className={`page-body animate-fade-in space-y-4 ${styles.body}`}>

        <UpdateBanner show={updateAvailable} onUpdate={() => { setUpdateAvailable(false); fetchCollections(true) }} accentColor="red" label="Collections data updated" />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Total Overdue", value: fmt(metrics.totalBalance), sub: `${metrics.count} invoices${collPeriod !== 'all' ? ' in period' : ' pending'}`, icon: FiDollarSign, iconColor: "text-red-400", accent: "border-red-500/20" },
            { label: "90+ Days Overdue", value: fmt(metrics.over90Balance), sub: "Critical attention required", icon: FiAlertCircle, iconColor: "text-amber-400", accent: "border-amber-500/20", valueColor: "text-amber-400" },
            { label: "Avg Overdue Days", value: `${metrics.avgOverdue} Days`, sub: "Across all open accounts", icon: FiClock, iconColor: "text-blue-400", accent: "border-blue-500/20" },
            { label: "Open Accounts", value: String(metrics.accountCount), sub: "Unique active collection targets", icon: FiUser, iconColor: "text-emerald-400", accent: "border-emerald-500/20" },
          ].map(({ label, value, sub, icon: Icon, iconColor, accent, valueColor }) => (
            <div key={label} className={`glass-panel p-4 rounded-2xl border ${accent} space-y-1`}>
              <div className="flex items-center justify-between text-neutral-500 text-[10px] font-bold uppercase tracking-wider">
                <span>{label}</span>
                <Icon className={iconColor} size={15} />
              </div>
              <div className={`text-xl font-black ${valueColor || "text-white"}`}>{value}</div>
              <div className="text-[11px] text-neutral-600">{sub}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className={styles.filters}>
          <div className="text-xs font-semibold text-neutral-300">Filter overdue invoices by due date</div>
          {/* Period Filter */}
          <PeriodSelector
            value={collPeriod}
            onChange={setCollPeriod}
            options={["this_month", "last_month", "this_quarter", "this_year", "all"]}
            accentColor="red"
            customStart={collCustomStart}
            customEnd={collCustomEnd}
            onCustomStartChange={setCollCustomStart}
            onCustomEndChange={setCollCustomEnd}
          />
          <div className={styles.filterFields}>
            <div className="relative min-w-0 flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search collections"
              placeholder="Invoice, account, rep or contact…"
              className="td-input pl-9"
            />
          </div>
          {canViewAllReps && <div className="flex items-center gap-2">
            <FiFilter className="text-neutral-500 shrink-0" size={14} />
            <select
              aria-label="Sales representative"
              value={selectedRep}
              onChange={e => setSelectedRep(e.target.value)}
              className="td-select"
            >
              <option value="all">All Sales Representatives</option>
              {salesReps.map(rep => (
                <option key={rep} value={rep}>{rep}</option>
              ))}
            </select>
          </div>}
          <select value={sortBy} onChange={event => setSortBy(event.target.value)} className="td-select" aria-label="Sort collections">
            <option value="days_desc">Most Overdue</option>
            <option value="balance_desc">Highest Balance</option>
            <option value="balance_asc">Lowest Balance</option>
            <option value="due_asc">Due Date</option>
            <option value="customer_asc">Customer A–Z</option>
          </select>
        </div>
        </div>

        <div className={styles.queueHeading}><div><h2>Collection work queue</h2><p>{filteredInvoices.length} invoices · Select a row for account, order, shipping and payment details</p></div><span>{fmt(metrics.totalBalance)} outstanding</span></div>
        {/* Invoices Table */}
        <div className={`td-table-wrapper relative ${styles.tableWrap}`}>
          {loading && invoices.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <FiRefreshCw className="animate-spin mx-auto text-red-500" size={28} />
              <p className="text-sm text-neutral-400">Loading collections and overdue invoice records...</p>
            </div>
          ) : filteredInvoices.length === 0 && !loading ? (
            <div className="p-12 text-center space-y-2">
              <FiAlertCircle className="mx-auto text-neutral-700" size={32} />
              <p className="text-sm font-semibold text-neutral-400">No overdue invoices found</p>
              <p className="text-xs text-neutral-600">All accounts are current, or adjust your search filters.</p>
            </div>
          ) : (
            <table className={`td-table ${styles.table}`}>
              <thead>
                <tr>
                  <th className="td-th">Account / invoice</th>
                  <th className="td-th">Contacts</th>
                  <th className="td-th">Timing</th>
                  <th className="td-th text-right">Balance</th>
                  <th className="td-th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map(inv => {
                  const days = inv.days_overdue || 0
                  const isSevere = days >= 90
                  return (
                    <React.Fragment key={inv.id}>
                    <tr data-expanded={expandedInvoice === inv.id} onClick={() => toggleInvoice(inv)} className={styles.invoiceRow}>
                      <td className={`td-td ${styles.identity}`}>
                        <button aria-expanded={expandedInvoice === inv.id} aria-controls={`overview-${inv.id}`} onClick={e => { e.stopPropagation(); toggleInvoice(inv) }} className={styles.accountButton}>
                          <span className="text-cyan-300 text-xs"><span aria-hidden="true">{expandedInvoice === inv.id ? '▾' : '▸'}</span> Invoice #{inv.invoice_number}</span>
                          <strong>{inv.customer_name}</strong>
                        </button>
                        <div className={styles.rep}>Rep · {inv.salesperson_name || 'Unassigned'}</div>
                      </td>
                      <td className={`td-td ${styles.contacts}`} data-label="Contacts">
                        {inv.customer_contacts?.length ? <div className="flex flex-col gap-2">{inv.customer_contacts.map(contact => <button type="button" key={contact.id} className={styles.contact} title={`Call ${contact.name}${contact.isPrimary ? ' (Primary)' : ''}`} onClick={event => { event.stopPropagation(); prepareInAppCall(contact.phone_href || contact.phone, { accountId: inv.account_id, accountName: inv.customer_name, contactName: contact.name }) }}><span>{contact.name}</span><span>{contact.phone}</span></button>)}</div> : <span className="text-neutral-500">No saved phone</span>}
                      </td>
                      <td className={`td-td ${styles.timing}`} data-label="Timing">
                        <span className={`status-pill ${isSevere ? 'status-pill-red' : days >= 30 ? 'status-pill-amber' : 'status-pill-blue'}`}>{days} days overdue</span>
                        <div>Due {inv.due_date || '—'}</div>
                        <div>Last call · {(inv as any).last_called_at || (inv as any).lastCalledAt ? new Date((inv as any).last_called_at || (inv as any).lastCalledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never'}</div>
                      </td>
                      <td className={`td-td ${styles.balance}`} data-label="Balance">{fmt(inv.balance)}</td>
                      <td className={`td-td ${styles.actions}`} onClick={e => e.stopPropagation()}>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <CollectionCardStatus accountId={inv.account_id} customerName={inv.customer_name} value={inv.card_on_file}
                              onSaved={value => {
                                setInvoices(rows => rows.map(row => row.account_id === inv.account_id ? { ...row, card_on_file: value } : row))
                                sessionSet(`collections-v8-${userKey}`, null)
                                setDataSig(null)
                              }} />
                          <button
                            onClick={() => setActiveModal({ mode: 'call', invoice: inv })}
                            className="td-btn td-btn-sm bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600 hover:text-white border-emerald-600/20"
                            title="Log Call"
                          >
                            <FiPhoneCall size={12} /> Log Call
                          </button>
                          <button
                            onClick={() => setActiveModal({ mode: 'card', invoice: inv })}
                            className="td-btn td-btn-sm bg-purple-600/15 text-purple-400 hover:bg-purple-600 hover:text-white border-purple-600/20"
                            title="Run Card"
                          >
                            <FiCreditCard size={12} /> Take payment
                          </button>
                          <button
                            onClick={() => setActiveModal({ mode: 'return', invoice: inv })}
                            className="td-btn td-btn-sm bg-red-600/15 text-red-400 hover:bg-red-600 hover:text-white border-red-600/20"
                            title="Return Tag"
                          >
                            <FiTruck size={12} /> Return
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedInvoice === inv.id && <tr className={styles.overviewRow} id={`overview-${inv.id}`}><td colSpan={5} className="p-0"><CollectionOverview invoice={inv} /></td></tr>}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Collections Modal */}
      {activeModal.mode && (
        <CollectionsModal
          isOpen={true}
          mode={activeModal.mode}
          invoice={activeModal.invoice}
          campaignInvoices={filteredInvoices}
          onClose={() => setActiveModal({ mode: null, invoice: null })}
          onSuccess={() => {
            fetchCollections()
            setActiveModal({ mode: null, invoice: null })
          }}
        />
      )}
    </div>
  )
}
