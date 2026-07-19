"use client"
import { useState, useEffect } from "react"
import { FiFileText, FiShoppingBag, FiTruck, FiBox, FiDollarSign, FiCheckCircle } from "react-icons/fi"

interface DocumentLifecycleProps {
  zohoId: string
  type: 'Invoice' | 'SalesOrder' | 'Quote'
}

export function DocumentLifecycle({ zohoId, type }: DocumentLifecycleProps) {
  const [lifecycle, setLifecycle] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLifecycle()
  }, [zohoId])

  const fetchLifecycle = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/document-lifecycle?zohoId=${zohoId}&type=${type}`)
      const data = await res.json()
      if (data.success) {
        setLifecycle(data.lifecycle)
      }
    } catch (e) {
      console.error("Failed to fetch lifecycle", e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-neutral-500 text-sm animate-pulse flex items-center justify-center p-4">Loading connections...</div>
  }

  if (!lifecycle) return null

  const { quote, salesOrder, purchaseOrders, packages, invoices, payments } = lifecycle

  const Node = ({ icon: Icon, title, subtitle, color, isCompleted, onClick }: any) => (
    <div 
      onClick={onClick}
      className={`flex flex-col items-center gap-2 relative ${onClick ? 'cursor-pointer hover:scale-105 transition-transform' : 'opacity-50'}`}
    >
      <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 z-10 bg-[#0f1013] ${isCompleted ? `border-${color}-500 text-${color}-500` : 'border-neutral-700 text-neutral-600'}`}>
        <Icon size={20} />
      </div>
      <div className="text-center">
        <p className={`text-xs font-bold ${isCompleted ? 'text-white' : 'text-neutral-500'}`}>{title}</p>
        <p className="text-[10px] text-neutral-500 truncate max-w-[80px]">{subtitle}</p>
      </div>
    </div>
  )

  const Line = ({ active }: { active: boolean }) => (
    <div className={`h-1 flex-1 mx-2 mt-6 rounded ${active ? 'bg-emerald-500/50' : 'bg-neutral-800'}`} />
  )

  const openDoc = (docType: string, data: any) => {
    if (!data) return
    alert(`Document Type: ${docType}\nNumber: ${data.items?.estimateNumber || data.items?.salesOrderNumber || data.items?.invoiceNumber || data.packageNumber || data.paymentNumber}\nZoho ID: ${data.zohoId}`)
  }

  return (
    <div className="bg-neutral-900/50 border border-white/5 rounded-xl p-6">
      <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-wider">Document Lifecycle</h3>
      <div className="flex items-start justify-between">
        
        {/* Quote */}
        <Node 
          icon={FiFileText} 
          title="Quote" 
          subtitle={quote?.items?.estimateNumber || 'N/A'} 
          color="emerald"
          isCompleted={!!quote}
          onClick={() => openDoc('Quote', quote)}
        />

        <Line active={!!salesOrder} />

        {/* Sales Order */}
        <Node 
          icon={FiShoppingBag} 
          title="Sales Order" 
          subtitle={salesOrder?.items?.salesOrderNumber || 'N/A'} 
          color="emerald"
          isCompleted={!!salesOrder}
          onClick={() => openDoc('Sales Order', salesOrder)}
        />

        <Line active={invoices.length > 0 || packages.length > 0} />

        {/* Fulfillment / PO */}
        <div className="flex flex-col gap-4 w-24">
          <Node 
            icon={FiTruck} 
            title="PO" 
            subtitle={purchaseOrders[0]?.items?.purchaseorder_number || `${purchaseOrders.length} POs`} 
            color="emerald"
            isCompleted={purchaseOrders.length > 0}
            onClick={() => purchaseOrders.length > 0 && openDoc('Purchase Order', purchaseOrders[0])}
          />
          <Node 
            icon={FiBox} 
            title="Package" 
            subtitle={packages[0]?.packageNumber || `${packages.length} Pkgs`} 
            color="emerald"
            isCompleted={packages.length > 0}
            onClick={() => packages.length > 0 && openDoc('Package', packages[0])}
          />
        </div>

        <Line active={invoices.length > 0} />

        {/* Invoice */}
        <Node 
          icon={FiDollarSign} 
          title="Invoice" 
          subtitle={invoices[0]?.items?.invoiceNumber || 'N/A'} 
          color="emerald"
          isCompleted={invoices.length > 0}
          onClick={() => invoices.length > 0 && openDoc('Invoice', invoices[0])}
        />

        <Line active={payments.length > 0} />

        {/* Payment */}
        <Node 
          icon={FiCheckCircle} 
          title="Paid" 
          subtitle={payments.length > 0 ? `${payments.length} Payments` : 'Unpaid'} 
          color="emerald"
          isCompleted={payments.length > 0}
          onClick={() => payments.length > 0 && openDoc('Payment', payments[0])}
        />

      </div>
    </div>
  )
}
