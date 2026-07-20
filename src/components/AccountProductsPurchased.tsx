"use client"


import { useState, useEffect } from "react"
import { FiSearch, FiPackage, FiShoppingBag, FiArrowRight } from "react-icons/fi"
import { useProductModal } from "@/components/ProductModalProvider"

interface AccountProductsPurchasedProps {
  accountId: string
}

export function AccountProductsPurchased({ accountId }: AccountProductsPurchasedProps) {
  const { showProduct } = useProductModal()
  const [purchases, setPurchases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    const fetchPurchases = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/get-account-purchases?accountId=${encodeURIComponent(accountId)}`)
        const data = await res.json()
        if (data.success) {
          setPurchases(data.purchasedProducts || [])
        }
      } catch (err) {
        console.error("Failed to fetch account purchases:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchPurchases()
  }, [accountId])

  const filteredPurchases = purchases.filter(p => 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 bg-neutral-900/40 border border-neutral-800 rounded-xl">
        <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 sm:p-6 shadow-xl flex-1 flex flex-col min-h-[500px] space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FiShoppingBag className="text-emerald-400" />
            <span>Products Purchased</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-1">Items ordered by this account, ranked from highest total spend to lowest.</p>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-xs w-full">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
          <input
            type="text"
            placeholder="Search purchased items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      <div className="bg-neutral-950/40 border border-neutral-800/80 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[600px]">
          <thead className="bg-neutral-900/60 text-neutral-400 border-b border-neutral-800 uppercase tracking-wider text-[9px] font-bold">
            <tr>
              <th className="p-4 w-28">SKU</th>
              <th className="p-4">Product Name</th>
              <th className="p-4 text-right">Quantity</th>
              <th className="p-4 text-right">Avg Price</th>
              <th className="p-4 text-right">Total Spend</th>
              <th className="p-4 text-center w-16">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/40">
            {filteredPurchases.map((p, idx) => {
              const avgPrice = p.quantity > 0 ? (p.totalSpend / p.quantity) : 0
              return (
                <tr
                  key={idx}
                  onClick={() => showProduct(p.sku, { name: p.name, sku: p.sku })}
                  className="hover:bg-neutral-800/30 transition-colors cursor-pointer group"
                >
                  <td className="p-4 font-mono font-bold text-neutral-400 group-hover:text-emerald-400 transition-colors">{p.sku}</td>
                  <td className="p-4 font-semibold text-white">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-neutral-850 border border-neutral-800 flex items-center justify-center text-neutral-500 shrink-0">
                        <FiPackage size={12} />
                      </div>
                      <span className="truncate max-w-[250px]" title={p.name}>{p.name}</span>
                    </div>
                  </td>
                  <td className="p-4 text-right text-neutral-300 font-medium">{p.quantity}</td>
                  <td className="p-4 text-right text-neutral-400 font-mono">${avgPrice.toFixed(2)}</td>
                  <td className="p-4 text-right text-emerald-400 font-bold font-mono">${p.totalSpend.toFixed(2)}</td>
                  <td className="p-4 text-center">
                    <span className="inline-flex items-center justify-center p-1 rounded bg-neutral-800 hover:bg-emerald-600 text-neutral-400 hover:text-white transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                      <FiArrowRight size={12} />
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filteredPurchases.length === 0 && (
          <div className="p-12 text-center text-neutral-500 italic">
            No products found matching your search.
          </div>
        )}
      </div>
    </div>
  )
}

