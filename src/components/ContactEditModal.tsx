import { useState } from "react"
import { FiX, FiSave } from "react-icons/fi"
import { toast } from 'react-hot-toast';

interface ContactEditModalProps {
  accountId: string
  contact?: any
  onClose: () => void
  onSaved: () => void
}

export function ContactEditModal({ accountId, contact, onClose, onSaved }: ContactEditModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    firstName: contact?.firstName || "",
    lastName: contact?.lastName || "",
    email: contact?.email || "",
    phone: contact?.phone || "",
    mobilePhone: contact?.mobilePhone || "",
    designation: contact?.designation || "",
    isPrimary: contact?.isPrimary || false,
  })

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/manage-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: contact ? "UPDATE" : "CREATE",
          accountId,
          contactId: contact?.id,
          ...formData
        })
      })

      const data = await res.json()
      if (data.success) {
        onSaved()
      } else {
        toast.error(data.error || "Failed to save contact")
      }
    } catch (e: any) {
      console.error(e)
      toast.error("Network error: " + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-[#111111] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#0f1013] shrink-0">
          <h2 className="text-base font-bold text-white">{contact ? "Edit Contact" : "Add Contact"}</h2>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white rounded-lg transition-colors">
            <FiX size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">First Name</label>
              <input 
                type="text" 
                value={formData.firstName}
                onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Last Name</label>
              <input 
                type="text" 
                value={formData.lastName}
                onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Email Address</label>
            <input 
              type="email" 
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Office Phone</label>
              <input 
                type="tel" 
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Mobile Phone</label>
              <input 
                type="tel" 
                value={formData.mobilePhone}
                onChange={e => setFormData({ ...formData, mobilePhone: e.target.value })}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Designation</label>
            <input 
              type="text" 
              value={formData.designation}
              onChange={e => setFormData({ ...formData, designation: e.target.value })}
              placeholder="e.g. Accounts Payable, Owner, Buyer"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer mt-2 bg-neutral-900 border border-neutral-800 p-3 rounded-lg">
            <input 
              type="checkbox" 
              checked={formData.isPrimary}
              onChange={e => setFormData({ ...formData, isPrimary: e.target.checked })}
              className="w-4 h-4 rounded text-emerald-500 bg-neutral-800 border-neutral-700 focus:ring-emerald-500 focus:ring-offset-neutral-900"
            />
            <div>
              <div className="text-sm font-bold text-white">Primary Contact</div>
              <div className="text-xs text-neutral-500 mt-0.5">Set as the main representative for this account</div>
            </div>
          </label>
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
            {loading ? "Saving..." : "Save Contact"}
          </button>
        </div>
      </div>
    </div>
  )
}
