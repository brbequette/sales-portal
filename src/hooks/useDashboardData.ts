import { useQuery } from '@tanstack/react-query'
import { parseGlobalHeaderSummary } from '@/lib/global-header-metrics'
import { fetchDatabaseSummary } from '@/lib/client-database-reads'

export function useDashboardData(
  repName?: string | null,
  period = 'this_month',
  startDate = '',
  endDate = '',
) {
  return useQuery({
    queryKey: ['dashboard', repName, period, startDate, endDate],
    queryFn: async () => {
      const statsParams = new URLSearchParams({ repId: repName || '', period })
      if (period === 'custom') {
        if (startDate) statsParams.set('startDate', startDate)
        if (endDate) statsParams.set('endDate', endDate)
      }
      const [statsResponse, summaryPayload] = await Promise.all([
        fetch(`/api/get-rep-stats?${statsParams.toString()}`, { cache: 'no-store' }),
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
