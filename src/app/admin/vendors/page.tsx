"use client"
import { useState, useEffect } from "react"
import { FiUsers, FiEdit2, FiX, FiSave } from "react-icons/fi"

export default function VendorsPage() {
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
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
        alert(`Vendor ${isNew ? 'created' : 'updated'} successfully!`)
        setSelectedVendor(null)
        fetchVendors()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      console.error(error)
      alert('Error saving vendor')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col text-neutral-100 font-sans h-full relative">
      <main className="flex-1 p-4 sm:p-6 space-y-6 overflow-y-auto safe-bottom">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <FiUsers className="text-neutral-400" /> Vendor Management
          </h1>
          <button 
            onClick={() => setSelectedVendor({ contactName: '', companyName: '', email: '', phone: '', billingAddress: {}, shippingAddress: {} })}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Create Vendor
          </button>
        </header>

        {loading ? (
          <p className="text-neutral-400">Loading vendors...</p>
        ) : (
          <div className="bg-[#0f1013] rounded-xl border border-white/5 overflow-hidden">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-neutral-900/50 text-neutral-400 border-b border-white/5 uppercase text-[11px] tracking-wider font-semibold">
                <tr>
                  <th className="px-4 py-3">Vendor Name</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {vendors.map(v => (
                  <tr key={v.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 font-medium">{v.contactName}</td>
                    <td className="px-4 py-3 text-neutral-400">{v.companyName}</td>
                    <td className="px-4 py-3 text-neutral-400">{v.email}</td>
                    <td className="px-4 py-3 text-neutral-400">{v.phone}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setSelectedVendor(v)} className="p-2 hover:bg-white/10 rounded-lg text-emerald-500 transition-colors">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1b20] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h2 className="text-lg font-bold text-white">
                {selectedVendor.id ? 'Edit Vendor' : 'New Vendor'}
              </h2>
              <button onClick={() => setSelectedVendor(null)} className="p-2 text-neutral-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
                <FiX size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="vendor-form" onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-400 mb-1">Contact Name</label>
                    <input type="text" required value={selectedVendor.contactName || ''} onChange={e => setSelectedVendor({...selectedVendor, contactName: e.target.value})} className="w-full bg-[#0f1013] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-400 mb-1">Company Name</label>
                    <input type="text" value={selectedVendor.companyName || ''} onChange={e => setSelectedVendor({...selectedVendor, companyName: e.target.value})} className="w-full bg-[#0f1013] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-400 mb-1">Email</label>
                    <input type="email" value={selectedVendor.email || ''} onChange={e => setSelectedVendor({...selectedVendor, email: e.target.value})} className="w-full bg-[#0f1013] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-400 mb-1">Phone</label>
                    <input type="text" value={selectedVendor.phone || ''} onChange={e => setSelectedVendor({...selectedVendor, phone: e.target.value})} className="w-full bg-[#0f1013] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
                  </div>
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-neutral-900/50">
              <button type="button" onClick={() => setSelectedVendor(null)} className="px-4 py-2 font-medium text-neutral-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button type="submit" form="vendor-form" disabled={saving} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
                <FiSave /> {saving ? 'Saving...' : 'Save Vendor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
