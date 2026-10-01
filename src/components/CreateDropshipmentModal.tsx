import { useState, useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import { FiTruck, FiCheck, FiExternalLink, FiRefreshCw, FiAlertCircle, FiLayers } from "react-icons/fi"
import { toast } from 'react-hot-toast'
import { getZohoBooksUrl } from "@/lib/zoho-urls"

interface CreateDropshipmentModalProps {
  salesOrderId: string;
  lineItems: any[];
  onClose: () => void;
  onSuccess: (poId: string) => void;
}

interface VendorGroupState {
  vendorId: string;
  vendorName: string;
  isSuggested: boolean;
  itemIds: string[];
}

export function CreateDropshipmentModal({ salesOrderId, lineItems, onClose, onSuccess }: CreateDropshipmentModalProps) {
  const [vendors, setVendors] = useState<any[]>([])
  const [isLoadingVendors, setIsLoadingVendors] = useState(true)

  // Track quantities selected for each line item (defaulting to the item's ordered quantity)
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    lineItems.forEach(item => {
      initial[item.line_item_id] = Number(item.quantity || 1)
    })
    return initial
  })

  // Group-level vendor overrides (keyed by group key)
  const [groupVendors, setGroupVendors] = useState<Record<string, string>>({})
  // Track submission state per group (or global)
  const [submittingGroups, setSubmittingGroups] = useState<Record<string, boolean>>({})
  // Track successfully created POs per group
  const [createdPOs, setCreatedPOs] = useState<Record<string, { poId: string; poNumber?: string }>>({})

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

  // Partition line items into suggested vendor groups based on product vendor catalog mapping
  const vendorGroups = useMemo(() => {
    const groupsMap = new Map<string, {
      key: string;
      vendorId: string;
      vendorName: string;
      isSuggested: boolean;
      items: any[];
    }>()

    lineItems.forEach(item => {
      const vId = item.suggestedVendorId ? String(item.suggestedVendorId).trim() : ""
      const vName = item.suggestedVendorName || "Unassigned Vendor"
      const key = vId || "unassigned"

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
          vendorId: vId,
          vendorName: vId ? vName : "Unassigned / Custom Vendor",
          isSuggested: Boolean(vId),
          items: []
        })
      }
      groupsMap.get(key)!.items.push(item)
    })

    return Array.from(groupsMap.values())
  }, [lineItems])

  const handleQuantityChange = (lineItemId: string, qty: number) => {
    setSelectedQuantities(prev => ({
      ...prev,
      [lineItemId]: Math.max(0, qty)
    }))
  }

  const handleGroupVendorChange = (groupKey: string, newVendorId: string) => {
    setGroupVendors(prev => ({
      ...prev,
      [groupKey]: newVendorId
    }))
  }

  // Create dropshipment for a specific vendor group
  const handleCreateGroupDropshipment = async (group: typeof vendorGroups[0]) => {
    const activeVendorId = groupVendors[group.key] || group.vendorId

    if (!activeVendorId) {
      toast.error(`Please select a Vendor for ${group.vendorName}.`)
      return
    }

    const itemsToShip = group.items
      .map(item => ({
        lineItemId: item.line_item_id,
        quantity: selectedQuantities[item.line_item_id] ?? Number(item.quantity || 1)
      }))
      .filter(i => i.quantity > 0)

    if (itemsToShip.length === 0) {
      toast.error("Please select at least 1 item with quantity > 0.")
      return
    }

    setSubmittingGroups(prev => ({ ...prev, [group.key]: true }))
    try {
      const res = await fetch("/api/zoho-fulfillment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CreateDropshipment",
          salesOrderId,
          vendorId: activeVendorId,
          items: itemsToShip,
          requestId: crypto.randomUUID(),
        })
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.message || data.error || "Dropshipment creation failed")
      }

      toast.success(`Created dropship PO for ${group.vendorName}!`)
      setCreatedPOs(prev => ({
        ...prev,
        [group.key]: {
          poId: data.purchaseOrderId,
          poNumber: data.purchaseOrderNumber || data.purchaseOrderId?.slice(-6)
        }
      }))
      onSuccess(data.purchaseOrderId)
    } catch (err: any) {
      toast.error(`Failed to create dropshipment: ${err.message}`)
    } finally {
      setSubmittingGroups(prev => ({ ...prev, [group.key]: false }))
    }
  }

  // Batch create all suggested dropshipments
  const handleCreateAllSuggested = async () => {
    const eligibleGroups = vendorGroups.filter(g => !createdPOs[g.key])
    if (eligibleGroups.length === 0) {
      toast.error("All suggested dropshipments have already been created.")
      return
    }

    for (const group of eligibleGroups) {
      await handleCreateGroupDropshipment(group)
    }
  }

  const allCompleted = vendorGroups.every(g => createdPOs[g.key])
  const isAnySubmitting = Object.values(submittingGroups).some(Boolean)

  return createPortal(
    <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-panel border border-white/10 w-full max-w-2xl rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <FiTruck className="text-orange-400" />
              <span>Vendor Dropshipment Manager</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Items automatically separated into suggested purchase orders based upon authoritative catalog vendor mappings.
            </p>
          </div>
          {vendorGroups.length > 1 && !allCompleted && (
            <button
              onClick={handleCreateAllSuggested}
              disabled={isAnySubmitting}
              className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl shadow-lg transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <FiLayers size={13} />
              <span>Create All ({vendorGroups.length} POs)</span>
            </button>
          )}
        </div>

        {/* Vendor Groups List */}
        <div className="space-y-4 overflow-y-auto pr-1 flex-1">
          {vendorGroups.map((group, idx) => {
            const activeVendorId = groupVendors[group.key] || group.vendorId
            const isSubmitting = Boolean(submittingGroups[group.key])
            const completed = createdPOs[group.key]

            // Calculate total units in this vendor group
            const groupUnits = group.items.reduce((acc, it) => acc + (selectedQuantities[it.line_item_id] ?? Number(it.quantity || 1)), 0)

            return (
              <div 
                key={group.key}
                className={`rounded-2xl border transition-all p-4 space-y-3.5 ${
                  completed
                    ? "bg-emerald-950/20 border-emerald-500/30"
                    : "bg-neutral-900/60 border-white/10 hover:border-orange-500/30"
                }`}
              >
                {/* Group Header: Vendor selector and status */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-400 font-mono font-bold text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          {group.vendorName}
                        </span>
                        {group.isSuggested && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            Suggested Vendor
                          </span>
                        )}
                        {completed && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <FiCheck size={11} /> Dropship PO Created
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">
                        {group.items.length} line item{group.items.length !== 1 ? "s" : ""} • {groupUnits} total units
                      </div>
                    </div>
                  </div>

                  {/* Vendor selector dropdown (in case user wants to change destination vendor) */}
                  <div className="flex items-center gap-2 min-w-[220px]">
                    <select
                      value={activeVendorId}
                      onChange={e => handleGroupVendorChange(group.key, e.target.value)}
                      disabled={isLoadingVendors || Boolean(completed) || isSubmitting}
                      className="w-full bg-black/60 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-orange-500/60 disabled:opacity-50"
                    >
                      <option value="">Select Vendor...</option>
                      {vendors.map(v => (
                        <option key={v.contact_id} value={v.contact_id} className="bg-neutral-900 text-white">
                          {v.contact_name} {v.company_name ? `(${v.company_name})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Items in this vendor group */}
                <div className="space-y-2 pt-1 border-t border-white/5">
                  {group.items.map(item => {
                    const orderedQty = Number(item.quantity || 1)
                    const currentQty = selectedQuantities[item.line_item_id] ?? orderedQty

                    return (
                      <div 
                        key={item.line_item_id}
                        className="bg-black/30 border border-white/5 rounded-xl p-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-white truncate flex items-center gap-1.5">
                            <span className="text-orange-300 font-mono">[{item.sku || "NO-SKU"}]</span>
                            <span>{item.name}</span>
                          </div>
                          <div className="text-[10px] text-neutral-400 mt-0.5 flex items-center gap-3">
                            <span>Ordered: <strong className="text-neutral-200">{orderedQty}</strong></span>
                            {item.unitCost ? (
                              <span className="text-emerald-400 font-mono font-medium">Cost: ${Number(item.unitCost).toFixed(2)}/ea</span>
                            ) : (
                              <span className="text-neutral-500">Cost: Pending</span>
                            )}
                            {item.canDropship === true && (
                              <span className="text-emerald-400">✓ Dropship Approved</span>
                            )}
                          </div>
                        </div>

                        {/* Quantity to dropship */}
                        <div className="flex items-center gap-2 shrink-0">
                          <label className="text-[10px] uppercase font-bold text-neutral-500">Ship Qty:</label>
                          <input
                            type="number"
                            min="0"
                            max={orderedQty}
                            value={currentQty}
                            disabled={Boolean(completed) || isSubmitting}
                            onChange={e => handleQuantityChange(item.line_item_id, parseInt(e.target.value) || 0)}
                            className="w-16 bg-black/50 border border-white/20 rounded-lg px-2 py-1 text-white text-center font-mono font-bold text-xs focus:outline-none focus:border-orange-500 disabled:opacity-50"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Group Footer: PO Link or Action Button */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  {completed ? (
                    <div className="flex items-center gap-2">
                      <a
                        href={getZohoBooksUrl('purchaseorders', completed.poId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-orange-400 hover:text-orange-300 font-bold flex items-center gap-1 hover:underline"
                      >
                        <FiExternalLink size={12} />
                        <span>View Purchase Order in Zoho Books</span>
                      </a>
                    </div>
                  ) : (
                    <div className="text-[11px] text-neutral-400 flex items-center gap-1">
                      {group.isSuggested ? (
                        <span className="text-emerald-400/90 font-medium">Ready to create PO for {group.vendorName}</span>
                      ) : (
                        <span className="text-amber-400/90 flex items-center gap-1">
                          <FiAlertCircle size={12} /> Choose vendor above to dropship these items
                        </span>
                      )}
                    </div>
                  )}

                  {!completed && (
                    <button
                      onClick={() => handleCreateGroupDropshipment(group)}
                      disabled={isSubmitting || !activeVendorId || groupUnits === 0}
                      className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow transition flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <FiRefreshCw size={12} className="animate-spin" />
                          <span>Creating PO...</span>
                        </>
                      ) : (
                        <>
                          <FiTruck size={12} />
                          <span>Create Dropshipment PO</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Modal Footer */}
        <div className="flex justify-between items-center pt-3 border-t border-white/10 shrink-0">
          <div className="text-xs text-neutral-500">
            {allCompleted ? "All vendor dropshipments created!" : `${vendorGroups.length} vendor shipment group${vendorGroups.length !== 1 ? "s" : ""}`}
          </div>
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white font-bold text-xs transition"
          >
            {allCompleted ? "Done" : "Cancel"}
          </button>
        </div>

      </div>
    </div>,
    document.body
  )
}
