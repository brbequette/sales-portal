"use client"

import { useEffect, useState } from "react"
import { FiRefreshCw, FiCheckCircle, FiClock, FiSettings, FiPause, FiX, FiTag } from "react-icons/fi"



export default function AutoshipPage() {
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [bundles, setBundles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAutoship = async () => {
      const token = localStorage.getItem("td_customer_token")
      if (!token) return

      try {
        const res = await fetch("/api/customer/autoship", {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          setSubscriptions(data.data.subscriptions || [])
          setBundles(data.data.bundles || [])
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchAutoship()
  }, [])

  const handleSubscribe = async (bundleId: string, frequency: string) => {
    const token = localStorage.getItem("td_customer_token")
    if (!token) return
    try {
      const res = await fetch("/api/customer/autoship", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ bundleId, frequency })
      })
      if (res.ok) {
        alert(`Subscribed to bundle ${bundleId} on a ${frequency} basis!`)
      } else {
        alert("Failed to subscribe.")
      }
    } catch (err) {
      alert("Error subscribing.")
    }
  }

  const handlePause = async (subId: string) => {
    const token = localStorage.getItem("td_customer_token")
    if (!token) return
    try {
      const res = await fetch("/api/customer/autoship", {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ subId, action: 'pause' })
      })
      if (res.ok) {
        alert(`Subscription ${subId} paused.`)
      } else {
        alert("Failed to pause subscription.")
      }
    } catch (err) {
      alert("Error pausing subscription.")
    }
  }

  const handleCancel = async (subId: string) => {
    const token = localStorage.getItem("td_customer_token")
    if (!token) return
    try {
      const res = await fetch("/api/customer/autoship", {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ subId, action: 'cancel' })
      })
      if (res.ok) {
        alert(`Subscription ${subId} canceled.`)
      } else {
        alert("Failed to cancel subscription.")
      }
    } catch (err) {
      alert("Error canceling subscription.")
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Autoship Management</h1>
        <p className="text-neutral-400">Lock in your lowest pricing and never run out of blades.</p>
      </div>

      {/* Active Subscriptions Section */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <FiRefreshCw className="text-amber-400" /> Your Active Subscriptions
        </h2>
        
        {loading ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : subscriptions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {subscriptions.map(sub => (
              <div key={sub.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{sub.bundleName}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="bg-emerald-500/10 text-emerald-400 text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1">
                        <FiCheckCircle size={12} /> Active
                      </span>
                      <span className="text-neutral-500 text-sm">{sub.frequency}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-black text-white">${(sub.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    <div className="text-xs text-emerald-400 font-bold">LOCKED PRICE</div>
                  </div>
                </div>
                
                <div className="bg-neutral-950 rounded-xl p-3 mb-4">
                  <div className="text-xs text-neutral-500 font-bold mb-2">INCLUDES:</div>
                  <ul className="text-sm text-neutral-300 space-y-1">
                    {sub.items?.map((item: string, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-amber-500 mt-1">•</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-800">
                  <div className="flex items-center gap-2 text-sm">
                    <FiClock className="text-amber-400" />
                    <span className="text-neutral-400">Next Ship Date: <strong className="text-white">{new Date(sub.nextShipDate).toLocaleDateString()}</strong></span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handlePause(sub.id)} className="p-2 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-lg transition-colors" title="Pause Subscription">
                      <FiPause />
                    </button>
                    <button onClick={() => handleCancel(sub.id)} className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-colors" title="Cancel Subscription">
                      <FiX />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center">
            <p className="text-neutral-400 mb-2">You don't have any active autoship subscriptions.</p>
            <p className="text-sm text-neutral-500">Subscribe to a bundle below to lock in savings.</p>
          </div>
        )}
      </section>

      {/* Available Bundles Section */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <FiTag className="text-amber-400" /> Available Bundles
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {bundles.map(bundle => (
            <div key={bundle.id} className="bg-neutral-900 border border-neutral-800 hover:border-amber-500/50 rounded-2xl p-6 transition-all group shadow-lg">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-black text-white">{bundle.name}</h3>
                <span className="bg-amber-500/20 text-amber-400 text-xs font-bold px-2.5 py-1 rounded-full">
                  SAVE {bundle.savingsPercent}%
                </span>
              </div>
              
              <div className="mb-4">
                <span className="text-3xl font-black text-emerald-400">${bundle.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                <span className="text-neutral-500 ml-2">/ shipment</span>
              </div>
              
              <div className="mb-6">
                <div className="text-xs text-neutral-500 font-bold mb-2">BUNDLE INCLUDES:</div>
                <ul className="text-sm text-neutral-300 space-y-1.5">
                  {bundle.items.map((item: string, i: number) => (
                    <li key={i} className="flex items-center gap-2">
                      <FiCheckCircle className="text-amber-500 shrink-0" size={14} /> {item}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="pt-4 border-t border-neutral-800">
                <div className="text-xs text-neutral-500 font-bold mb-2">SELECT FREQUENCY:</div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select 
                    className="bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-amber-500 flex-1 appearance-none cursor-pointer"
                    id={`freq-${bundle.id}`}
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Biannual">Bi-Annual</option>
                  </select>
                  <button 
                    onClick={() => {
                      const select = document.getElementById(`freq-${bundle.id}`) as HTMLSelectElement
                      handleSubscribe(bundle.id, select.value)
                    }}
                    className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold py-2.5 px-6 rounded-xl transition-colors sm:w-auto w-full"
                  >
                    Subscribe
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
