import { FiTarget, FiDollarSign, FiTrendingUp, FiArrowUpRight, FiArrowDownRight } from "react-icons/fi"

export function KpiCards({ data, onCardClick }: { data: any, onCardClick?: (key: string) => void }) {
  if (!data) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div 
        onClick={() => onCardClick?.('sales')}
        className="glass-panel rounded-2xl p-5 border border-white/[0.06] hover:border-white/[0.2] transition-all duration-300 cursor-pointer"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="p-2.5 rounded-xl border transition-colors bg-emerald-500/15 border-emerald-500/30">
            <FiDollarSign size={18} className="text-emerald-500" />
          </div>
        </div>
        <p className="text-xs font-medium text-neutral-400 mb-1">Total Sales</p>
        <p className="text-2xl font-bold text-white tracking-tight">${data.sales?.toLocaleString() || '0'}</p>
      </div>

      <div 
        onClick={() => onCardClick?.('profit')}
        className="glass-panel rounded-2xl p-5 border border-white/[0.06] hover:border-white/[0.2] transition-all duration-300 cursor-pointer"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="p-2.5 rounded-xl border transition-colors bg-amber-500/15 border-amber-500/30">
            <FiTrendingUp size={18} className="text-amber-500" />
          </div>
        </div>
        <p className="text-xs font-medium text-neutral-400 mb-1">Net Profit</p>
        <p className="text-2xl font-bold text-white tracking-tight">${data.profit?.toLocaleString() || '0'}</p>
      </div>

      <div 
        onClick={() => onCardClick?.('commission')}
        className="glass-panel rounded-2xl p-5 border border-white/[0.06] hover:border-white/[0.2] transition-all duration-300 cursor-pointer"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="p-2.5 rounded-xl border transition-colors bg-purple-500/15 border-purple-500/30">
            <FiTarget size={18} className="text-purple-500" />
          </div>
        </div>
        <p className="text-xs font-medium text-neutral-400 mb-1">Commission</p>
        <p className="text-2xl font-bold text-white tracking-tight">${data.commission?.toLocaleString() || '0'}</p>
      </div>

      <div 
        onClick={() => onCardClick?.('deals')}
        className="glass-panel rounded-2xl p-5 border border-white/[0.06] hover:border-white/[0.2] transition-all duration-300 cursor-pointer"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="p-2.5 rounded-xl border transition-colors bg-sky-500/15 border-sky-500/30">
            <FiTarget size={18} className="text-sky-500" />
          </div>
        </div>
        <p className="text-xs font-medium text-neutral-400 mb-1">Deals Won</p>
        <p className="text-2xl font-bold text-white tracking-tight">{data.deals || 0}</p>
      </div>
    </div>
  )
}
