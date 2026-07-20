import { useState } from "react"
import { createPortal } from "react-dom"
import { FiBox, FiCheck } from "react-icons/fi"
import { toast } from 'react-hot-toast';

interface CreatePackageModalProps {
  salesOrderId: string;
  lineItems: any[];
  onClose: () => void;
  onSuccess: (packageId: string) => void;
}

export function CreatePackageModal({ salesOrderId, lineItems, onClose, onSuccess }: CreatePackageModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({})

  const handleQuantityChange = (lineItemId: string, qty: number) => {
    setSelectedItems(prev => ({
      ...prev,
      [lineItemId]: qty
    }))
  }

  const handleSubmit = async () => {
    const itemsToPack = Object.entries(selectedItems)
      .filter(([_, qty]) => qty > 0)
      .map(([id, qty]) => ({ lineItemId: id, quantity: qty }))

    if (itemsToPack.length === 0) {
      toast.error("Please select at least one item to pack.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/zoho-fulfillment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CreatePackage",
          salesOrderId,
          items: itemsToPack
        })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || data.error)
      onSuccess(data.packageId)
    } catch (err: any) {
      toast.error(`Failed to create package: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-neutral-900 border border-neutral-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <FiBox className="text-blue-400" /> Create Package
        </h3>
        <p className="text-xs text-neutral-400 mb-4">Select the items and quantities you want to include in this package.</p>
        
        <div className="space-y-3 max-h-[60vh] overflow-y-auto mb-6 pr-2">
          {lineItems.map(item => (
            <div key={item.line_item_id} className="bg-neutral-850 p-3 rounded-xl border border-neutral-800 flex justify-between items-center">
              <div>
                <div className="text-sm font-bold text-white">{item.name}</div>
                <div className="text-[10px] text-neutral-500 font-mono mt-1">Available Qty: {item.quantity}</div>
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
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg font-bold text-sm shadow-lg shadow-blue-900/20 disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create Package"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
