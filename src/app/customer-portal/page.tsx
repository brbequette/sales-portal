"use client"

import { useEffect, useState } from "react"
import { FiTrendingUp, FiShoppingBag, FiDollarSign, FiRefreshCw, FiAlertCircle, FiArrowRight, FiPercent } from "react-icons/fi"
import Link from "next/link"

export default function CustomerDashboard() {
  const [account, setAccount] = useState<any>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem("td_customer_token")
    if (!token) return

    const fetchData = async () => {
      try {
        const [accountRes, ordersRes] = await Promise.all([
          fetch("/api/customer/account", {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch("/api/customer/orders?limit=5", {
            headers: { Authorization: `Bearer ${token}` }
          })
        ])

        if (accountRes.ok) {
          const data = await accountRes.json()
          setAccount(data.data)
        }
        if (ordersRes.ok) {
          const data = await ordersRes.json()
          setOrders(data.data || [])
        }
      } catch (err) {
        console.error("Error fetching dashboard data", err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Discount Banner */}
      <div className="bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-amber-500/20 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center shrink-0">
            <FiPercent className="text-amber-400" size={20} />
          </div>
          <div>
            <h3 className="text-amber-400 font-bold">10% Online Discount Active</h3>
            <p className="text-sm text-amber-500/80">Order online and save 10% on all paid orders!</p>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-2">
            Welcome back, {account?.name || "Customer"}
          </h1>
          <div className="flex items-center gap-4 text-sm text-neutral-400">
            <span className="bg-white/10 px-2 py-1 rounded text-white font-medium">
              Tier: {account?.tier || "Standard"}
            </span>
            {account?.owner && (
              <span>Your Rep: <strong className="text-white">{account.owner.name}</strong> ({account.owner.phone})</span>
            )}
          </div>
        </div>
        <Link 
          href="/customer-portal/orders"
          className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold py-2.5 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 w-full md:w-auto shrink-0"
        >
          <FiShoppingBag /> Order Now
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-white/5 rounded-xl text-neutral-400"><FiShoppingBag size={20} /></div>
          </div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Total Orders</p>
          <h3 className="text-2xl font-black text-white">{account?.totalOrders || 0}</h3>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-white/5 rounded-xl text-emerald-400"><FiTrendingUp size={20} /></div>
          </div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Total Spent</p>
          <h3 className="text-2xl font-black text-white">${((account?.totalSpent || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-white/5 rounded-xl text-amber-400"><FiRefreshCw size={20} /></div>
          </div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Active Autoship</p>
          <h3 className="text-2xl font-black text-white">{account?.activeAutoshipCount || 0} Bundles</h3>
        </div>
        <div className="bg-neutral-900 border border-rose-900/50 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><FiDollarSign size={64} className="text-rose-500" /></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="p-3 bg-rose-500/20 rounded-xl text-rose-400"><FiAlertCircle size={20} /></div>
          </div>
          <p className="text-rose-300 text-sm font-medium mb-1 relative z-10">Outstanding Balance</p>
          <h3 className="text-2xl font-black text-rose-400 relative z-10">${((account?.outstandingBalance || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Recent Orders</h2>
            <Link href="/customer-portal/orders" className="text-sm font-medium text-amber-400 hover:text-amber-300 flex items-center gap-1">
              View All <FiArrowRight />
            </Link>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
            {orders.length > 0 ? (
              <div className="divide-y divide-neutral-800">
                {orders.map((order) => (
                  <div key={order.id} className="p-4 hover:bg-white/[0.02] transition-colors flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-bold text-white">{order.orderNumber}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          order.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400' :
                          order.status === 'Sent' ? 'bg-sky-500/10 text-sky-400' :
                          order.status === 'Overdue' ? 'bg-rose-500/10 text-rose-400' :
                          'bg-amber-500/10 text-amber-400'
                        }`}>
                          {order.status}
                        </span>
                      </div>
                      <div className="text-sm text-neutral-400">
                        {new Date(order.date).toLocaleDateString()} • {order.itemCount} items
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-white">${(order.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                      <Link href={`/customer-portal/orders?id=${order.id}`} className="text-xs text-amber-400 hover:underline">
                        View Details
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-neutral-500">
                <FiShoppingBag className="mx-auto mb-3 opacity-50" size={32} />
                <p>No recent orders found.</p>
              </div>
            )}
          </div>
        </div>

        {/* Autoship Summary */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white">Autoship</h2>
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
            {account?.activeAutoshipCount > 0 ? (
              <div>
                <p className="text-sm text-neutral-400 mb-4">You have <strong className="text-white">{account.activeAutoshipCount}</strong> active bundles locked in at wholesale pricing.</p>
                <Link href="/customer-portal/autoship" className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
                  Manage Subscriptions
                </Link>
              </div>
            ) : (
              <div className="text-center py-4">
                <FiRefreshCw className="mx-auto mb-3 text-neutral-500" size={32} />
                <p className="text-sm text-neutral-400 mb-4">Never run out of blades. Lock in our lowest pricing with Autoship.</p>
                <Link href="/customer-portal/autoship" className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
                  Browse Bundles
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
