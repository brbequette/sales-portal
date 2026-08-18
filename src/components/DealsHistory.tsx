import React, { useState } from 'react'
import { FiDollarSign, FiCalendar, FiBox, FiCheckCircle, FiChevronDown, FiChevronUp } from 'react-icons/fi'
import { usePagination, Pagination } from './Pagination'
import { SaleTimeline } from './SaleTimeline'

export function DealsHistory({ deals }: { deals: any[] }) {
  const [showLost, setShowLost] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filteredDeals = showLost ? deals : deals.filter(d => !d.stage?.includes('Lost'))
  const pagination = usePagination(filteredDeals)
  if (!deals || deals.length === 0) {
    return (
      <div className="glass-panel border border-white/10 rounded-xl p-8 text-center text-neutral-500">
        <p>No sales history found for this account.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-white flex items-center">
          <FiDollarSign className="mr-2 text-emerald-500" /> Deals & Sales History
        </h3>
        {deals.some(d => d.stage?.includes('Lost')) && (
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input type="checkbox" className="sr-only" checked={showLost} onChange={() => setShowLost(!showLost)} />
              <div className={`block w-10 h-6 rounded-full transition-colors ${showLost ? 'bg-red-500' : 'bg-neutral-700'}`}></div>
              <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${showLost ? 'transform translate-x-4' : ''}`}></div>
            </div>
            <div className="ml-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">
              Show Lost Deals
            </div>
          </label>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
        {pagination.paginatedItems.map(deal => {
          const isExpanded = expandedId === deal.id
          return (
            <div 
              key={deal.id} 
              className={`bg-neutral-800/50 border border-neutral-700 hover:border-emerald-500/30 p-5 rounded-xl transition-all group relative overflow-hidden flex flex-col justify-between cursor-pointer ${isExpanded ? 'col-span-1 md:col-span-2 lg:col-span-3' : 'h-full'}`}
              onClick={() => setExpandedId(isExpanded ? null : deal.id)}
            >
              {/* Background decoration */}
              {deal.stage.includes('Won') || deal.stage.includes('Paid') ? (
                 <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-bl-full -mr-2 -mt-2"></div>
              ) : null}

              <div className="flex justify-between items-start mb-3">
                <h4 className="text-sm font-bold text-white max-w-[70%]">{deal.name}</h4>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full z-10 ${
                    deal.stage.includes('Won') || deal.stage.includes('Paid') ? 'bg-emerald-900/30 text-emerald-500 border border-emerald-500/20' :
                    deal.stage.includes('Lost') ? 'bg-red-900/30 text-red-500 border border-red-500/20' :
                    'bg-blue-900/30 text-blue-500 border border-blue-500/20'
                  }`}>
                    {deal.stage}
                  </span>
                  <button className="text-neutral-400 hover:text-white transition-colors">
                    {isExpanded ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
                  </button>
                </div>
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
                  <p className="text-xs text-neutral-300 leading-relaxed max-h-24 overflow-y-auto glass-panel p-2 rounded border border-white/10" style={{ whiteSpace: 'pre-wrap' }}>{deal.invoicedItems}</p>
                </div>
              )}

              {isExpanded && (
                <div onClick={e => e.stopPropagation()}>
                  <SaleTimeline dealId={deal.id} currentStage={deal.stage} />
                </div>
              )}
            </div>
          </div>
        )
        })}
      </div>
      {pagination.pageSize !== "All" && filteredDeals.length > (pagination.pageSize as number) && (
        <Pagination
          currentPage={pagination.currentPage}
          pageSize={pagination.pageSize}
          totalItems={filteredDeals.length}
          onPageChange={pagination.setCurrentPage}
          onPageSizeChange={pagination.setPageSize}
        />
      )}
    </div>
  )
}
