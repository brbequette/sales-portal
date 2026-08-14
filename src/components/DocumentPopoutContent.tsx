"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { FiDatabase, FiExternalLink, FiTruck, FiBox, FiDollarSign, FiRefreshCw, FiCheckCircle, FiXCircle, FiCheck, FiCpu, FiMail, FiSlash, FiDownload } from "react-icons/fi"
import { useInvoiceDetailsData } from "./useInvoiceDetailsData"
import { getZohoBooksUrl } from "@/lib/zoho-urls"
import { InvoiceFinancialBreakdown } from "./InvoiceFinancialBreakdown"
import { Skeleton } from "@/components/ui/skeleton"
import { CreatePackageModal } from "./CreatePackageModal"
import { CreateDropshipmentModal } from "./CreateDropshipmentModal"
import { RecordPaymentModal } from "./RecordPaymentModal"

export interface DocumentPopoutContentProps {
  entityId: string
  entityType: 'invoice' | 'estimate' | 'quote' | 'salesorder'
  onClose: () => void
  entities?: any[]
  currentIndex?: number
  onNavigate?: (index: number) => void
}

export function DocumentPopoutContent({
  entityId,
  entityType,
  onClose,
  entities,
  currentIndex,
  onNavigate
}: DocumentPopoutContentProps) {
  const typeMap = {
    invoice: 'Invoice',
    estimate: 'Quote',
    quote: 'Quote',
    salesorder: 'SalesOrder'
  } as const

  const mappedType = typeMap[entityType] || 'Invoice'

  const {
    fullInvoiceDetails,
    isLoading,
    dataSource,
    cachedAt,
    isConverting,
    actionLoading,
    costResult,
    showPackageModal,
    setShowPackageModal,
    showDropshipmentModal,
    setShowDropshipmentModal,
    showPaymentModal,
    setShowPaymentModal,
    activeTab,
    setActiveTab,
    discountPercentage,
    setDiscountPercentage,
    usersList,
    isLoadingUsers,
    currentType,
    zohoId,
    fetchDetails,
    displayData,
    effectiveRole,
    effectiveEmail,
    effectiveName,
    isAdmin,
    canEdit,
    handleConvert,
    handleApplyDiscount,
    handleSendEmail,
    handleVoid,
    handleUpdateStatus,
    handleProcessCosts,
    typeColor,
    typeLabel,
    statusLower,
    isVoided,
    isPaid,
    balanceDue
  } = useInvoiceDetailsData({ 
    invoice: entityId, 
    type: mappedType, 
    onClose, 
    invoiceList: entities, 
    currentIndex, 
    onNavigate 
  })

  // We embed the actions bar inside the content area right below the tabs, 
  // or we can portal it to the header. For simplicity, let's put it above the tabs.
  return (
    <div className="flex flex-col h-full">
      {showPackageModal && displayData?.line_items && (
        <CreatePackageModal 
          salesOrderId={zohoId} 
          lineItems={displayData.line_items}
          onClose={() => setShowPackageModal(false)}
          onSuccess={(pkgId) => {
            alert(`Package created successfully! ID: ${pkgId}`)
            setShowPackageModal(false)
          }}
        />
      )}
      {showDropshipmentModal && displayData?.line_items && (
        <CreateDropshipmentModal 
          salesOrderId={zohoId} 
          lineItems={displayData.line_items}
          onClose={() => setShowDropshipmentModal(false)}
          onSuccess={(poId) => {
            alert(`Dropshipment Purchase Order created successfully! ID: ${poId}`)
            setShowDropshipmentModal(false)
          }}
        />
      )}
      {showPaymentModal && (
        <RecordPaymentModal
          invoiceId={zohoId}
          customerId={displayData?.customer_id || displayData?.items?.customerId || ""}
          balance={balanceDue}
          invoiceNumber={displayData?.invoice_number || displayData?.items?.invoiceNumber || ""}
          customerName={displayData?.customer_name || ""}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            alert("✅ Payment recorded successfully!")
            setShowPaymentModal(false)
            onClose()
          }}
        />
      )}

      {/* Info & Actions Bar */}
      <div className="glass-panel px-4 py-3 border-b border-white/10 flex flex-wrap justify-between items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] text-neutral-400 font-mono truncate">Zoho ID: {zohoId}</p>
          <a
            href={getZohoBooksUrl(currentType, zohoId)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[9px] font-bold uppercase text-sky-400 hover:text-sky-300 hover:underline bg-sky-950/40 border border-sky-500/30 px-1.5 py-0.5 rounded transition-colors"
          >
            Open in Zoho Books <FiExternalLink size={10} />
          </a>
          {dataSource === 'local_db' && (
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-sky-400 bg-sky-900/20 border border-sky-800/40 rounded px-1.5 py-0.5">
              ⚡ Cached
            </span>
          )}
          {dataSource === 'zoho_live' && (
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-900/20 border border-emerald-800/40 rounded px-1.5 py-0.5">
              ✨ Live
            </span>
          )}
          <button
            onClick={() => fetchDetails(true)}
            className="flex items-center gap-1 text-[9px] text-neutral-500 hover:text-neutral-300 transition-colors underline"
          >
            {isLoading ? <div className="w-2.5 h-2.5 border border-emerald-500 border-t-transparent rounded-full animate-spin" /> : null}
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end shrink-0">
          {/* QUOTE ACTIONS */}
          {currentType === "Quote" && !isVoided && (
            <div className="flex items-center gap-1 glass-panel border border-white/10 rounded-lg p-0.5 sm:p-1">
              <button onClick={() => handleUpdateStatus("accepted")} disabled={!!actionLoading} className="bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold px-2 sm:px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1 disabled:opacity-50">
                <FiCheckCircle size={12} /> <span className="hidden sm:inline">Accept</span>
              </button>
              <button onClick={() => handleUpdateStatus("declined")} disabled={!!actionLoading} className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-bold px-2 sm:px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1 disabled:opacity-50">
                <FiXCircle size={12} /> <span className="hidden sm:inline">Decline</span>
              </button>
              <div className="w-px h-4 bg-neutral-800 mx-0.5"></div>
              <button onClick={() => handleConvert("SalesOrder")} disabled={isConverting} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-2 sm:px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors shadow shadow-blue-900/20 flex items-center gap-1 disabled:opacity-50">
                <FiRefreshCw className={isConverting ? "animate-spin" : ""} size={12} /> <span className="hidden sm:inline">Convert to</span> SO
              </button>
            </div>
          )}
          
          {/* SALES ORDER ACTIONS */}
          {currentType === "SalesOrder" && !isVoided && (
            <div className="flex items-center gap-1 glass-panel border border-white/10 rounded-lg p-0.5 sm:p-1">
              {statusLower !== 'confirmed' && statusLower !== 'shipped' && (
                <button onClick={() => handleUpdateStatus("confirm")} disabled={!!actionLoading} className="bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold px-2 sm:px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1 disabled:opacity-50">
                  <FiCheck size={12} /> <span className="hidden sm:inline">Confirm</span>
                </button>
              )}
              <button onClick={() => setShowPackageModal(true)} className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-bold px-2 sm:px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1">
                <FiBox size={12} /> <span className="hidden sm:inline">Package</span>
              </button>
              <button onClick={() => setShowDropshipmentModal(true)} className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-bold px-2 sm:px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1">
                <FiTruck size={12} /> <span className="hidden sm:inline">Dropship</span>
              </button>
              <div className="w-px h-4 bg-neutral-800 mx-0.5"></div>
              <button onClick={() => handleConvert("Invoice")} disabled={isConverting} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 sm:px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors shadow shadow-emerald-900/20 disabled:opacity-50 flex items-center gap-1">
                <FiRefreshCw className={isConverting ? "animate-spin" : ""} size={12} /> <span className="hidden sm:inline">Invoice</span>
              </button>
            </div>
          )}

          {/* INVOICE ACTIONS */}
          {currentType === "Invoice" && !isVoided && (
            <div className="flex items-center gap-1 glass-panel border border-white/10 rounded-lg p-0.5 sm:p-1">
              {!isPaid && balanceDue > 0 && (
                <button onClick={() => setShowPaymentModal(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 sm:px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors shadow shadow-emerald-900/20 flex items-center gap-1">
                  <FiDollarSign size={12} /> <span className="hidden sm:inline">Record</span> Payment
                </button>
              )}
              {!isPaid && statusLower !== 'overdue' && (
                <>
                  <input type="number" min="0" max="100" value={discountPercentage} onChange={(e) => setDiscountPercentage(Number(e.target.value))} className="w-10 sm:w-12 bg-neutral-800 border border-neutral-700 text-white text-xs font-bold rounded px-1 sm:px-1.5 py-1 text-center focus:outline-none focus:border-blue-500" />
                  <span className="text-xs text-neutral-400 font-bold mr-0.5">%</span>
                  <button onClick={handleApplyDiscount} disabled={isConverting} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-2 py-1 rounded text-[10px] sm:text-xs transition-colors shadow shadow-blue-900/20 disabled:opacity-50 flex items-center gap-1">
                    {isConverting ? <FiRefreshCw className="animate-spin" size={12} /> : <FiDatabase size={12} />}
                    <span className="hidden sm:inline">Payoff</span> Disc
                  </button>
                </>
              )}
            </div>
          )}

          {/* SHARED ACTIONS */}
          <div className="flex items-center gap-1">
            {!isVoided && (
              <button onClick={() => handleProcessCosts()} disabled={!!actionLoading} className="bg-amber-600/80 hover:bg-amber-500 text-white font-bold px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-50">
                {actionLoading === "process-costs" ? <FiRefreshCw className="animate-spin" size={12} /> : <FiCpu size={12} />}
                <span className="hidden sm:inline">Process</span> Costs
              </button>
            )}
            {!isVoided && (
              <button onClick={handleSendEmail} disabled={!!actionLoading} className="bg-sky-600/80 hover:bg-sky-500 text-white font-bold px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-50">
                {actionLoading === "email" ? <FiRefreshCw className="animate-spin" size={12} /> : <FiMail size={12} />}
                <span className="hidden sm:inline">Send</span> Email
              </button>
            )}
            {!isVoided && !isPaid && (
              <button onClick={handleVoid} disabled={!!actionLoading} className="bg-red-600/60 hover:bg-red-500 text-white font-bold px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-50">
                {actionLoading === "void" ? <FiRefreshCw className="animate-spin" size={12} /> : <FiSlash size={12} />}
                Void
              </button>
            )}
            <a href={`/api/get-invoice-pdf?id=${zohoId}&type=${currentType}&download=true`} target="_blank" rel="noreferrer" className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs transition-colors border border-neutral-700 flex items-center gap-1 sm:gap-1.5 cursor-pointer whitespace-nowrap">
              <FiDownload size={12} /> <span className="hidden sm:inline">Download</span> PDF
            </a>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-white/10 glass-panel px-4 pt-2 gap-4">
        <button onClick={() => setActiveTab('overview')} className={`pb-2 px-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'overview' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}>Overview</button>
        <button onClick={() => setActiveTab('financials')} className={`pb-2 px-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'financials' ? 'border-emerald-500 text-emerald-400 font-extrabold' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}>📊 Financial Derivation</button>
        <button onClick={() => setActiveTab('communications')} className={`pb-2 px-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'communications' ? 'border-blue-500 text-blue-400' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}>Communications</button>
        <button onClick={() => setActiveTab('notes_tasks')} className={`pb-2 px-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'notes_tasks' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}>Notes & Tasks</button>
        <button onClick={() => setActiveTab('pdf_preview')} className={`pb-2 px-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'pdf_preview' ? 'border-blue-500 text-blue-400' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}>PDF Document</button>
      </div>

      {/* Tabs Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'financials' ? (
          <div className="p-4 sm:p-5">
            {(() => {
              const src = costResult || displayData?.items || displayData || {}
              const subTotalVal = parseFloat(displayData?.sub_total || displayData?.total || displayData?.amount || src.subTotal || 0)
              const deadCostTotalVal = parseFloat(src.deadCostTotal || displayData?.deadCostTotal || 0)
              const deadCostSubjectVal = parseFloat(src.deadCostSubjectToVig || src.deadCostTotal || displayData?.deadCostSubjectToVig || 0)
              const vigRateVal = parseFloat(src.vigRate || displayData?.vigRate || 1.3)
              const profitVal = parseFloat(src.profit || displayData?.profit || 0)
              const commVal = parseFloat(src.commission || src.salesCommission || displayData?.salesCommission || 0)
              const isPaidVal = statusLower === 'paid' || displayData?.status === 'Paid' || displayData?.isPaid

              const matchedRep = usersList.find(u => {
                const spName = (displayData?.salesperson_name || displayData?.salespersonName || "").toLowerCase().trim()
                return u.id === displayData?.ownerId || u.zohoId === displayData?.ownerId || (u.name && u.name.toLowerCase().trim() === spName)
              })
              const payoutStructureVal = matchedRep?.payoutStructure || 'two_payment'

              return (
                <InvoiceFinancialBreakdown
                  payoutStructure={payoutStructureVal}
                  subTotal={subTotalVal}
                  deadCostTotal={deadCostTotalVal}
                  deadCostSubjectToVig={deadCostSubjectVal}
                  deadCostNoVig={parseFloat(src.deadCostNoVig || displayData?.deadCostNoVig || 0)}
                  vigRate={vigRateVal}
                  profit={profitVal}
                  salesCommission={commVal}
                  salespersonName={displayData?.salesperson_name || displayData?.salespersonName || ""}
                  isPaid={isPaidVal}
                  paymentDate={displayData?.paymentDate || displayData?.paidDate || displayData?.payment_date || src.paymentDate || null}
                  lineItemDetails={
                    (displayData?.items?.lineItemDetails) ||
                    displayData?.line_items?.map((item: any) => ({
                      name: item.name || item.description || "Item",
                      quantity: parseFloat(item.quantity || 1),
                      rate: parseFloat(item.rate || item.price || 0),
                      cost: parseFloat(item.purchase_rate || item.pricebook_rate || item.b2bCost || 0),
                      deadCost: parseFloat(item.purchase_rate || item.pricebook_rate || 0) * parseFloat(item.quantity || 1),
                      noVig: item.noVig || item.isNoVig
                    })) || []}
                  customFields={displayData?.custom_fields || displayData?.customFields || []}
                />
              )
            })()}
          </div>
        ) : activeTab === 'overview' ? (
          <div className="p-4 sm:p-5 flex flex-col gap-5">
            <div>
              <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2"><FiDatabase className="text-sky-400 shrink-0" /> Data View</h3>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">{currentType === 'Quote' ? 'Quote' : currentType === 'SalesOrder' ? 'SO' : 'Invoice'} #</label>
                  <div className="text-sm text-white font-mono truncate">{displayData?.items?.invoiceNumber || displayData?.items?.invoice_number || displayData?.items?.salesOrderNumber || displayData?.items?.salesorder_number || displayData?.items?.estimateNumber || displayData?.items?.estimate_number || displayData?.invoiceNumber || displayData?.invoice_number || displayData?.salesorder_number || displayData?.estimate_number || displayData?.zohoId || "--"}</div>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Amount</label>
                  <div className="text-sm text-emerald-400 font-bold">${parseFloat(displayData?.amount || displayData?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Status</label>
                  <div className={`text-sm font-bold ${displayData?.status === 'Paid' || displayData?.status === 'paid' ? 'text-blue-400' : displayData?.status === 'Overdue' || displayData?.status === 'overdue' ? 'text-red-400' : isVoided ? 'text-neutral-500' : 'text-amber-400'}`}>{displayData?.status || "--"}</div>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Issue Date</label>
                  <div className="text-sm text-white">{displayData?.issueDate || displayData?.date ? new Date(displayData.issueDate || displayData.date).toLocaleDateString(undefined, { timeZone: 'UTC' }) : "--"}</div>
                </div>
              </div>
            </div>
            
            {/* Packages & Tracking summary */}
            {((displayData?.packages && displayData.packages.length > 0) || (displayData?.dropshipments && displayData.dropshipments.length > 0)) && (
              <div className="pt-3 border-t border-white/10">
                <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2"><FiTruck className="text-sky-400 shrink-0" /> Tracking & Fulfillment</h3>
                <div className="flex flex-col gap-2">
                  {displayData.packages?.map((pkg: any) => (
                    <div key={pkg.id || pkg.packageNumber} className="glass-panel border border-white/10 rounded-lg p-3 flex justify-between items-center">
                      <div className="text-sm font-bold text-white flex items-center gap-2">PKG: {pkg.packageNumber || pkg.package_id || 'Pending'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'pdf_preview' ? (
          <div className="h-[70vh] p-4">
            <iframe
              src={`/api/get-invoice-pdf?id=${zohoId}&type=${currentType}`}
              className="w-full h-full rounded-lg border border-white/10"
            />
          </div>
        ) : (
          <div className="p-4 sm:p-5 text-neutral-400">Content for {activeTab} coming soon in extracted version...</div>
        )}
      </div>
    </div>
  )
}
