"use client"
import { useState, useEffect, useCallback } from "react"
import { FiTruck, FiBox, FiPackage, FiCheck, FiSearch, FiMapPin, FiExternalLink, FiChevronDown, FiChevronUp, FiRefreshCw, FiDownloadCloud } from "react-icons/fi"
import { CreatePackageModal } from "@/components/CreatePackageModal"
import { CreateDropshipmentModal } from "@/components/CreateDropshipmentModal"

type ShipStatus = "all" | "needs_packaging" | "packaged" | "shipped" | "delivered"

interface ShippingOrder {
  id: string
  zohoId: string
  soNumber: string
  customerName: string
  accountId: string
  orderDate: string
  amount: number
  status: string
  shipStatus: ShipStatus
  shippingAddress: any
  lineItemCount: number
  lineItemNames: string[]
  salesperson: string
  packages: PackageInfo[]
  dropshipments: DropshipInfo[]
}

interface PackageInfo {
  id: string
  zohoId: string
  packageNumber: string
  date: string
  status: string
  carrier: string
  trackingNumber: string
  shippingCharge: number
  items: any
}

interface DropshipInfo {
  id: string
  zohoId: string
  vendorName: string
  date: string
  total: number
  status: string
  trackingNumber: string
}

const STATUS_TABS: { key: ShipStatus; label: string; icon: any; color: string; bg: string }[] = [
  { key: "all", label: "All Orders", icon: FiTruck, color: "text-neutral-300", bg: "bg-neutral-800" },
  { key: "needs_packaging", label: "Needs Packaging", icon: FiBox, color: "text-amber-400", bg: "bg-amber-950/50" },
  { key: "packaged", label: "Packaged", icon: FiPackage, color: "text-blue-400", bg: "bg-blue-950/50" },
  { key: "shipped", label: "Shipped", icon: FiTruck, color: "text-purple-400", bg: "bg-purple-950/50" },
  { key: "delivered", label: "Delivered", icon: FiCheck, color: "text-emerald-400", bg: "bg-emerald-950/50" },
]

const CARRIERS = ["FedEx", "UPS", "USPS", "DHL", "Amazon", "OnTrac", "LTL Freight", "Customer Pickup", "Other"]

function getTrackingUrl(carrier: string, tracking: string): string | null {
  if (!tracking) return null
  const c = carrier?.toLowerCase() || ""
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${tracking}`
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${tracking}`
  if (c.includes("usps")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tracking}`
  if (c.includes("dhl")) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${tracking}`
  if (c.includes("amazon")) return `https://track.amazon.com/tracking/${tracking}`
  return null
}

function formatAddress(addr: any): string {
  if (!addr) return "—"
  if (typeof addr === "string") return addr
  const parts = [addr.address, addr.street2, addr.city, addr.state, addr.zip || addr.code, addr.country].filter(Boolean)
  return parts.join(", ") || "—"
}

export default function ShippingPage() {
  const [orders, setOrders] = useState<ShippingOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ShipStatus>("needs_packaging")
  const [search, setSearch] = useState("")
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  // Tracking modal state
  const [trackingModal, setTrackingModal] = useState<{ packageId: string; carrier: string; tracking: string } | null>(null)
  const [trackingSubmitting, setTrackingSubmitting] = useState(false)

  // Package creation state
  const [packageModal, setPackageModal] = useState<{ salesOrderId: string; lineItems: any[] } | null>(null)
  const [dropshipModal, setDropshipModal] = useState<{ salesOrderId: string; lineItems: any[] } | null>(null)
  const [fetchingLineItems, setFetchingLineItems] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: activeTab, search, limit: "200" })
      const res = await fetch(`/api/shipping?${params}`)
      const data = await res.json()
      if (data.success) {
        setOrders(data.data)
        setCounts(data.counts)
      }
    } catch (e) {
      console.error("Failed to fetch shipping data:", e)
    } finally {
      setLoading(false)
    }
  }, [activeTab, search])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  // Sync packages from Zoho
  const handleSyncPackages = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch("/api/admin/books/sync-packages", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setSyncResult(`✅ ${data.message}`)
        fetchOrders()
      } else {
        setSyncResult(`❌ ${data.error}`)
      }
    } catch (e: any) {
      setSyncResult(`❌ ${e.message}`)
    } finally {
      setSyncing(false)
    }
  }

  // Fetch SO line items from Zoho for package creation
  const fetchLineItems = async (zohoId: string, action: "package" | "dropship") => {
    setFetchingLineItems(zohoId)
    try {
      const res = await fetch(`/api/zoho-fulfillment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "GetSalesOrder", salesOrderId: zohoId }),
      })
      const data = await res.json()
      if (data.success && data.lineItems) {
        if (action === "package") {
          setPackageModal({ salesOrderId: zohoId, lineItems: data.lineItems })
        } else {
          setDropshipModal({ salesOrderId: zohoId, lineItems: data.lineItems })
        }
      } else {
        alert("Failed to load line items: " + (data.error || data.message || "Unknown error"))
      }
    } catch (e: any) {
      alert("Error: " + e.message)
    } finally {
      setFetchingLineItems(null)
    }
  }

  // Add tracking
  const handleAddTracking = async () => {
    if (!trackingModal) return
    setTrackingSubmitting(true)
    try {
      const res = await fetch("/api/shipping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addTracking",
          packageId: trackingModal.packageId,
          carrier: trackingModal.carrier,
          trackingNumber: trackingModal.tracking,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setTrackingModal(null)
        fetchOrders()
      } else {
        alert("Failed: " + data.error)
      }
    } catch (e: any) {
      alert("Error: " + e.message)
    } finally {
      setTrackingSubmitting(false)
    }
  }

  // Mark shipped/delivered
  const handleStatusChange = async (packageId: string, action: "markShipped" | "markDelivered") => {
    try {
      const res = await fetch("/api/shipping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, packageId }),
      })
      const data = await res.json()
      if (data.success) fetchOrders()
      else alert("Failed: " + data.error)
    } catch (e: any) {
      alert("Error: " + e.message)
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-600/20 flex items-center justify-center">
            <FiTruck className="text-orange-400 text-xl" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Shipping Center</h1>
            <p className="text-xs text-neutral-500">Manage packages, tracking & shipments</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncPackages}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-800/50 text-sm font-bold transition-all disabled:opacity-50"
          >
            <FiDownloadCloud className={syncing ? "animate-pulse" : ""} />
            {syncing ? "Syncing..." : "Sync from Zoho"}
          </button>
          <button
            onClick={fetchOrders}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm font-bold transition-all"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* Sync Result Banner */}
      {syncResult && (
        <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-bold border ${
          syncResult.startsWith("✅") ? "bg-emerald-950/30 text-emerald-400 border-emerald-800/50" : "bg-red-950/30 text-red-400 border-red-800/50"
        }`}>
          {syncResult}
          <button onClick={() => setSyncResult(null)} className="ml-3 text-neutral-500 hover:text-white">✕</button>
        </div>
      )}

      {/* Status Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2 -mx-1 px-1">
        {STATUS_TABS.map(tab => {
          const count = counts[tab.key] || 0
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all border ${
                isActive
                  ? `${tab.bg} ${tab.color} border-current shadow-lg`
                  : "bg-neutral-900/50 text-neutral-500 border-neutral-800 hover:bg-neutral-800 hover:text-neutral-300"
              }`}
            >
              <tab.icon className="text-base" />
              {tab.label}
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                isActive ? "bg-white/10" : "bg-neutral-800"
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
        <input
          type="text"
          placeholder="Search by SO #, customer, or salesperson..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-neutral-900/70 border border-neutral-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-orange-500/50 transition-colors"
        />
      </div>

      {/* Orders Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20">
          <FiPackage className="text-4xl text-neutral-700 mx-auto mb-3" />
          <p className="text-neutral-500 font-bold">No orders found</p>
          <p className="text-neutral-600 text-sm mt-1">Try changing the filter or search term</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map(order => {
            const isExpanded = expandedOrder === order.id
            const statusColor: Record<string, string> = {
              needs_packaging: "text-amber-400 bg-amber-950/40 border-amber-800/50",
              packaged: "text-blue-400 bg-blue-950/40 border-blue-800/50",
              shipped: "text-purple-400 bg-purple-950/40 border-purple-800/50",
              delivered: "text-emerald-400 bg-emerald-950/40 border-emerald-800/50",
            }

            const statusLabels: Record<string, string> = {
              needs_packaging: "Needs Packaging",
              packaged: "Packaged",
              shipped: "Shipped",
              delivered: "Delivered",
            }

            const currentColor = statusColor[order.shipStatus] || "text-neutral-400 bg-neutral-800 border-neutral-700"
            const statusLabel = statusLabels[order.shipStatus] || order.shipStatus

            return (
              <div key={order.id} className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl overflow-hidden hover:border-neutral-700 transition-all">
                {/* Main Row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                >
                  {/* Status Badge */}
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${currentColor}`}>
                    {statusLabel}
                  </span>

                  {/* SO Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-sm">{order.soNumber || "—"}</span>
                      <span className="text-neutral-600 text-xs">•</span>
                      <span className="text-neutral-400 text-sm truncate">{order.customerName}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] text-neutral-600">
                        {order.orderDate ? new Date(order.orderDate).toLocaleDateString() : "—"}
                      </span>
                      <span className="text-[10px] text-neutral-600">
                        {order.lineItemCount} item{order.lineItemCount !== 1 ? "s" : ""}
                      </span>
                      {order.salesperson && (
                        <span className="text-[10px] text-neutral-600">{order.salesperson}</span>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <span className="text-white font-black text-sm">
                    ${order.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>

                  {/* Packages count */}
                  {order.packages.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-neutral-400 bg-neutral-800 px-2 py-1 rounded-lg">
                      <FiPackage className="text-[10px]" /> {order.packages.length}
                    </span>
                  )}

                  {/* Dropshipments count */}
                  {order.dropshipments?.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-orange-400 bg-orange-950/30 px-2 py-1 rounded-lg">
                      <FiTruck className="text-[10px]" /> {order.dropshipments.length} DS
                    </span>
                  )}

                  {/* Expand chevron */}
                  {isExpanded ? <FiChevronUp className="text-neutral-500" /> : <FiChevronDown className="text-neutral-500" />}
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-neutral-800/50 pt-3 space-y-4">
                    {/* Shipping Address + Actions row */}
                    <div className="flex flex-col md:flex-row gap-4">
                      {/* Address */}
                      <div className="flex-1 bg-neutral-950/50 rounded-xl p-3 border border-neutral-800/50">
                        <div className="flex items-center gap-2 mb-2">
                          <FiMapPin className="text-orange-400 text-xs" />
                          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Shipping Address</span>
                        </div>
                        <p className="text-sm text-neutral-300">{formatAddress(order.shippingAddress)}</p>
                      </div>

                      {/* Items Preview */}
                      <div className="flex-1 bg-neutral-950/50 rounded-xl p-3 border border-neutral-800/50">
                        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Line Items</div>
                        {order.lineItemNames.length > 0 ? (
                          <div className="space-y-1">
                            {order.lineItemNames.map((name, i) => (
                              <p key={i} className="text-sm text-neutral-300 truncate">{name}</p>
                            ))}
                            {order.lineItemCount > 3 && (
                              <p className="text-[10px] text-neutral-600">+{order.lineItemCount - 3} more</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-neutral-600">No item data</p>
                        )}
                      </div>
                    </div>

                    {/* Packages List */}
                    {order.packages.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Packages</div>
                        <div className="space-y-2">
                          {order.packages.map(pkg => (
                            <div key={pkg.id} className="bg-neutral-950/50 border border-neutral-800/50 rounded-xl p-3 flex flex-col md:flex-row md:items-center gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <FiPackage className="text-blue-400 text-xs" />
                                  <span className="text-sm font-bold text-white">{pkg.packageNumber || pkg.zohoId}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                    pkg.status === "delivered" ? "text-emerald-400 bg-emerald-950/50" :
                                    pkg.status === "shipped" ? "text-purple-400 bg-purple-950/50" :
                                    "text-blue-400 bg-blue-950/50"
                                  }`}>
                                    {pkg.status || "created"}
                                  </span>
                                </div>
                                {pkg.trackingNumber && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] text-neutral-500">{pkg.carrier || "Carrier"}</span>
                                    <span className="text-xs text-neutral-300 font-mono">{pkg.trackingNumber}</span>
                                    {(() => {
                                      const url = getTrackingUrl(pkg.carrier, pkg.trackingNumber)
                                      return url ? (
                                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 text-xs">
                                          <FiExternalLink />
                                        </a>
                                      ) : null
                                    })()}
                                  </div>
                                )}
                              </div>

                              {/* Package Actions */}
                              <div className="flex gap-2 flex-wrap">
                                {!pkg.trackingNumber && (
                                  <button
                                    onClick={() => setTrackingModal({ packageId: pkg.id, carrier: pkg.carrier || "", tracking: "" })}
                                    className="px-3 py-1.5 rounded-lg bg-purple-600/20 text-purple-400 border border-purple-800/50 text-[10px] font-bold uppercase hover:bg-purple-600/30 transition-all"
                                  >
                                    Add Tracking
                                  </button>
                                )}
                                {pkg.status !== "shipped" && pkg.status !== "delivered" && pkg.trackingNumber && (
                                  <button
                                    onClick={() => handleStatusChange(pkg.id, "markShipped")}
                                    className="px-3 py-1.5 rounded-lg bg-purple-600/20 text-purple-400 border border-purple-800/50 text-[10px] font-bold uppercase hover:bg-purple-600/30 transition-all"
                                  >
                                    Mark Shipped
                                  </button>
                                )}
                                {pkg.status !== "delivered" && (
                                  <button
                                    onClick={() => handleStatusChange(pkg.id, "markDelivered")}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-800/50 text-[10px] font-bold uppercase hover:bg-emerald-600/30 transition-all"
                                  >
                                    Mark Delivered
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dropshipments List */}
                    {order.dropshipments?.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Dropshipments</div>
                        <div className="space-y-2">
                          {order.dropshipments.map(ds => (
                            <div key={ds.id} className="bg-orange-950/20 border border-orange-800/30 rounded-xl p-3 flex flex-col md:flex-row md:items-center gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <FiTruck className="text-orange-400 text-xs" />
                                  <span className="text-sm font-bold text-white">{ds.vendorName || "Vendor"}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                    ds.status === "received" || ds.status === "billed" ? "text-emerald-400 bg-emerald-950/50" :
                                    ds.status === "issued" ? "text-purple-400 bg-purple-950/50" :
                                    "text-orange-400 bg-orange-950/50"
                                  }`}>
                                    {ds.status || "draft"}
                                  </span>
                                  <span className="text-[10px] text-neutral-500 font-mono">${ds.total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                {ds.trackingNumber && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-neutral-300 font-mono">{ds.trackingNumber}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 flex-wrap pt-2 border-t border-neutral-800/30">
                      <button
                        onClick={() => fetchLineItems(order.zohoId, "package")}
                        disabled={fetchingLineItems === order.zohoId}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-800/50 text-xs font-bold hover:bg-blue-600/30 transition-all disabled:opacity-50"
                      >
                        <FiBox /> {fetchingLineItems === order.zohoId ? "Loading..." : "Create Package"}
                      </button>
                      <button
                        onClick={() => fetchLineItems(order.zohoId, "dropship")}
                        disabled={fetchingLineItems === order.zohoId}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600/20 text-orange-400 border border-orange-800/50 text-xs font-bold hover:bg-orange-600/30 transition-all disabled:opacity-50"
                      >
                        <FiTruck /> Create Dropshipment
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Tracking Modal */}
      {trackingModal && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setTrackingModal(null)} />
          <div className="relative bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <FiTruck className="text-purple-400" /> Add Tracking Info
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Carrier</label>
                <select
                  value={trackingModal.carrier}
                  onChange={e => setTrackingModal({ ...trackingModal, carrier: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"
                >
                  <option value="">Select carrier...</option>
                  {CARRIERS.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Tracking Number</label>
                <input
                  type="text"
                  value={trackingModal.tracking}
                  onChange={e => setTrackingModal({ ...trackingModal, tracking: e.target.value })}
                  placeholder="Enter tracking number..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-purple-500/50"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-5 mt-5 border-t border-neutral-800">
              <button onClick={() => setTrackingModal(null)} className="px-4 py-2 text-neutral-400 hover:text-white font-bold text-sm">
                Cancel
              </button>
              <button
                onClick={handleAddTracking}
                disabled={trackingSubmitting || !trackingModal.carrier || !trackingModal.tracking}
                className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2 rounded-xl font-bold text-sm shadow-lg shadow-purple-900/20 disabled:opacity-50 transition-all"
              >
                {trackingSubmitting ? "Saving..." : "Save Tracking"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Package Creation Modal */}
      {packageModal && (
        <CreatePackageModal
          salesOrderId={packageModal.salesOrderId}
          lineItems={packageModal.lineItems}
          onClose={() => setPackageModal(null)}
          onSuccess={(_id: string) => { setPackageModal(null); fetchOrders() }}
        />
      )}

      {/* Dropshipment Modal */}
      {dropshipModal && (
        <CreateDropshipmentModal
          salesOrderId={dropshipModal.salesOrderId}
          lineItems={dropshipModal.lineItems}
          onClose={() => setDropshipModal(null)}
          onSuccess={(_poId: string) => { setDropshipModal(null); fetchOrders() }}
        />
      )}
    </div>
  )
}
