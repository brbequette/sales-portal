import { useState } from "react"
import { FiX, FiSave } from "react-icons/fi"
import { toast } from 'react-hot-toast';

interface AccountEditModalProps {
  account: any
  onClose: () => void
  onSaved: () => void
}

const FACT_FINDING_FIELDS: { key: string; label: string; options: string[] }[] = [
  { key: "bladeSizes", label: "Blade Sizes", options: ['10"', '12"', '14"', '16"', '18"', '20"', '24"', '30"', '36"'] },
  { key: "materialsCut", label: "Materials Cut", options: ["Concrete", "Asphalt", "Brick", "Block", "Stone", "Pavers", "Granite", "Marble", "Tile", "Ductile Iron", "Rebar", "Green Concrete"] },
  { key: "currentSupplier", label: "Current Supplier", options: ["Home Depot", "Lowes", "Sunbelt", "United Rentals", "White Cap", "HD Supply", "Ace", "Local Supplier", "Online", "Manufacturer Direct", "Other"] },
  { key: "averageBladeCost", label: "Avg Blade Cost", options: ["$25-50", "$50-75", "$75-100", "$100-150", "$150-200", "$200-300", "$300-400", "$400+"] },
  { key: "crewCount", label: "Crew Count", options: ["1", "2-3", "4-5", "6-10", "10+"] },
  { key: "bladesPerOrder", label: "Blades Per Order", options: ["1-3", "4-6", "6-10", "12-25", "25+"] },
  { key: "improvementPriority", label: "Improvement Priority", options: ["Longer life", "Faster cutting", "Cleaner cutting", "Lower price"] },
]

function togglePillValue(current: string, value: string): string {
  const items = current.split(",").map(s => s.trim()).filter(Boolean)
  const idx = items.indexOf(value)
  if (idx >= 0) {
    items.splice(idx, 1)
  } else {
    items.push(value)
  }
  return items.join(", ")
}

function isPillSelected(current: string, value: string): boolean {
  const items = current.split(",").map(s => s.trim()).filter(Boolean)
  return items.includes(value)
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
    bladeSizes: account?.bladeSizes || "",
    materialsCut: account?.materialsCut || "",
    currentSupplier: account?.currentSupplier || "",
    averageBladeCost: account?.averageBladeCost || "",
    crewCount: account?.crewCount || "",
    bladesPerOrder: account?.bladesPerOrder || "",
    improvementPriority: account?.improvementPriority || "",
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
          billingZip: formData.billingZip,
          bladeSizes: formData.bladeSizes,
          materialsCut: formData.materialsCut,
          currentSupplier: formData.currentSupplier,
          averageBladeCost: formData.averageBladeCost,
          crewCount: formData.crewCount,
          bladesPerOrder: formData.bladesPerOrder,
          improvementPriority: formData.improvementPriority,
        })
      })

      const data = await res.json()
      if (data.success) {
        onSaved()
      } else {
        toast.error(data.error || "Failed to update account")
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
      <div className="bg-[#111111] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
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
              className="w-full glass-panel border border-white/10 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Industry</label>
            <input 
              type="text" 
              value={formData.industry}
              onChange={e => setFormData({ ...formData, industry: e.target.value })}
              className="w-full glass-panel border border-white/10 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Time Zone</label>
            <input 
              type="text" 
              value={formData.timeZone}
              onChange={e => setFormData({ ...formData, timeZone: e.target.value })}
              className="w-full glass-panel border border-white/10 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              placeholder="e.g. America/New_York"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Tags (Comma Separated)</label>
            <input 
              type="text" 
              value={formData.tags}
              onChange={e => setFormData({ ...formData, tags: e.target.value })}
              className="w-full glass-panel border border-white/10 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Status</label>
            <select 
              value={formData.status}
              onChange={e => setFormData({ ...formData, status: e.target.value })}
              className="w-full glass-panel border border-white/10 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              {["Personal", "Open", "Update Status", "Inactive", "VIP", "New Lead", "Hot Lead", "Do Not Contact"].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* ── Fact-Finding Section ── */}
          <div className="border-t border-white/10 pt-4 mt-2">
            <h3 className="text-sm font-bold text-orange-400 mb-4">📋 Fact-Finding</h3>
            <div className="space-y-4">
              {FACT_FINDING_FIELDS.map(field => {
                const currentValue = (formData as any)[field.key] as string
                return (
                  <div key={field.key}>
                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">{field.label}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {field.options.map(option => {
                        const selected = isPillSelected(currentValue, option)
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setFormData({ ...formData, [field.key]: togglePillValue(currentValue, option) })}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                              selected
                                ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                                : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:border-neutral-600"
                            }`}
                          >
                            {option}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Billing Address */}
          <div className="pt-2 border-t border-white/10">
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Billing Street</label>
            <input
              type="text"
              value={formData.billingStreet}
              onChange={e => setFormData({ ...formData, billingStreet: e.target.value })}
              className="w-full glass-panel border border-white/10 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
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
                className="w-full glass-panel border border-white/10 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">State</label>
              <input
                type="text"
                value={formData.billingState}
                onChange={e => setFormData({ ...formData, billingState: e.target.value })}
                className="w-full glass-panel border border-white/10 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Zip</label>
              <input
                type="text"
                value={formData.billingZip}
                onChange={e => setFormData({ ...formData, billingZip: e.target.value })}
                className="w-full glass-panel border border-white/10 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
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
