"use client"

import { useState, useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import { FiEdit2, FiX, FiSave, FiRefreshCw, FiTruck, FiSearch, FiChevronUp, FiChevronDown } from "react-icons/fi"
import { toast } from 'react-hot-toast';

export default function VendorsPage() {
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selectedVendor, setSelectedVendor] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [contactFilter, setContactFilter] = useState("all")
  const [sort, setSort] = useState<{ key: "contactName" | "companyName" | "email" | "phone"; direction: "asc" | "desc" }>({
    key: "contactName",
    direction: "asc",
  })
  
  useEffect(() => {
    fetchVendors()
  }, [])

  const fetchVendors = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/vendors')
      const data = await res.json()
      if (data.success) {
        setVendors(data.vendors)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    try {
      setSyncing(true)
      const res = await fetch("/api/admin/vendors/sync", {
        method: "POST"
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Successfully synced ${data.upserted} vendors from CSV.`)
        fetchVendors()
      } else {
        toast.error(`Error syncing vendors: ${data.error}`)
      }
    } catch (err: any) {
      toast.error(`Error syncing vendors: ${err.message}`)
    } finally {
      setSyncing(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      const isNew = !selectedVendor.id
      const url = isNew ? '/api/admin/vendors' : `/api/admin/vendors/${selectedVendor.id}`
      const method = isNew ? 'POST' : 'PUT'
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedVendor)
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Vendor ${isNew ? 'created' : 'updated'} successfully!`)
        setSelectedVendor(null)
        fetchVendors()
      } else {
        toast.error('Error: ' + data.error)
      }
    } catch (error) {
      console.error(error)
      toast.error('Error saving vendor')
    } finally {
      setSaving(false)
    }
  }

  const visibleVendors = useMemo(() => {
    const query = search.trim().toLowerCase()
    return vendors
      .filter((vendor) => {
        if (contactFilter === "complete" && (!vendor.email || !vendor.phone)) return false
        if (contactFilter === "missing" && vendor.email && vendor.phone) return false
        if (!query) return true
        return [vendor.contactName, vendor.companyName, vendor.email, vendor.phone]
          .some((value) => String(value || "").toLowerCase().includes(query))
      })
      .sort((a, b) => {
        const left = String(a[sort.key] || "").toLowerCase()
        const right = String(b[sort.key] || "").toLowerCase()
        return left.localeCompare(right) * (sort.direction === "asc" ? 1 : -1)
      })
  }, [vendors, search, contactFilter, sort])

  const toggleSort = (key: typeof sort.key) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }))
  }

  const SortIcon = ({ column }: { column: typeof sort.key }) =>
    sort.key === column
      ? sort.direction === "asc" ? <FiChevronUp aria-hidden /> : <FiChevronDown aria-hidden />
      : null

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center">
            <FiTruck className="text-emerald-500" size={17} />
          </div>
          <div>
            <h1 className="page-title">Vendor Management</h1>
            <p className="page-subtitle">Manage vendors and sync from CSV</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-5 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50"
          >
            <FiRefreshCw className={syncing ? "animate-spin" : ""} />
            {syncing ? 'SYNCING...' : 'SYNC FROM CSV'}
          </button>
          <button 
            onClick={() => setSelectedVendor({ contactName: '', companyName: '', email: '', phone: '', billingAddress: {}, shippingAddress: {} })}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-lg font-bold transition-colors"
          >
            CREATE VENDOR
          </button>
        </div>
      </div>

      <div className="page-body">

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-neutral-400 font-bold uppercase tracking-wider text-sm">Loading vendors...</p>
          </div>
        ) : (
          <div className="glass-panel rounded-xl border border-white/10 overflow-hidden shadow-xl">
            <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="relative block w-full sm:max-w-md">
                <span className="sr-only">Search vendors</span>
                <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" aria-hidden />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, company, email, or phone..."
                  className="w-full rounded-lg border border-white/10 bg-black/30 py-2.5 pl-10 pr-4 text-sm text-white outline-none focus:border-emerald-500"
                />
              </label>
              <div className="flex items-center gap-3">
                <select
                  aria-label="Filter vendors by contact completeness"
                  value={contactFilter}
                  onChange={(event) => setContactFilter(event.target.value)}
                  className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                >
                  <option value="all">All vendors</option>
                  <option value="complete">Complete contact info</option>
                  <option value="missing">Missing contact info</option>
                </select>
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">{visibleVendors.length} results</span>
              </div>
            </div>
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-black/20 text-neutral-400 border-b border-white/10 uppercase text-xs font-black tracking-wider">
                <tr>
                  {([['contactName', 'Vendor Name'], ['companyName', 'Company'], ['email', 'Email'], ['phone', 'Phone']] as const).map(([key, label]) => (
                    <th key={key} className="px-6 py-4">
                      <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-white" aria-label={`Sort by ${label}`}>
                        {label}<SortIcon column={key} />
                      </button>
                    </th>
                  ))}
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {visibleVendors.map(v => (
                  <tr key={v.id} className="hover:bg-white/10 hover:shadow-lg transition-all duration-300 transition-colors">
                    <td className="px-6 py-4 font-bold text-white">{v.contactName || '--'}</td>
                    <td className="px-6 py-4 text-neutral-400 font-medium">{v.companyName || '--'}</td>
                    <td className="px-6 py-4 text-neutral-400 font-medium">{v.email || '--'}</td>
                    <td className="px-6 py-4 text-neutral-400 font-medium">{v.phone || '--'}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => setSelectedVendor(v)} className="p-2 hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 rounded-lg text-emerald-500 transition-colors">
                        <FiEdit2 />
                      </button>
                    </td>
                  </tr>
                ))}
                {visibleVendors.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-neutral-500">No vendors match the current search and filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {selectedVendor && typeof document !== "undefined" && createPortal((
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20/50 rounded-t-2xl">
              <h2 className="text-xl font-black text-white uppercase tracking-wider">
                {selectedVendor.id ? 'Edit Vendor' : 'New Vendor'}
              </h2>
              <button onClick={() => setSelectedVendor(null)} className="p-2 text-neutral-500 hover:text-white rounded-full hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 transition-colors">
                <FiX size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="vendor-form" onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-black text-neutral-400 uppercase tracking-wider mb-2">Contact Name</label>
                    <input type="text" required value={selectedVendor.contactName || ''} onChange={e => setSelectedVendor({...selectedVendor, contactName: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white font-medium focus:outline-none focus:border-emerald-500 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-neutral-400 uppercase tracking-wider mb-2">Company Name</label>
                    <input type="text" value={selectedVendor.companyName || ''} onChange={e => setSelectedVendor({...selectedVendor, companyName: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white font-medium focus:outline-none focus:border-emerald-500 transition-colors" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-black text-neutral-400 uppercase tracking-wider mb-2">Email</label>
                    <input type="email" value={selectedVendor.email || ''} onChange={e => setSelectedVendor({...selectedVendor, email: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white font-medium focus:outline-none focus:border-emerald-500 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-neutral-400 uppercase tracking-wider mb-2">Phone</label>
                    <input type="text" value={selectedVendor.phone || ''} onChange={e => setSelectedVendor({...selectedVendor, phone: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white font-medium focus:outline-none focus:border-emerald-500 transition-colors" />
                  </div>
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-black/20/50 rounded-b-2xl">
              <button type="button" onClick={() => setSelectedVendor(null)} className="px-5 py-2.5 font-bold text-neutral-400 hover:text-white transition-colors">
                CANCEL
              </button>
              <button type="submit" form="vendor-form" disabled={saving} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50">
                <FiSave /> {saving ? 'SAVING...' : 'SAVE VENDOR'}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  )
}

