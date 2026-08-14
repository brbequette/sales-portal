"use client"

import { useEffect, useState } from "react"
import { FiBox, FiShoppingCart, FiCalendar, FiTrendingUp } from "react-icons/fi"

export default function MyBladesPage() {
  const [blades, setBlades] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBlades = async () => {
      const token = localStorage.getItem("td_customer_token")
      if (!token) return

      try {
        const res = await fetch("/api/customer/blades", {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          setBlades(data.data || [])
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchBlades()
  }, [])

  const handleReorder = (blade: any) => {
    alert(`Added ${blade.name} to your cart. Proceed to checkout to finalize.`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">My Blades</h1>
        <p className="text-neutral-400">Products you've purchased, locked at your wholesale tier pricing.</p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : blades.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {blades.map((blade, idx) => (
            <div key={idx} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 hover:border-amber-500/30 transition-colors flex flex-col h-full group">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-white/5 rounded-xl text-neutral-400 group-hover:bg-amber-500/10 group-hover:text-amber-400 transition-colors">
                  <FiBox size={24} />
                </div>
                <div className="text-right">
                  <div className="text-xl font-black text-emerald-400">${(blade.unitPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <div className="text-xs text-neutral-500 font-bold">YOUR PRICE / EA</div>
                </div>
              </div>
              
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white leading-tight mb-1">{blade.name}</h3>
                <p className="text-xs font-mono text-neutral-500 mb-4">SKU: {blade.sku}</p>
                
                <div className="space-y-2 mb-6">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-neutral-400">
                      <FiTrendingUp /> Total Purchased
                    </div>
                    <span className="font-bold text-white">{blade.totalQuantity || 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-neutral-400">
                      <FiCalendar /> Last Ordered
                    </div>
                    <span className="text-white">{blade.lastPurchaseDate ? new Date(blade.lastPurchaseDate).toLocaleDateString() : 'N/A'}</span>
                  </div>
                </div>
              </div>
              
              <button 
                onClick={() => handleReorder(blade)}
                className="w-full bg-white/5 hover:bg-amber-500 text-neutral-300 hover:text-neutral-950 font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <FiShoppingCart /> Reorder Item
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-neutral-900 border border-neutral-800 rounded-2xl">
          <FiBox className="mx-auto mb-4 text-neutral-600" size={48} />
          <h3 className="text-xl font-bold text-white mb-2">No Blades Found</h3>
          <p className="text-neutral-400 max-w-md mx-auto">You haven't purchased any blades yet, or they haven't synced to your online account.</p>
        </div>
      )}
    </div>
  )
}
