const fs = require('fs');

const path = 'src/app/commissions/page.tsx';
let code = fs.readFileSync(path, 'utf8');

const repCardStartStr = 'function RepCard({ rep, isAdmin, onViewInvoice, onManagePayouts }: { rep: RepSummary; isAdmin: boolean; onViewInvoice: (zohoId: string) => void; onManagePayouts: (rep: RepSummary) => void }) {';

let startIndex = code.indexOf(repCardStartStr);

if (startIndex === -1) {
    // try fallback
    startIndex = code.indexOf('function RepCard({ rep, isAdmin, onViewInvoice, onManagePayouts }');
}

const statsTabStart = code.indexOf('// ── Performance Stats ──────────────────────────────────────────────────');

if (startIndex !== -1 && statsTabStart !== -1) {
    const newRepCard = `function RepCard({ rep, isAdmin, onViewInvoice, onManagePayouts }: { 
  rep: RepSummary, 
  isAdmin: boolean,
  onViewInvoice?: (id: string) => void,
  onManagePayouts: (rep: RepSummary) => void
}) {
  const [open, setOpen] = useState(false)
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>({})

  // Group by year and week
  const groupedDeals = useCallback(() => {
    const groups: Record<number, Record<string, { deals: Deal[], totalCommission: number, startOfWeek: string }>> = {}
    rep.deals.forEach(deal => {
      const d = deal.closeDate ? new Date(deal.closeDate) : new Date()
      const year = d.getFullYear()
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
      const startOfWeekDate = new Date(d.setDate(diff))
      startOfWeekDate.setHours(0, 0, 0, 0)
      const startStr = startOfWeekDate.toISOString().split('T')[0] // YYYY-MM-DD
      
      if (!groups[year]) groups[year] = {}
      if (!groups[year][startStr]) {
        groups[year][startStr] = { deals: [], totalCommission: 0, startOfWeek: startStr }
      }
      groups[year][startStr].deals.push(deal)
      if (deal.status !== "lost") {
        groups[year][startStr].totalCommission += deal.commission.total
      }
    })
    
    // Sort years descending, weeks descending
    const sortedYears = Object.keys(groups).map(Number).sort((a, b) => b - a)
    const sortedGroups = sortedYears.map(year => {
      const weeks = Object.values(groups[year]).sort((a, b) => new Date(b.startOfWeek).getTime() - new Date(a.startOfWeek).getTime())
      return { year, weeks }
    })
    
    return sortedGroups
  }, [rep.deals])()

  const balance = rep.totalEarned - rep.totalPaid
  const pendingDeals = rep.deals.filter(d => d.status === "pending")
  const fulfilledDeals = rep.deals.filter(d => d.status === "fulfilled")

  return (
    <div className="bg-neutral-800/40 border border-neutral-800 rounded-xl overflow-hidden">
      {/* Header */}
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-800/60 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-blue-900/40 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-sm shrink-0">
            {rep.repName?.charAt(0) || "?"}
          </div>
          <div className="min-w-0 text-left">
            <div className="text-sm font-bold text-white truncate">{rep.repName}</div>
            <div className="text-[10px] text-neutral-500">{rep.deals.length} deals · {pendingDeals.length} pending</div>
          </div>
        </div>
        <div className="flex items-center gap-6 shrink-0 ml-4">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-neutral-500 uppercase font-semibold">Profit</div>
            <div className="text-sm font-bold text-sky-400">{fmt(rep.totalProfit || 0)}</div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-neutral-500 uppercase font-semibold">Earned</div>
            <div className="text-sm font-bold text-emerald-400">{fmt(rep.totalEarned)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-neutral-500 uppercase font-semibold">Balance</div>
            <div className={\`text-sm font-bold \${balance > 0 ? "text-amber-400" : "text-neutral-400"}\`}>{fmt(balance)}</div>
          </div>
          <div className="text-neutral-500">
            {open ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
          </div>
        </div>
      </button>

      {/* Deals list */}
      {open && (
        <div className="border-t border-neutral-800">
          {/* Mini stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-neutral-800 border-b border-neutral-800">
            {[
              { label: "Total Profit", value: fmt(rep.totalProfit || 0), color: "text-sky-400" },
              { label: "Total Earned", value: fmt(rep.totalEarned), color: "text-emerald-400" },
              { label: "Paid Out", value: fmt(rep.totalPaid), color: "text-blue-400" },
              { label: "Balance", value: fmt(balance), color: balance > 0 ? "text-amber-400" : "text-neutral-400" },
            ].map(s => (
              <div key={s.label} className="px-4 py-3 text-center">
                <div className="text-[10px] text-neutral-500 uppercase font-semibold">{s.label}</div>
                <div className={\`text-base font-bold \${s.color}\`}>{s.value}</div>
              </div>
            ))}
          </div>

          {isAdmin && (
            <div className="px-5 py-3 border-b border-neutral-800 bg-neutral-900/50 flex justify-end">
              <button 
                onClick={(e) => { e.stopPropagation(); onManagePayouts(rep); }}
                className="text-xs font-bold text-amber-500 hover:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded transition-colors"
              >
                Manage Payouts
              </button>
            </div>
          )}

          {/* Deal rows grouped by year and week */}
          <div className="divide-y divide-neutral-800/60 pb-2">
            {groupedDeals.map(({ year, weeks }) => (
              <div key={year} className="mb-4">
                <div className="px-5 py-2 bg-neutral-900 text-sm font-bold text-neutral-300 border-y border-neutral-800">
                  {year}
                </div>
                {weeks.map((week) => {
                  const isExpanded = expandedWeeks[\`\${year}-\${week.startOfWeek}\`]
                  return (
                    <div key={week.startOfWeek} className="border-b border-neutral-800/40">
                      <div 
                        className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-neutral-800/50 transition-colors"
                        onClick={() => setExpandedWeeks(prev => ({ ...prev, [\`\${year}-\${week.startOfWeek}\`]: !prev[\`\${year}-\${week.startOfWeek}\`] }))}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-500">
                            {isExpanded ? <FiChevronDown /> : <FiChevronUp />}
                          </span>
                          <span className="text-sm font-semibold text-white">Week of {fmtDate(week.startOfWeek)}</span>
                          <span className="text-xs text-neutral-500">({week.deals.length} deals)</span>
                        </div>
                        <div className="text-sm font-bold text-emerald-400">
                          {fmt(week.totalCommission)}
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="bg-neutral-900/20 pl-4 border-t border-neutral-800/30">
                          {week.deals.map(deal => {
                            const hasInvoice = !!deal.invoiceZohoId
                            return (
                              <div 
                                key={deal.id}
                                onClick={() => hasInvoice && onViewInvoice && onViewInvoice(deal.invoiceZohoId!)}
                                className={\`flex items-center justify-between px-5 py-3 transition-colors border-b border-neutral-800/30 last:border-0 \${
                                  hasInvoice ? "hover:bg-neutral-800 cursor-pointer" : ""
                                } \${deal.status === "lost" ? "opacity-40" : ""}\`}
                              >
                                <div className="min-w-0 flex-1 flex items-center gap-2.5">
                                  {hasInvoice && (
                                    <FiFileText className="text-amber-500 shrink-0 text-sm" title="Attached Zoho Invoice available" />
                                  )}
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-white truncate">{deal.name}</div>
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                                      {deal.accountZohoId ? (
                                        <Link 
                                          href={\`/account?id=\${deal.accountZohoId}\`}
                                          className="text-[10px] text-emerald-400 hover:underline font-bold"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          🏢 {deal.accountName}
                                        </Link>
                                      ) : (
                                        <span className="text-[10px] text-neutral-400">🏢 {deal.accountName}</span>
                                      )}
                                      <span className="text-[10px] text-neutral-600">•</span>
                                      <span className={\`text-[10px] font-bold px-1.5 py-0.5 rounded \${stageColor(deal.stage)}\`}>{deal.stage}</span>
                                      <span className="text-[10px] text-neutral-600">•</span>
                                      <span className="text-[10px] text-neutral-500">{fmtDate(deal.closeDate)}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 shrink-0 ml-3">
                                  <div className="text-right hidden sm:block">
                                    <div className="text-[10px] text-neutral-500">Deal</div>
                                    <div className="text-xs font-semibold text-white">{fmt(deal.amount)}</div>
                                  </div>
                                  <div className="text-right hidden sm:block">
                                    <div className="text-[10px] text-neutral-500">Profit</div>
                                    <div className={\`text-xs font-semibold \${deal.status === "lost" ? "text-neutral-500" : "text-sky-400"}\`}>
                                      {fmt(deal.profit || 0)}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[10px] text-neutral-500">Commission</div>
                                    <div className={\`text-xs font-bold \${deal.status === "lost" ? "text-neutral-500" : "text-emerald-400"}\`}>
                                      {fmt(deal.commission.total)}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[10px] text-neutral-500">Status</div>
                                    <div className={\`text-[10px] font-bold uppercase \${
                                      deal.status === "fulfilled" ? "text-blue-400" :
                                      deal.status === "lost" ? "text-red-400" : "text-amber-400"
                                    }\`}>{deal.status}</div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

`;

    const before = code.substring(0, startIndex);
    const after = code.substring(statsTabStart);
    fs.writeFileSync(path, before + newRepCard + after);
    console.log("Success");
} else {
    console.log("Failed to find boundaries");
}
