import { useQuery } from '@tanstack/react-query'
import { parseGlobalHeaderSummary } from '@/lib/global-header-metrics'
import { fetchDatabaseSummary } from '@/lib/client-database-reads'

export function useDashboardData(repName?: string | null) {
  return useQuery({
    queryKey: ['dashboard', repName],
    queryFn: async () => {
      const [statsResponse, summaryPayload] = await Promise.all([
        fetch(`/api/get-rep-stats?rep=${encodeURIComponent(repName || '')}`, { cache: 'no-store' }),
        fetchDatabaseSummary(),
      ])
      if (!statsResponse.ok) throw new Error('Failed to fetch dashboard data')
      const stats = await statsResponse.json()
      const globalHeaderSummary = parseGlobalHeaderSummary(summaryPayload)
      if (!stats.success || !globalHeaderSummary || stats.scope !== globalHeaderSummary.scope) {
        throw new Error('Dashboard financial scope unavailable')
      }
      return { ...stats, globalHeaderSummary }
    },
    enabled: !!repName,
  })
}
