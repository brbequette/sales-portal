import { useQuery } from '@tanstack/react-query'

export function useDashboardData(repName?: string | null) {
  return useQuery({
    queryKey: ['dashboard', repName],
    queryFn: async () => {
      const res = await fetch(`/api/get-rep-stats?rep=${encodeURIComponent(repName || '')}`)
      if (!res.ok) throw new Error('Failed to fetch dashboard data')
      return res.json()
    },
    enabled: !!repName,
  })
}
