import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { FiTruck } from "react-icons/fi"
import { toast } from 'react-hot-toast';

interface CreateDropshipmentModalProps {
  salesOrderId: string;
  lineItems: any[];
  onClose: () => void;
  onSuccess: (poId: string) => void;
}

export function CreateDropshipmentModal({ salesOrderId, lineItems, onClose, onSuccess }: CreateDropshipmentModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({})
  const [vendorId, setVendorId] = useState("")
  const [vendors, setVendors] = useState<any[]>([])
  const [isLoadingVendors, setIsLoadingVendors] = useState(true)

  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const res = await fetch("/api/get-vendors")
        const data = await res.json()
        if (data.success && data.vendors) {
          setVendors(data.vendors)
        }
      } catch (e) {
        console.error("Failed to fetch vendors", e)
      } finally {
        setIsLoadingVendors(false)
      }
    }
    fetchVendors()
  }, [])

  const handleQuantityChange = (lineItemId: string, qty: number) => {
    setSelectedItems(prev => ({
      ...prev,
      [lineItemId]: qty
    }))
  }

  const handleSubmit = async () => {
    if (!vendorId) {
      toast.error("Please select a Vendor.")
      return
    }

    const itemsToShip = Object.entries(selectedItems)
      .filter(([_, qty]) => qty > 0)
      .map(([id, qty]) => ({ lineItemId: id, quantity: qty }))

    if (itemsToShip.length === 0) {
      toast.error("Please select at least one item to dropship.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/zoho-fulfillment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CreateDropshipment",
          salesOrderId,
          vendorId,
          items: itemsToShip
        })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || data.error)
      onSuccess(data.purchaseOrderId)
    } catch (err: any) {
      toast.error(`Failed to create dropshipment: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-neutral-900 border border-neutral-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <FiTruck className="text-amber-500" /> Create Dropshipment (PO)
        </h3>
        
        <div className="mb-5">
          <label className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider mb-1 block">Vendor</label>
          <select 
            value={vendorId}
            onChange={e => setVendorId(e.target.value)}
            disabled={isLoadingVendors}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white font-semibold text-sm disabled:opacity-50"
          >
            <option value="">{isLoadingVendors ? "Loading vendors..." : "Select a Vendor"}</option>
            {vendors.map(v => (
              <option key={v.contact_id} value={v.contact_id}>
                {v.contact_name} {v.company_name ? `(${v.company_name})` : ""}
              </option>
            ))}
          </select>
        </div>

        <p className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider mb-2">Select Items to Dropship</p>
        <div className="space-y-3 max-h-[50vh] overflow-y-auto mb-6 pr-2">
          {lineItems.map(item => (
            <div key={item.line_item_id} className="bg-neutral-850 p-3 rounded-xl border border-neutral-800 flex justify-between items-center">
              <div>
                <div className="text-sm font-bold text-white">{item.name}</div>
                <div className="text-[10px] text-neutral-500 font-mono mt-1">Ordered Qty: {item.quantity}</div>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  min="0" 
                  max={item.quantity} 
                  value={selectedItems[item.line_item_id] || 0}
                  onChange={e => handleQuantityChange(item.line_item_id, parseInt(e.target.value) || 0)}
                  className="w-16 bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-white text-center text-sm font-bold"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
          <button onClick={onClose} className="px-4 py-2 text-neutral-400 hover:text-white font-bold text-sm">Cancel</button>
          <button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2 rounded-lg font-bold text-sm shadow-lg shadow-amber-900/20 disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create Dropshipment"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
