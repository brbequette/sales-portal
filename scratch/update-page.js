const fs = require('fs');

const path = 'src/app/commissions/page.tsx';
let code = fs.readFileSync(path, 'utf8');

// Replace the start of RepCard
code = code.replace(
  /function RepCard\(\{ rep, isAdmin, onViewInvoice, onManagePayouts \}: \{ rep: RepSummary; isAdmin: boolean; onViewInvoice: \(zohoId: string\) => void; onManagePayouts: \(rep: RepSummary\) => void \}\) \{\s*const \[open, setOpen\] = useState\(false\)\s*const pagination = usePagination\(\{ items: rep\.deals, initialPageSize: 10 \}\)/s,
  `function RepCard({ rep, isAdmin, onViewInvoice, onManagePayouts }: { 
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
  }, [rep.deals])()`
);

// Replace the deal rows rendering block
code = code.replace(
  /<div className="divide-y divide-neutral-800\/60">.*?<\/div>\s*\{pagination\.pageSize \!\=\= "All".*?<\/div>/s,
  `<div className="divide-y divide-neutral-800/60 pb-2">
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
          </div>`
);

fs.writeFileSync(path, code);
console.log('Done replacing');
