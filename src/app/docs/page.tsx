'use client'

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useZoho } from '@/components/ZohoProvider'
import { usePreferences } from '@/components/PreferencesProvider'
import { 
  FiSearch, FiFilter, FiFileText, FiDownload, FiX, 
  FiChevronDown, FiChevronUp, FiRefreshCw, FiExternalLink, 
  FiActivity, FiDollarSign, FiPackage, FiCalendar, FiUser,
  FiTruck, FiCreditCard
} from 'react-icons/fi'
import { UpdateBanner } from '@/lib/useStaleCheck'
import { getZohoBooksUrl } from '@/lib/zoho-urls'
import { InvoiceFinancialBreakdown } from '@/components/InvoiceFinancialBreakdown'
import { extractCcFees, extractAdditionalCosts } from '@/lib/custom-field-extractor'
import { EntityPopout } from '@/components/EntityPopout'

type UnifiedDoc = {
  id: string
  zohoId: string | null
  type: 'invoice' | 'quote' | 'salesorder'
  docNumber: string
  customerName: string
  repName: string
  date: string
  amount: number
  status: string
  items: any
  documentUrl: string | null
}

type SortField = 'date' | 'amount' | 'number' | 'customer' | 'status'
type SortDir = 'asc' | 'desc'

function SalesDocsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { zohoContext: user } = useZoho()
  
  const [docs, setDocs] = useState<UnifiedDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [total, setTotal] = useState(0)
  const [totalPages, setPages] = useState(1)
  
  // Stats
  const [stats, setStats] = useState({ invoices: 0, quotes: 0, salesOrders: 0 })

  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [dataSig, setDataSig] = useState<string | null>(null)

  const checkForUpdates = async (currentSig: string, apiUrl: string) => {
    try {
      const separator = apiUrl.includes('?') ? '&' : '?'
      const res = await fetch(`${apiUrl}${separator}checkOnly=true`)
      const data = await res.json()
      if (!data.checkOnly) return
      const remoteSig = `${data.count}|${data.latestUpdatedAt ?? ''}`
      if (remoteSig !== currentSig) setUpdateAvailable(true)
    } catch {}
  }

  // Filters
  const [q, setQ] = useState(searchParams.get('q') || '')
  const [searchQuery, setSearchQuery] = useState(q)
  const [type, setType] = useState(searchParams.get('type') || 'all')
  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [repId, setRepId] = useState(searchParams.get('repId') || '')
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || '')
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || '')
  const [amountMin, setAmountMin] = useState(searchParams.get('amountMin') || '')
  const [amountMax, setAmountMax] = useState(searchParams.get('amountMax') || '')
  const [sort, setSort] = useState<SortField>((searchParams.get('sort') as SortField) || 'date')
  const [dir, setDir] = useState<SortDir>((searchParams.get('dir') as SortDir) || 'desc')
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10))

  // Users for rep filter
  const [users, setUsers] = useState<any[]>([])

  // Side panel state
  const [selectedDoc, setSelectedDoc] = useState<UnifiedDoc | null>(null)
  const [detailData, setDetailData] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Fetch full invoice details when a doc is selected
  const fetchDocDetail = useCallback(async (doc: UnifiedDoc) => {
    if (!doc.zohoId) return
    setDetailLoading(true)
    setDetailData(null)
    try {
      const docType = doc.type === 'invoice' ? 'invoice' : doc.type === 'salesorder' ? 'salesorder' : 'estimate'
      const res = await fetch(`/api/get-invoice-details?zohoId=${doc.zohoId}&type=${docType}`)
      const data = await res.json()
      if (data.success !== false) {
        setDetailData(data)
      }
    } catch (e) {
      console.error('Failed to fetch doc details', e)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedDoc) fetchDocDetail(selectedDoc)
    else setDetailData(null)
  }, [selectedDoc, fetchDocDetail])

  const isAdmin = (user?.role ?? '').toLowerCase().includes('admin') || (user?.role ?? '').toLowerCase().includes('manager')

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/get-users')
        .then(res => res.json())
        .then(data => {
          if (data.users) setUsers(data.users)
        })
        .catch(console.error)
    }
  }, [isAdmin])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== q) {
        setQ(searchQuery)
        setPage(1)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [searchQuery, q])

  const fetchDocs = useCallback(async () => {
    try {
      if (docs.length === 0) setLoading(true)
      else setRefreshing(true)
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (type !== 'all') params.set('type', type)
      if (status) params.set('status', status)
      if (repId) params.set('repId', repId)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (amountMin) params.set('amountMin', amountMin)
      if (amountMax) params.set('amountMax', amountMax)
      params.set('sort', sort)
      params.set('dir', dir)
      params.set('page', page.toString())
      if (user?.id) params.set('callerDbId', user.id)
      if (user?.role) params.set('callerRole', user.role)

      // Sync URL
      const currentUrlParams = new URLSearchParams(searchParams.toString())
      Array.from(params.entries()).forEach(([k, v]) => {
        if (!['callerDbId', 'callerRole'].includes(k)) currentUrlParams.set(k, v)
      })
      router.replace(`?${currentUrlParams.toString()}`, { scroll: false })

      const res = await fetch(`/api/search-docs?${params.toString()}`)
      const data = await res.json()
      
      if (data.success) {
        setDocs(data.docs)
        setTotal(data.total)
        setPages(data.totalPages)
        
        // Calculate basic stats for current view if page 1
        if (page === 1) {
          let iCount = 0, qCount = 0, sCount = 0
          data.docs.forEach((d: UnifiedDoc) => {
            if (d.type === 'invoice') iCount++
            if (d.type === 'quote') qCount++
            if (d.type === 'salesorder') sCount++
          })
          setStats({ invoices: iCount, quotes: qCount, salesOrders: sCount })
        }
        
        const sig = `${data.docs.length}|${data.docs[0]?.date ?? ''}`
        setDataSig(sig)
        setUpdateAvailable(false)
        setTimeout(() => checkForUpdates(sig, '/api/get-documents'), 2000)
      }
    } catch (error) {
      console.error('Failed to fetch docs', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [q, type, status, repId, dateFrom, dateTo, amountMin, amountMax, sort, dir, page, user, router, searchParams])

  useEffect(() => {
    if (user?.email) {
      fetchDocs()
    }
  }, [fetchDocs, user?.email])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedDoc(null)
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  const handleSort = (field: SortField) => {
    if (sort === field) {
      setDir(dir === 'asc' ? 'desc' : 'asc')
    } else {
      setSort(field)
      setDir('desc')
    }
    setPage(1)
  }

  const resetFilters = () => {
    setSearchQuery('')
    setQ('')
    setType('all')
    setStatus('')
    setRepId('')
    setDateFrom('')
    setDateTo('')
    setAmountMin('')
    setAmountMax('')
    setPage(1)
  }

  const exportCSV = () => {
    if (!docs.length) return
    const headers = ['Doc Number', 'Type', 'Customer', 'Rep', 'Date', 'Amount', 'Status']
    const rows = docs.map(d => [
      d.docNumber,
      d.type,
      `"${d.customerName.replace(/"/g, '""')}"`,
      `"${d.repName.replace(/"/g, '""')}"`,
      new Date(d.date).toLocaleDateString(),
      d.amount,
      d.status
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', 'sales_documents.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
  }

  const getDocumentUrl = (doc: UnifiedDoc) => {
    if (doc.documentUrl) return doc.documentUrl
    if (doc.zohoId) return getZohoBooksUrl(doc.type, doc.zohoId)
    return getDocumentPdfUrl(doc)
  }

  const getDocumentPdfUrl = (doc: UnifiedDoc, download = false) => {
    const pdfType = doc.type === 'salesorder' ? 'SalesOrder' : doc.type === 'quote' ? 'Quote' : 'Invoice'
    const params = new URLSearchParams({
      id: doc.zohoId || doc.id,
      type: pdfType,
    })
    if (download) params.set('download', 'true')
    return `/api/get-invoice-pdf?${params.toString()}`
  }

  const getStatusColor = (s: string) => {
    const sl = s.toLowerCase()
    if (sl.includes('paid') || sl.includes('accepted')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    if (sl.includes('sent') || sl.includes('pending')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    if (sl.includes('overdue')) return 'bg-red-500/20 text-red-400 border-red-500/30'
    if (sl.includes('void') || sl.includes('declined')) return 'bg-red-900/40 text-red-300 border-red-800'
    if (sl.includes('invoice')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    return 'bg-zinc-700/50 text-zinc-300 border-zinc-600'
  }

  const getTypeBadge = (t: string) => {
    if (t === 'invoice') return <span className="px-2 py-1 text-xs rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">Invoice</span>
    if (t === 'quote') return <span className="px-2 py-1 text-xs rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">Estimate</span>
    if (t === 'salesorder') return <span className="px-2 py-1 text-xs rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Sales Order</span>
    return null
  }

  return (
    <div className="page-content">

      {/* ─── Header ─────────────────────────────────── */}
      <UpdateBanner show={updateAvailable} onUpdate={() => { setUpdateAvailable(false); fetchDocs() }} accentColor="amber" label="Documents updated" />
      <div className="page-header mt-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center justify-center">
            <FiFileText className="text-orange-400" size={17} />
          </div>
          <div>
            <h1 className="page-title">Sales Documents</h1>
            <p className="page-subtitle">Search and manage invoices, estimates, and sales orders</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-4 px-5 py-2.5 glass-panel rounded-xl border border-white/10 text-xs">
            <div className="flex flex-col">
              <span className="text-neutral-500 uppercase font-semibold text-[10px]">Invoices</span>
              <span className="text-base font-bold text-blue-400">{stats.invoices}</span>
            </div>
            <div className="w-px bg-white/10" />
            <div className="flex flex-col">
              <span className="text-neutral-500 uppercase font-semibold text-[10px]">Estimates</span>
              <span className="text-base font-bold text-purple-400">{stats.quotes}</span>
            </div>
            <div className="w-px bg-white/10" />
            <div className="flex flex-col">
              <span className="text-neutral-500 uppercase font-semibold text-[10px]">Orders</span>
              <span className="text-base font-bold text-emerald-400">{stats.salesOrders}</span>
            </div>
          </div>
          <button
            onClick={exportCSV}
            className="td-btn td-btn-ghost td-btn-sm"
          >
            <FiDownload size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* ─── Body ───────────────────────────────────── */}
      <div className="page-body animate-fade-in space-y-4">

      {/* Filter Bar */}
      <div className="glass-panel-strong rounded-2xl p-4 mb-6 sticky top-4 z-20 shadow-xl border border-zinc-800/80 animate-slide-up" style={{animationDelay: '100ms'}}>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px] relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search by customer, doc #, or ID..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900/50 border border-zinc-700/50 text-white pl-10 pr-4 py-2.5 rounded-xl focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 transition-all placeholder:text-zinc-600"
            />
          </div>

          <div className="flex bg-zinc-900/50 p-1 rounded-xl border border-zinc-800">
            {['all', 'invoice', 'quote', 'salesorder'].map(t => (
              <button
                key={t}
                onClick={() => { setType(t); setPage(1) }}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${type === t ? 'bg-orange-500 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
              >
                {t === 'quote' ? 'Estimates' : t === 'salesorder' ? 'Orders' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <select 
            value={status} 
            onChange={e => { setStatus(e.target.value); setPage(1) }}
            className="bg-zinc-900/50 border border-zinc-700/50 text-zinc-200 px-4 py-2.5 rounded-xl focus:outline-none focus:border-orange-500/50 appearance-none min-w-[140px]"
          >
            <option value="">All Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Sent">Sent</option>
            <option value="Accepted">Accepted</option>
            <option value="Overdue">Overdue</option>
            <option value="Draft">Draft</option>
            <option value="Void">Void</option>
          </select>

          {isAdmin && (
            <select 
              value={repId} 
              onChange={e => { setRepId(e.target.value); setPage(1) }}
              className="bg-zinc-900/50 border border-zinc-700/50 text-zinc-200 px-4 py-2.5 rounded-xl focus:outline-none focus:border-orange-500/50 appearance-none min-w-[140px]"
            >
              <option value="">All Reps</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-700/50 rounded-xl px-3 py-1">
            <FiCalendar className="text-zinc-400" />
            <input type="date" value={dateFrom} onChange={e => {setDateFrom(e.target.value); setPage(1)}} className="bg-transparent text-sm text-zinc-300 outline-none [color-scheme:dark]" />
            <span className="text-zinc-500">-</span>
            <input type="date" value={dateTo} onChange={e => {setDateTo(e.target.value); setPage(1)}} className="bg-transparent text-sm text-zinc-300 outline-none [color-scheme:dark]" />
          </div>

          <button 
            onClick={resetFilters}
            className="p-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-all ml-auto"
            title="Reset Filters"
          >
            <FiRefreshCw />
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="flex-1 glass-panel rounded-2xl border border-zinc-800/60 overflow-hidden flex flex-col relative z-10 animate-slide-up" style={{animationDelay: '200ms'}}>
        <div className="overflow-x-auto">
          {refreshing && <div className="h-0.5 bg-orange-500/60 animate-pulse w-full rounded mb-1" />}
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/40 text-xs uppercase tracking-wider text-zinc-500">
                {[
                  { id: 'number', label: 'Doc #' },
                  { id: 'customer', label: 'Customer' },
                  { id: 'rep', label: 'Rep' },
                  { id: 'type', label: 'Type', sortable: false },
                  { id: 'date', label: 'Date' },
                  { id: 'amount', label: 'Amount' },
                  { id: 'status', label: 'Status' }
                ].map(col => (
                  <th 
                    key={col.id} 
                    className={`p-4 font-semibold ${col.sortable !== false ? 'cursor-pointer hover:text-zinc-300 transition-colors' : ''}`}
                    onClick={() => col.sortable !== false && handleSort(col.id as SortField)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {sort === col.id && (
                        dir === 'asc' ? <FiChevronUp className="text-orange-500" /> : <FiChevronDown className="text-orange-500" />
                      )}
                    </div>
                  </th>
                ))}
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-zinc-800/50 transition-opacity duration-200 ${refreshing ? 'opacity-50' : 'opacity-100'}`}>
              {loading && docs.length === 0 ? (
                Array(10).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="p-4"><div className="h-4 bg-zinc-800 rounded w-20"></div></td>
                    <td className="p-4"><div className="h-4 bg-zinc-800 rounded w-32"></div></td>
                    <td className="p-4"><div className="h-4 bg-zinc-800 rounded w-24"></div></td>
                    <td className="p-4"><div className="h-6 bg-zinc-800 rounded-full w-16"></div></td>
                    <td className="p-4"><div className="h-4 bg-zinc-800 rounded w-24"></div></td>
                    <td className="p-4"><div className="h-4 bg-zinc-800 rounded w-20"></div></td>
                    <td className="p-4"><div className="h-6 bg-zinc-800 rounded-full w-16"></div></td>
                    <td className="p-4"></td>
                  </tr>
                ))
              ) : docs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center text-zinc-500 space-y-4">
                      <div className="p-6 bg-zinc-900/50 rounded-full border border-zinc-800">
                        <FiSearch size={48} className="text-zinc-600" />
                      </div>
                      <p className="text-lg">No documents found matching your criteria</p>
                      <button onClick={resetFilters} className="text-orange-500 hover:text-orange-400 underline">Clear filters</button>
                    </div>
                  </td>
                </tr>
              ) : (
                docs.map(doc => (
                  <tr 
                    key={doc.id} 
                    onClick={() => setSelectedDoc(doc)}
                    className="group hover:bg-zinc-800/30 transition-colors cursor-pointer"
                  >
                    <td className="p-4 font-mono text-sm text-zinc-300 group-hover:text-white transition-colors">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="hover:text-orange-400 cursor-pointer">{doc.docNumber}</span>
                        <a
                          href={getDocumentUrl(doc)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={event => event.stopPropagation()}
                          className="text-zinc-600 hover:text-orange-400 transition-colors"
                          title="Open in Zoho Books"
                        >
                          <FiExternalLink size={12} className="shrink-0" aria-hidden="true" />
                        </a>
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-zinc-200">{doc.customerName}</div>
                    </td>
                    <td className="p-4 text-sm text-zinc-400">
                      <div className="flex items-center gap-2">
                        <FiUser className="text-zinc-600" />
                        {doc.repName}
                      </div>
                    </td>
                    <td className="p-4">{getTypeBadge(doc.type)}</td>
                    <td className="p-4 text-sm text-zinc-400">{new Date(doc.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                    <td className="p-4 font-mono font-medium text-zinc-200">{formatCurrency(doc.amount)}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(doc.status)}`}>
                        {doc.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a
                          href={getDocumentUrl(doc)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={event => event.stopPropagation()}
                          className="p-2 text-zinc-400 hover:text-orange-400 hover:bg-zinc-700 rounded-lg transition-colors"
                          title="Open document"
                        >
                          <FiExternalLink />
                        </a>
                        <a 
                          href={getDocumentPdfUrl(doc, true)}
                          onClick={e => e.stopPropagation()}
                          className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
                          title="Download PDF"
                        >
                          <FiDownload />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="mt-auto border-t border-zinc-800 bg-zinc-900/30 p-4 flex items-center justify-between">
            <span className="text-sm text-zinc-500">
              Showing {(page - 1) * 50 + 1} to {Math.min(page * 50, total)} of {total}
            </span>
            <div className="flex gap-1">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded-md text-sm bg-zinc-800 text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-700"
              >
                Prev
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                // simple pagination logic for display
                let pageNum = page - 2 + i
                if (page < 3) pageNum = i + 1
                if (page > totalPages - 2) pageNum = totalPages - 4 + i
                if (pageNum > 0 && pageNum <= totalPages) {
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`px-3 py-1 rounded-md text-sm ${page === pageNum ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                    >
                      {pageNum}
                    </button>
                  )
                }
                return null
              })}
              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded-md text-sm bg-zinc-800 text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Entity Popout */}
      {selectedDoc && (
        <EntityPopout
          entityType={selectedDoc.type === 'quote' ? 'estimate' : selectedDoc.type}
          entityId={selectedDoc.zohoId || selectedDoc.id}
          entities={docs}
          currentIndex={docs.findIndex(d => d.id === selectedDoc.id)}
          onClose={() => setSelectedDoc(null)}
          onNavigate={(idx) => setSelectedDoc(docs[idx])}
          permissions={{ isAdmin, canViewFinancials: true, canEdit: isAdmin }}
        />
      )}
    </div>
  )
}

function SalesDocsFallback() {
  return <div className="p-8 text-zinc-400 flex justify-center items-center h-full">Loading documents view...</div>
}

export default function SalesDocs() {
  return (
    <Suspense fallback={<SalesDocsFallback />}>
      <SalesDocsInner />
    </Suspense>
  )
}
