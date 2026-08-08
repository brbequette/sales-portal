"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  FiAlertTriangle,
  FiRefreshCw,
  FiCheckCircle,
  FiTruck,
  FiUpload,
  FiCheckSquare,
  FiSquare,
  FiDollarSign,
  FiPackage,
  FiArrowRight,
  FiCalendar,
  FiFileText,
  FiPlus,
  FiCheck
} from "react-icons/fi"

interface LineItem {
  name: string
  sku: string
  quantity: number
  rate: number
  isCovered: boolean
}

interface InvoiceAudit {
  id: string
  zohoId: string
  invoiceNumber: string
  customerName: string
  amount: number
  issueDate: string
  status: string
  actualShippingCost: number
  shippingCostBreakdown: string | null
  lineItems: LineItem[]
  totalItemsCount: number
  missingItemsCount: number
  isFullyCovered: boolean
}

export default function ShippingAuditPage() {
  const [invoices, setInvoices] = useState<InvoiceAudit[]>([])
  const [loading, setLoading] = useState(true)

  // Selection & Assignment State
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceAudit | null>(null)
  const [selectedSkus, setSelectedSkus] = useState<string[]>([])
  const [shippingCostInput, setShippingCostInput] = useState("")
  const [carrierInput, setCarrierInput] = useState("UPS Ground")
  const [trackingInput, setTrackingInput] = useState("")
  const [assigning, setAssigning] = useState(false)
  const [assignSuccess, setAssignSuccess] = useState("")

  // Extrapolator State
  const [vendorText, setVendorText] = useState("")
  const [parsing, setParsing] = useState(false)
  const [parsedData, setParsedData] = useState<any>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/shipping/missing-shipping")
      const data = await res.json()
      if (data.success) {
        setInvoices(data.invoices)
      }
    } catch (e) {
      console.error("Error fetching missing shipping invoices:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSelectInvoice = (inv: InvoiceAudit) => {
    setSelectedInvoice(inv)
    setSelectedSkus([])
    setShippingCostInput("")
    setAssignSuccess("")
  }

  const toggleSkuSelection = (sku: string) => {
    if (selectedSkus.includes(sku)) {
      setSelectedSkus(selectedSkus.filter(s => s !== sku))
    } else {
      setSelectedSkus([...selectedSkus, sku])
    }
  }

  const selectAllSkus = (inv: InvoiceAudit) => {
    if (selectedSkus.length === inv.lineItems.length) {
      setSelectedSkus([])
    } else {
      setSelectedSkus(inv.lineItems.map(it => it.sku))
    }
  }

  const handleAssignShipping = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedInvoice || !shippingCostInput || selectedSkus.length === 0) return

    setAssigning(true)
    setAssignSuccess("")
    try {
      const res = await fetch("/api/admin/shipping/assign-shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: selectedInvoice.zohoId,
          selectedItemSkus: selectedSkus,
          shippingCost: parseFloat(shippingCostInput),
          carrier: carrierInput,
          trackingNumber: trackingInput,
        })
      })
      const data = await res.json()
      if (data.success) {
        setAssignSuccess(data.message)
        setShippingCostInput("")
        setTrackingInput("")
        setSelectedSkus([])
        fetchData()
      } else {
        alert(data.error || "Failed to assign shipping cost")
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setAssigning(false)
    }
  }

  const handleParseVendorInvoice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vendorText.trim()) return
    setParsing(true)
    setParsedData(null)
    try {
      const res = await fetch("/api/admin/shipping/upload-vendor-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: vendorText })
      })
      const data = await res.json()
      if (data.success) {
        setParsedData(data)
        if (data.matchedInvoice) {
          const match = invoices.find(i => i.zohoId === data.matchedInvoice.zohoId)
          if (match) {
            setSelectedInvoice(match)
            if (data.extrapolatedData.cost > 0) {
              setShippingCostInput(data.extrapolatedData.cost.toString())
            }
            if (data.extrapolatedData.trackingNumber) {
              setTrackingInput(data.extrapolatedData.trackingNumber)
            }
          }
        }
      }
    } catch (e: any) {
      alert(e.message)
    } finally {
      setParsing(false)
    }
  }

  return (
    <div className="page-content">
      {/* ─── Header ─────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center">
            <FiTruck className="text-blue-400" size={17} />
          </div>
          <div>
            <h1 className="page-title">Shipping Audit &amp; Vendor Invoice Extrapolator</h1>
            <p className="page-subtitle">Identify items missing shipping costs and parse vendor freight bills</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="td-btn td-btn-ghost td-btn-sm disabled:opacity-50"
        >
          <FiRefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh Audit List
        </button>
      </div>

      {/* ─── Body ───────────────────────────────────── */}
      <div className="page-body animate-fade-in space-y-6">

        {/* Vendor Invoice AI Extrapolator Section */}
        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <FiUpload className="text-cyan-400" />
            Vendor Freight Invoice Extrapolator
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            Paste the text or content from a vendor shipping bill, freight invoice, or UPS statement to extract costs & match to an invoice.
          </p>

          <form onSubmit={handleParseVendorInvoice} className="space-y-4">
            <textarea
              rows={3}
              value={vendorText}
              onChange={(e) => setVendorText(e.target.value)}
              placeholder="Paste Freight Bill text here (e.g. UPS Invoice #9921, Tracking 1Z99..., Total: $145.00 for PO-10917)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={parsing || !vendorText.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold py-2.5 px-5 rounded-lg transition flex items-center gap-2"
            >
              {parsing ? <FiRefreshCw className="animate-spin" /> : <FiFileText />}
              {parsing ? "Parsing Freight Bill..." : "Parse & Extrapolate Shipping Info"}
            </button>
          </form>

          {parsedData && (
            <div className="mt-4 bg-slate-950/80 border border-cyan-500/30 rounded-xl p-4 space-y-2 text-sm text-cyan-300">
              <div className="font-bold flex items-center gap-2 text-white">
                <FiCheckCircle className="text-emerald-400" /> Extrapolated Data:
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>Extrapolated Cost: <span className="font-bold text-white">${parsedData.extrapolatedData.cost.toFixed(2)}</span></div>
                <div>Tracking #: <span className="font-bold text-white">{parsedData.extrapolatedData.trackingNumber || "N/A"}</span></div>
                <div>PO/Invoice Ref: <span className="font-bold text-white">{parsedData.extrapolatedData.referenceNumber || "N/A"}</span></div>
              </div>
              {parsedData.matchedInvoice && (
                <div className="pt-2 text-emerald-400 border-t border-slate-800 flex items-center gap-2">
                  <FiCheck className="text-lg" /> Matched to Customer Invoice <span className="font-bold text-white">#{parsedData.matchedInvoice.invoiceNumber}</span> ({parsedData.matchedInvoice.customerName})!
                </div>
              )}
            </div>
          )}
        </div>

        {/* Flagged Invoices & Line-Item Selection Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: List of Invoices Missing Shipping Costs */}
          <div className="lg:col-span-7 space-y-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <FiAlertTriangle className="text-amber-400" />
              Invoices Missing Item Shipping Costs ({invoices.length})
            </h2>

            {loading ? (
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center text-slate-400 gap-3">
                <FiRefreshCw className="animate-spin text-3xl text-blue-400" />
                <span>Auditing invoice shipping coverage...</span>
              </div>
            ) : invoices.length === 0 ? (
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                <FiCheckCircle className="text-4xl text-emerald-400" />
                <span className="font-semibold text-white">All Active Invoices Have Shipping Costs</span>
                <span>No invoices with unassigned shipping items found!</span>
              </div>
            ) : (
              <div className="space-y-3">
                {invoices.map((inv) => {
                  const isSelected = selectedInvoice?.id === inv.id
                  return (
                    <div
                      key={inv.id}
                      onClick={() => handleSelectInvoice(inv)}
                      className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-blue-950/40 border-blue-500 shadow-lg shadow-blue-500/10"
                          : "bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-white text-lg">Invoice #{inv.invoiceNumber}</div>
                          <div className="text-sm text-slate-400">{inv.customerName}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-white">${inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div className="text-xs text-amber-400 font-medium mt-1">
                            {inv.missingItemsCount} of {inv.totalItemsCount} items missing shipping
                          </div>
                        </div>
                      </div>

                      {/* Items Preview */}
                      <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap gap-2">
                        {inv.lineItems.map((item, idx) => (
                          <span
                            key={idx}
                            className={`text-xs px-2.5 py-1 rounded-md border ${
                              item.isCovered
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                : "bg-amber-500/10 border-amber-500/30 text-amber-300 font-semibold"
                            }`}
                          >
                            {item.quantity}x {item.sku || item.name} {item.isCovered ? "✓" : "⚠️ Needs Shipping"}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right Column: Multi-Item Selection & Shared Shipping Form */}
          <div className="lg:col-span-5">
            {selectedInvoice ? (
              <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 space-y-6 sticky top-6 shadow-2xl">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-blue-400 mb-1">
                    Assign Shared Shipping Cost
                  </div>
                  <h3 className="text-2xl font-bold text-white">Invoice #{selectedInvoice.invoiceNumber}</h3>
                  <p className="text-sm text-slate-400">{selectedInvoice.customerName}</p>
                </div>

                {/* Line Item Checkboxes */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-slate-200">
                      Select Line Items Sharing This Shipping Cost:
                    </label>
                    <button
                      type="button"
                      onClick={() => selectAllSkus(selectedInvoice)}
                      className="text-xs text-blue-400 hover:text-blue-300 transition font-medium"
                    >
                      {selectedSkus.length === selectedInvoice.lineItems.length ? "Deselect All" : "Select All"}
                    </button>
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {selectedInvoice.lineItems.map((item, idx) => {
                      const isChecked = selectedSkus.includes(item.sku)
                      return (
                        <div
                          key={idx}
                          onClick={() => toggleSkuSelection(item.sku)}
                          className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                            isChecked
                              ? "bg-blue-600/20 border-blue-500 text-white"
                              : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {isChecked ? (
                              <FiCheckSquare className="text-blue-400 text-lg flex-shrink-0" />
                            ) : (
                              <FiSquare className="text-slate-500 text-lg flex-shrink-0" />
                            )}
                            <div>
                              <div className="font-semibold text-sm">{item.quantity}x {item.sku || item.name}</div>
                              <div className="text-xs text-slate-500">${item.rate.toFixed(2)} each</div>
                            </div>
                          </div>
                          {item.isCovered && (
                            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-medium">
                              Already Covered
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Shared Shipping Cost Form */}
                <form onSubmit={handleAssignShipping} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-1">
                      Shared Shipping Cost Amount ($)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2.5 text-slate-500 font-bold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={shippingCostInput}
                        onChange={(e) => setShippingCostInput(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 pl-8 pr-4 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Carrier / Method</label>
                      <input
                        type="text"
                        value={carrierInput}
                        onChange={(e) => setCarrierInput(e.target.value)}
                        placeholder="UPS / FedEx / Freight"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Tracking / PRO #</label>
                      <input
                        type="text"
                        value={trackingInput}
                        onChange={(e) => setTrackingInput(e.target.value)}
                        placeholder="1Z9999..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={assigning || selectedSkus.length === 0 || !shippingCostInput}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 px-5 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10"
                  >
                    {assigning ? <FiRefreshCw className="animate-spin" /> : <FiTruck />}
                    {assigning
                      ? "Assigning..."
                      : `Assign Shared Shipping to ${selectedSkus.length} Selected Item(s)`}
                  </button>
                </form>

                {assignSuccess && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-emerald-300 text-xs flex items-center gap-2">
                    <FiCheckCircle className="text-base flex-shrink-0" />
                    <span>{assignSuccess}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-900/30 border border-slate-800 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-slate-500 gap-3 text-center">
                <FiTruck className="text-4xl text-slate-600" />
                <span className="font-semibold text-slate-400">Select an Invoice to Assign Shipping</span>
                <span className="text-xs max-w-xs">
                  Click on any invoice on the left to view line items, check items sharing a cost, and assign a shipping fee.
                </span>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  )
}
