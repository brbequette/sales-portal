"use client"

import { useEffect, useState } from "react"
import { FiSearch, FiFilter, FiChevronDown, FiChevronUp, FiExternalLink, FiRefreshCw, FiShoppingBag } from "react-icons/fi"

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reordering, setReordering] = useState<string | null>(null)

  useEffect(() => {
    const fetchOrders = async () => {
      const token = localStorage.getItem("td_customer_token")
      if (!token) return

      try {
        const res = await fetch("/api/customer/orders", {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          setOrders(data.orders || [])
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchOrders()
  }, [])

  const handleReorder = async (orderId: string) => {
    setReordering(orderId)
    const token = localStorage.getItem("td_customer_token")
    try {
      const res = await fetch("/api/customer/reorder", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ orderId })
      })
      if (res.ok) {
        alert("Items added to cart! Proceed to checkout to complete your reorder.")
      } else {
        alert("Failed to reorder items.")
      }
    } catch (err) {
      alert("Error processing reorder.")
    } finally {
      setReordering(null)
    }
  }

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          order.id?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "All" || order.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Order History</h1>
          <p className="text-neutral-400">View past orders, download invoices, and quickly reorder.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 bg-neutral-900 border border-neutral-800 p-4 rounded-2xl">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input 
            type="text" 
            placeholder="Search order number..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-amber-500"
          />
        </div>
        <div className="relative w-full sm:w-48 shrink-0">
          <FiFilter className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <select 
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-amber-500 appearance-none cursor-pointer"
          >
            <option value="All">All Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Sent">Sent</option>
            <option value="Overdue">Overdue</option>
            <option value="Draft">Draft</option>
          </select>
        </div>
      </div>

      {/* Order List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : filteredOrders.length > 0 ? (
          filteredOrders.map(order => (
            <div key={order.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-sm hover:border-neutral-700 transition-colors">
              <div 
                className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
              >
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-neutral-500 font-bold mb-1">ORDER NUMBER</div>
                    <div className="font-bold text-white">{order.orderNumber || "N/A"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500 font-bold mb-1">DATE</div>
                    <div className="text-white">{new Date(order.date).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500 font-bold mb-1">STATUS</div>
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      order.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      order.status === 'Sent' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                      order.status === 'Overdue' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                      'bg-neutral-800 text-neutral-300 border border-neutral-700'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500 font-bold mb-1">TOTAL</div>
                    <div className="font-bold text-white">${(order.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {order.status === 'Overdue' && order.payLink && (
                    <a 
                      href={order.payLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      Pay Now <FiExternalLink />
                    </a>
                  )}
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-neutral-400 hover:bg-white/10 transition-colors">
                    {expandedId === order.id ? <FiChevronUp /> : <FiChevronDown />}
                  </div>
                </div>
              </div>

              {expandedId === order.id && (
                <div className="border-t border-neutral-800 bg-neutral-950/50 p-5">
                  <div className="mb-4">
                    <h4 className="text-sm font-bold text-white mb-3">Order Items</h4>
                    <div className="space-y-2">
                      {order.items?.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between text-sm">
                          <div className="flex gap-3 text-neutral-300">
                            <span className="font-medium">{item.quantity}x</span>
                            <span>{item.name}</span>
                          </div>
                          <span className="text-neutral-400">${((item.price || 0) * (item.quantity || 1)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      )) || <div className="text-sm text-neutral-500">No line items detailed.</div>}
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
                    <button 
                      onClick={() => handleReorder(order.id)}
                      disabled={reordering === order.id}
                      className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-sm font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {reordering === order.id ? <FiRefreshCw className="animate-spin" /> : <FiRefreshCw />}
                      Reorder Items
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-12 bg-neutral-900 border border-neutral-800 rounded-2xl">
            <FiShoppingBag className="mx-auto mb-3 text-neutral-600" size={32} />
            <p className="text-neutral-400">No orders match your criteria.</p>
          </div>
        )}
      </div>
    </div>
  )
}
