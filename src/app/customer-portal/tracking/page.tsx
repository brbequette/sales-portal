"use client"

import { useEffect, useState } from "react"
import { FiTruck, FiBox, FiCheckCircle, FiExternalLink, FiClock, FiMapPin } from "react-icons/fi"

export default function TrackingPage() {
  const [shipments, setShipments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTracking = async () => {
      const token = localStorage.getItem("td_customer_token")
      if (!token) return

      try {
        const res = await fetch("/api/customer/tracking", {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          setShipments(data.shipments || [])
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchTracking()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Tracking & Shipments</h1>
        <p className="text-neutral-400">Track your orders from our warehouse to your job site.</p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : shipments.length > 0 ? (
        <div className="space-y-6">
          {shipments.map(shipment => (
            <div key={shipment.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-lg">
              {/* Header */}
              <div className="p-5 border-b border-neutral-800 bg-neutral-950/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-bold text-white">Order #{shipment.orderNumber}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      shipment.status === 'Delivered' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      shipment.status === 'In Transit' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                      'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {shipment.status}
                    </span>
                  </div>
                  <div className="text-sm text-neutral-400 flex items-center gap-4">
                    <span>Carrier: <strong className="text-white">{shipment.carrier}</strong></span>
                    <span>Tracking: <strong className="font-mono text-white">{shipment.trackingNumber}</strong></span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="text-sm text-neutral-400 text-right">
                    Estimated Delivery: <br/>
                    <strong className="text-white text-base">{shipment.estimatedDelivery ? new Date(shipment.estimatedDelivery).toLocaleDateString() : 'Pending'}</strong>
                  </div>
                  {shipment.trackingUrl && (
                    <a 
                      href={shipment.trackingUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs bg-white/10 hover:bg-white/20 text-white font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-colors"
                    >
                      Carrier Tracking <FiExternalLink />
                    </a>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div className="p-6">
                <div className="text-xs font-bold text-neutral-500 mb-4">SHIPMENT TIMELINE</div>
                <div className="relative pl-6 space-y-6">
                  {/* Vertical Line */}
                  <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-neutral-800 rounded-full"></div>
                  
                  {shipment.events?.map((event: any, i: number) => {
                    const isLast = i === 0 // Assuming events are reverse chronological
                    const Icon = event.status === 'Delivered' ? FiCheckCircle :
                                 event.status === 'In Transit' ? FiTruck :
                                 event.status === 'Label Created' ? FiBox : FiClock;
                    
                    return (
                      <div key={i} className={`relative ${isLast ? 'opacity-100' : 'opacity-60'}`}>
                        <div className={`absolute -left-[30px] w-6 h-6 rounded-full flex items-center justify-center border-4 border-neutral-900 ${
                          isLast ? 'bg-amber-500 text-neutral-900' : 'bg-neutral-700 text-neutral-400'
                        }`}>
                          <Icon size={10} />
                        </div>
                        <div>
                          <div className={`font-bold ${isLast ? 'text-white' : 'text-neutral-300'}`}>
                            {event.status}
                          </div>
                          <div className="text-sm text-neutral-400 mt-0.5">
                            {event.location && <span className="mr-2"><FiMapPin className="inline mr-1" size={12}/>{event.location}</span>}
                            {new Date(event.date).toLocaleString()}
                          </div>
                          {event.description && (
                            <p className="text-sm text-neutral-500 mt-1">{event.description}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {!shipment.events?.length && (
                    <div className="text-sm text-neutral-500">Tracking information is not yet available for this shipment.</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-neutral-900 border border-neutral-800 rounded-2xl">
          <FiTruck className="mx-auto mb-4 text-neutral-600" size={48} />
          <h3 className="text-xl font-bold text-white mb-2">No Active Shipments</h3>
          <p className="text-neutral-400 max-w-md mx-auto">You don't have any recent shipments. When you place an order, tracking information will appear here.</p>
        </div>
      )}
    </div>
  )
}
