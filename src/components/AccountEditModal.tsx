import { useState } from "react"
import { FiX, FiSave } from "react-icons/fi"

interface AccountEditModalProps {
  account: any
  onClose: () => void
  onSaved: () => void
}

export function AccountEditModal({ account, onClose, onSaved }: AccountEditModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: account?.name || "",
    industry: account?.industry || "",
    timeZone: account?.timeZone || "",
    tags: Array.isArray(account?.tags) ? account.tags.join(", ") : (account?.tags || ""),
    status: account?.status || "Open",
    billingStreet: account?.billingStreet || "",
    billingCity: account?.billingCity || "",
    billingState: account?.billingState || "",
    billingZip: account?.billingZip || "",
  })

  const handleSave = async () => {
    setLoading(true)
    try {
      const formattedTags = formData.tags.split(",").map((t: string) => t.trim()).filter(Boolean).join(", ")
      const res = await fetch("/api/update-account-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: account.id,
          name: formData.name,
          industry: formData.industry,
          timeZone: formData.timeZone,
          tags: formattedTags,
          status: formData.status,
          billingStreet: formData.billingStreet,
          billingCity: formData.billingCity,
          billingState: formData.billingState,
          billingZip: formData.billingZip
        })
      })

      const data = await res.json()
      if (data.success) {
        onSaved()
      } else {
        alert(data.error || "Failed to update account")
      }
    } catch (e: any) {
      console.error(e)
      alert("Network error: " + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-[#111111] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#0f1013] shrink-0">
          <h2 className="text-base font-bold text-white">Edit Account details</h2>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white rounded-lg transition-colors">
            <FiX size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Account Name</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Industry</label>
            <input 
              type="text" 
              value={formData.industry}
              onChange={e => setFormData({ ...formData, industry: e.target.value })}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Time Zone</label>
            <input 
              type="text" 
              value={formData.timeZone}
              onChange={e => setFormData({ ...formData, timeZone: e.target.value })}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              placeholder="e.g. America/New_York"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Tags (Comma Separated)</label>
            <input 
              type="text" 
              value={formData.tags}
              onChange={e => setFormData({ ...formData, tags: e.target.value })}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Status</label>
            <select 
              value={formData.status}
              onChange={e => setFormData({ ...formData, status: e.target.value })}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              {["Personal", "Open", "Update Status", "Inactive", "VIP", "New Lead", "Hot Lead", "Do Not Contact"].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Billing Address */}
          <div className="pt-2 border-t border-white/5">
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Billing Street</label>
            <input
              type="text"
              value={formData.billingStreet}
              onChange={e => setFormData({ ...formData, billingStreet: e.target.value })}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              placeholder="123 Main St"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">City</label>
              <input
                type="text"
                value={formData.billingCity}
                onChange={e => setFormData({ ...formData, billingCity: e.target.value })}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">State</label>
              <input
                type="text"
                value={formData.billingState}
                onChange={e => setFormData({ ...formData, billingState: e.target.value })}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Zip</label>
              <input
                type="text"
                value={formData.billingZip}
                onChange={e => setFormData({ ...formData, billingZip: e.target.value })}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-white/10 bg-[#0f1013] flex justify-end gap-3 shrink-0">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-bold text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <FiSave />
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  )
}
