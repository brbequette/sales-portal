"use client"

import { useState, useEffect } from "react"
import { FiFileText, FiShoppingBag, FiTruck, FiBox, FiDollarSign, FiCheckCircle } from "react-icons/fi"
import { toast } from 'react-hot-toast';

interface DocumentLifecycleProps {
  zohoId: string
  type: 'Invoice' | 'SalesOrder' | 'Quote'
  onNavigateDoc?: (type: 'Quote' | 'SalesOrder' | 'Invoice', id: string) => void
}

export function DocumentLifecycle({ zohoId, type, onNavigateDoc }: DocumentLifecycleProps) {
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
      className={`flex flex-col items-center gap-1 shrink-0 ${onClick ? 'cursor-pointer hover:scale-105 transition-transform' : 'opacity-40'}`}
    >
      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 z-10 bg-[#0f1013] ${isCompleted ? 'border-emerald-500 text-emerald-400' : 'border-neutral-700 text-neutral-600'}`}>
        <Icon size={16} />
      </div>
      <div className="text-center">
        <p className={`text-[11px] font-bold ${isCompleted ? 'text-white' : 'text-neutral-500'}`}>{title}</p>
        <p className="text-[9px] text-neutral-500 truncate max-w-[70px] font-mono">{subtitle}</p>
      </div>
    </div>
  )

  const Line = ({ active }: { active: boolean }) => (
    <div className={`h-0.5 min-w-[20px] flex-1 mx-1.5 mb-5 rounded ${active ? 'bg-emerald-500/60' : 'bg-neutral-800'}`} />
  )

  const openDoc = (docType: string, data: any) => {
    if (!data) return
    const id = data.zohoId || data.id
    if (onNavigateDoc && id) {
      onNavigateDoc(docType as any, id)
    } else {
      toast.success(`Document Type: ${docType}\nNumber: ${data.items?.estimateNumber || data.items?.salesOrderNumber || data.items?.invoiceNumber || data.packageNumber || data.paymentNumber}\nZoho ID: ${data.zohoId}`)
    }
  }

  return (
    <div className="glass-panel/50 border border-white/10 rounded-xl p-3 sm:p-4">
      <h3 className="text-xs font-bold text-white mb-3 uppercase tracking-wider">Document Lifecycle</h3>
      <div className="flex items-center justify-between overflow-x-auto scrollbar-none py-1 gap-1">
        
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

        <Line active={purchaseOrders.length > 0 || packages.length > 0 || invoices.length > 0} />

        {/* PO */}
        <Node 
          icon={FiTruck} 
          title="PO" 
          subtitle={purchaseOrders[0]?.items?.purchaseorder_number || `${purchaseOrders.length} POs`} 
          color="emerald"
          isCompleted={purchaseOrders.length > 0}
          onClick={() => purchaseOrders.length > 0 && openDoc('Purchase Order', purchaseOrders[0])}
        />

        <Line active={packages.length > 0 || invoices.length > 0} />

        {/* Package */}
        <Node 
          icon={FiBox} 
          title="Package" 
          subtitle={packages[0]?.packageNumber || `${packages.length} Pkgs`} 
          color="emerald"
          isCompleted={packages.length > 0}
          onClick={() => packages.length > 0 && openDoc('Package', packages[0])}
        />

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

