import { useQuery } from '@tanstack/react-query'

export function useDashboardData(repName?: string | null) {
  const repParam = repName || 'all'
  return useQuery({
    queryKey: ['dashboard', repParam],
    queryFn: async () => {
      const res = await fetch(`/api/get-rep-stats?repId=${encodeURIComponent(repParam)}`)
      if (!res.ok) throw new Error('Failed to fetch dashboard data')
      return res.json()
    },
    enabled: true,
  })
}
