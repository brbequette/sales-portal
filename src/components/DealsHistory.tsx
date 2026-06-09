import React from 'react'
import { FiDollarSign, FiCalendar, FiBox, FiCheckCircle } from 'react-icons/fi'
import { usePagination, Pagination } from './Pagination'

export function DealsHistory({ deals }: { deals: any[] }) {
  const pagination = usePagination(deals)
  if (!deals || deals.length === 0) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center text-neutral-500">
        <p>No sales history found for this account.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-white flex items-center mb-4">
        <FiDollarSign className="mr-2 text-emerald-500" /> Deals & Sales History
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
        {pagination.paginatedItems.map(deal => (
          <div key={deal.id} className="bg-neutral-800/50 border border-neutral-700 hover:border-emerald-500/30 p-5 rounded-xl transition-all group relative overflow-hidden flex flex-col justify-between h-full">
            {/* Background decoration */}
            {deal.stage.includes('Won') || deal.stage.includes('Paid') ? (
               <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-bl-full -mr-2 -mt-2"></div>
            ) : null}

            <div className="flex justify-between items-start mb-3">
              <h4 className="text-sm font-bold text-white max-w-[70%]">{deal.name}</h4>
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full z-10 ${
                deal.stage.includes('Won') || deal.stage.includes('Paid') ? 'bg-emerald-900/30 text-emerald-500 border border-emerald-500/20' :
                deal.stage.includes('Lost') ? 'bg-red-900/30 text-red-500 border border-red-500/20' :
                'bg-blue-900/30 text-blue-500 border border-blue-500/20'
              }`}>
                {deal.stage}
              </span>
            </div>
            
            <div className="mt-auto pt-4">
              <div className="flex items-end justify-between mb-4">
                <div className="text-2xl font-bold text-white">
                  ${deal.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="flex items-center text-xs text-neutral-400">
                  <FiCalendar className="mr-1" />
                  {deal.closingDate ? new Date(deal.closingDate).toLocaleDateString() : 'N/A'}
                </div>
              </div>

              {deal.invoicedItems && (
                <div className="mt-4 pt-4 border-t border-neutral-700/50">
                  <div className="text-xs font-semibold text-neutral-500 flex items-center mb-2">
                    <FiBox className="mr-1" /> Products Included
                  </div>
                  <p className="text-xs text-neutral-300 leading-relaxed max-h-24 overflow-y-auto bg-neutral-900 p-2 rounded border border-neutral-800" style={{ whiteSpace: 'pre-wrap' }}>{deal.invoicedItems}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {pagination.pageSize !== "All" && deals.length > (pagination.pageSize as number) && (
        <Pagination
          currentPage={pagination.currentPage}
          pageSize={pagination.pageSize}
          totalItems={deals.length}
          onPageChange={pagination.setCurrentPage}
          onPageSizeChange={pagination.setPageSize}
        />
      )}
    </div>
  )
}
