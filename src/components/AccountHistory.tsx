"use client"

import { useState } from "react"
import { usePagination, Pagination } from "./Pagination"
import { FiFileText, FiDownload } from "react-icons/fi"

interface AccountHistoryProps {
  accountId: string
  invoices?: any[]
  salesOrders?: any[]
  quotes?: any[]
  notes?: any[]
  onViewInvoice?: (zohoId: string) => void
  onViewSalesDoc?: (type: 'SalesOrder' | 'Quote', doc: any) => void
}

export function AccountHistory({
  accountId,
  invoices = [],
  salesOrders = [],
  quotes = [],
  notes = [],
  onViewInvoice,
  onViewSalesDoc
}: AccountHistoryProps) {
  const [activeTab, setActiveTab] = useState<'invoices' | 'orders' | 'quotes' | 'logs'>('invoices')

  // Map database notes to communication logs
  const logs = notes.map((note) => ({
    id: note.id,
    date: note.createdAt ? new Date(note.createdAt).toLocaleDateString() : "—",
    type: note.callSid ? "Call" : "Note",
    summary: note.content
  }))

  const invoicesPagination = usePagination(invoices)
  const ordersPagination = usePagination(salesOrders)
  const quotesPagination = usePagination(quotes)
  const logsPagination = usePagination(logs)

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold mb-4 text-(--primary)">Full Account History</h2>
      
      {/* Tabs */}
      <div className="flex border-b border-(--border)">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === 'invoices' 
              ? 'text-(--primary) border-b-2 border-(--primary)' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Invoices
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === 'orders' 
              ? 'text-(--primary) border-b-2 border-(--primary)' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Sales Orders
        </button>
        <button
          onClick={() => setActiveTab('quotes')}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === 'quotes' 
              ? 'text-(--primary) border-b-2 border-(--primary)' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Quotes
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === 'logs' 
              ? 'text-(--primary) border-b-2 border-(--primary)' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Comm Logs
        </button>
      </div>

      {/* Content */}
      <div className="pt-4">
        {activeTab === 'invoices' && (
          <div className="space-y-3">
            {invoices.length === 0 ? (
              <div className="p-8 text-center text-gray-500 border border-dashed border-(--border) rounded-lg">
                No recent invoices found.
              </div>
            ) : (
              <div className="space-y-3">
                {invoicesPagination.paginatedItems.map(inv => {
                  const formattedAmount = parseFloat(inv.amount || 0).toLocaleString(undefined, { 
                    style: 'currency', 
                    currency: 'USD' 
                  })
                  const formattedDate = inv.issueDate ? new Date(inv.issueDate).toLocaleDateString() : "—"
                  const invoiceNumber = (inv.items && typeof inv.items === 'object' && 'invoiceNumber' in inv.items)
                    ? (inv.items as any).invoiceNumber
                    : (inv.zohoId || inv.id || "INV").slice(-6).toUpperCase();

                  return (
                    <div 
                      key={inv.id} 
                      onClick={() => onViewInvoice && onViewInvoice(inv.zohoId)}
                      className="flex items-center justify-between p-4 bg-black/20 border border-(--border) rounded-lg hover:border-(--primary)/55 transition-colors cursor-pointer hover:bg-neutral-800/10 group"
                      title="Click to view Invoice PDF"
                    >
                      <div>
                        <div className="font-medium flex items-center gap-1.5 text-emerald-400 group-hover:underline font-mono">
                          <FiFileText className="text-amber-500 shrink-0" size={13} />
                          <span>#{invoiceNumber}</span>
                        </div>
                        <div className="text-sm text-gray-400">{formattedDate}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-semibold">{formattedAmount}</div>
                          <div className={`text-xs font-bold ${inv.status === 'Paid' ? 'text-emerald-400' : 'text-rose-500'}`}>
                            {inv.status}
                          </div>
                        </div>
                        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={`/api/get-invoice-pdf?id=${inv.zohoId || inv.id}&type=Invoice&download=true`}
                            className="p-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/20 transition-colors"
                            title="Download Invoice PDF"
                          >
                            <FiDownload size={14} />
                          </a>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <Pagination
                  currentPage={invoicesPagination.currentPage}
                  pageSize={invoicesPagination.pageSize}
                  totalItems={invoices.length}
                  onPageChange={invoicesPagination.setCurrentPage}
                  onPageSizeChange={invoicesPagination.setPageSize}
                />
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'orders' && (
          <div className="space-y-3">
            {salesOrders.length === 0 ? (
              <div className="p-8 text-center text-gray-500 border border-dashed border-(--border) rounded-lg">
                No recent sales orders found.
              </div>
            ) : (
              <div className="space-y-3">
                {ordersPagination.paginatedItems.map(so => {
                  const formattedAmount = parseFloat(so.amount || 0).toLocaleString(undefined, { 
                    style: 'currency', 
                    currency: 'USD' 
                  })
                  const formattedDate = so.orderDate ? new Date(so.orderDate).toLocaleDateString() : "—"

                  return (
                    <div 
                      key={so.id} 
                      onClick={() => onViewSalesDoc && onViewSalesDoc('SalesOrder', so)}
                      className="flex items-center justify-between p-4 bg-black/20 border border-(--border) rounded-lg hover:border-(--primary)/55 transition-colors cursor-pointer hover:bg-neutral-850/10 group"
                      title="Click to view Sales Order details"
                    >
                      <div>
                        <div className="font-medium flex items-center gap-1.5 text-emerald-400 group-hover:underline font-mono">
                          <FiFileText className="text-blue-500 shrink-0" size={13} />
                          <span>#{so.zohoId?.slice(-6).toUpperCase() || so.id.slice(-6).toUpperCase()}</span>
                        </div>
                        <div className="text-sm text-gray-400">{formattedDate}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-semibold">{formattedAmount}</div>
                          <div className={`text-xs font-bold ${
                            so.status === 'Shipped' || so.status === 'Processed' 
                              ? 'text-emerald-400' 
                              : 'text-amber-400'
                          }`}>
                            {so.status}
                          </div>
                        </div>
                        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={`/api/get-invoice-pdf?id=${so.zohoId || so.id}&type=SalesOrder&download=true`}
                            className="p-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/20 transition-colors"
                            title="Download Sales Order PDF"
                          >
                            <FiDownload size={14} />
                          </a>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <Pagination
                  currentPage={ordersPagination.currentPage}
                  pageSize={ordersPagination.pageSize}
                  totalItems={salesOrders.length}
                  onPageChange={ordersPagination.setCurrentPage}
                  onPageSizeChange={ordersPagination.setPageSize}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'quotes' && (
          <div className="space-y-3">
            {quotes.length === 0 ? (
              <div className="p-8 text-center text-gray-500 border border-dashed border-(--border) rounded-lg">
                No recent quotes found.
              </div>
            ) : (
              <div className="space-y-3">
                {quotesPagination.paginatedItems.map(quote => {
                  const formattedAmount = parseFloat(quote.amount || 0).toLocaleString(undefined, { 
                    style: 'currency', 
                    currency: 'USD' 
                  })
                  const formattedDate = quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : "—"

                  return (
                    <div 
                      key={quote.id} 
                      onClick={() => onViewSalesDoc && onViewSalesDoc('Quote', quote)}
                      className="flex items-center justify-between p-4 bg-black/20 border border-(--border) rounded-lg hover:border-(--primary)/55 transition-colors cursor-pointer hover:bg-neutral-850/10 group"
                      title="Click to view Quote details"
                    >
                      <div>
                        <div className="font-medium flex items-center gap-1.5 text-emerald-400 group-hover:underline font-mono">
                          <FiFileText className="text-purple-500 shrink-0" size={13} />
                          <span>#{quote.zohoId?.slice(-6).toUpperCase() || quote.id.slice(-6).toUpperCase()}</span>
                        </div>
                        <div className="text-sm text-gray-400">{formattedDate}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-semibold">{formattedAmount}</div>
                          <div className={`text-xs font-bold ${
                            quote.status === 'Accepted' || quote.status === 'Sent' 
                              ? 'text-emerald-400' 
                              : 'text-amber-400'
                          }`}>
                            {quote.status}
                          </div>
                        </div>
                        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={`/api/get-invoice-pdf?id=${quote.zohoId || quote.id}&type=Quote&download=true`}
                            className="p-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/20 transition-colors"
                            title="Download Quote PDF"
                          >
                            <FiDownload size={14} />
                          </a>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <Pagination
                  currentPage={quotesPagination.currentPage}
                  pageSize={quotesPagination.pageSize}
                  totalItems={quotes.length}
                  onPageChange={quotesPagination.setCurrentPage}
                  onPageSizeChange={quotesPagination.setPageSize}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-3">
            {logs.length === 0 ? (
              <div className="p-8 text-center text-gray-500 border border-dashed border-(--border) rounded-lg">
                No communication logs found.
              </div>
            ) : (
              <div className="space-y-3">
                {logsPagination.paginatedItems.map(log => (
                  <div key={log.id} className="p-4 bg-black/20 border border-(--border) rounded-lg hover:border-blue-500/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">
                        {log.type}
                      </span>
                      <span className="text-xs text-gray-400">{log.date}</span>
                    </div>
                    <p className="text-sm text-gray-300">{log.summary}</p>
                  </div>
                ))}
                <Pagination
                  currentPage={logsPagination.currentPage}
                  pageSize={logsPagination.pageSize}
                  totalItems={logs.length}
                  onPageChange={logsPagination.setCurrentPage}
                  onPageSizeChange={logsPagination.setPageSize}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
