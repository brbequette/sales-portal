"use client"


import { useState, useEffect } from "react"
import { FiPackage, FiTruck, FiBox, FiCheckCircle } from "react-icons/fi"

interface AccountPackagesProps {
  accountId: string
}

export function AccountPackages({ accountId }: AccountPackagesProps) {
  const [packages, setPackages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPackages = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/get-account-packages?accountId=${encodeURIComponent(accountId)}`)
        const data = await res.json()
        if (data.success) {
          setPackages(data.packages || [])
        }
      } catch (err) {
        console.error("Failed to fetch packages:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchPackages()
  }, [accountId])

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (packages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-neutral-500 gap-2">
        <FiBox size={24} className="opacity-50" />
        <span className="text-sm font-semibold">No fulfillment packages found.</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {packages.map((pkg, idx) => {
        const isShipped = pkg.status === 'shipped' || pkg.status === 'delivered'
        return (
          <div key={pkg.package_id || idx} className="glass-panel border border-white/10 rounded-lg p-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between hover:border-emerald-500/50 transition-colors cursor-pointer"
               onClick={() => {
                 // Trigger the DocumentFlipbook or SaleHub modal
                 window.dispatchEvent(new CustomEvent('openInvoiceDetails', {
                   detail: { 
                     type: 'SalesOrder', // We want to show the full lifecycle for the package's sale
                     zohoId: pkg.salesorder_id || pkg.sales_order_id,
                     data: pkg
                   }
                 }))
               }}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isShipped ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                {isShipped ? <FiCheckCircle size={16} /> : <FiPackage size={16} />}
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  {pkg.package_number} 
                  <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${isShipped ? 'bg-emerald-500/20 text-emerald-300' : 'bg-neutral-800 text-neutral-400'}`}>
                    {pkg.status}
                  </span>
                </div>
                <div className="text-xs text-neutral-500 font-mono mt-0.5">
                  SO: {pkg.salesorder_number || pkg.sales_order_number || 'Unknown'}
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-start sm:items-end w-full sm:w-auto mt-2 sm:mt-0">
              {pkg.shipment_date && (
                <div className="text-xs text-neutral-400 flex items-center gap-1">
                  <FiTruck size={10} /> Shipped: {pkg.shipment_date}
                </div>
              )}
              {pkg.tracking_number && (
                <div className="text-xs text-sky-400 font-mono mt-1 hover:underline truncate max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                  #{pkg.tracking_number}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

