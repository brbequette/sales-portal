"use client"

import { useState, useEffect } from "react"
import { FiUsers, FiEdit2, FiX, FiSave, FiRefreshCw, FiTruck } from "react-icons/fi"
import { toast } from 'react-hot-toast';

export default function VendorsPage() {
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selectedVendor, setSelectedVendor] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  
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

  return (
    <div className="flex flex-col text-neutral-100 font-sans h-full relative">
      <main className="flex-1 p-6 space-y-6 overflow-y-auto safe-bottom">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <FiTruck className="text-emerald-500" /> VENDOR MANAGEMENT
          </h1>
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
        </header>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-neutral-400 font-bold uppercase tracking-wider text-sm">Loading vendors...</p>
          </div>
        ) : (
          <div className="glass-panel rounded-xl border border-white/10 overflow-hidden shadow-xl">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-black/20 text-neutral-400 border-b border-white/10 uppercase text-xs font-black tracking-wider">
                <tr>
                  <th className="px-6 py-4">Vendor Name</th>
                  <th className="px-6 py-4">Company</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Phone</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {vendors.map(v => (
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
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Editor Modal */}
      {selectedVendor && (
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
      )}
    </div>
  )
}

