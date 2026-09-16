import { useQuery } from '@tanstack/react-query'
import { parseGlobalHeaderSummary } from '@/lib/global-header-metrics'

export function useDashboardData(repName?: string | null) {
  return useQuery({
    queryKey: ['dashboard', repName],
    queryFn: async () => {
      const [statsResponse, summaryResponse] = await Promise.all([
        fetch(`/api/get-rep-stats?rep=${encodeURIComponent(repName || '')}`, { cache: 'no-store' }),
        fetch('/api/zoho-invoices?summary=true', { cache: 'no-store' }),
      ])
      if (!statsResponse.ok || !summaryResponse.ok) throw new Error('Failed to fetch dashboard data')
      const [stats, summaryPayload] = await Promise.all([statsResponse.json(), summaryResponse.json()])
      const globalHeaderSummary = parseGlobalHeaderSummary(summaryPayload)
      if (!stats.success || !globalHeaderSummary || stats.scope !== globalHeaderSummary.scope) {
        throw new Error('Dashboard financial scope unavailable')
      }
      return { ...stats, globalHeaderSummary }
    },
    enabled: !!repName,
  })
}
