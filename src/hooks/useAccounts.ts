import { useQuery } from '@tanstack/react-query'

export function useAccounts(filters?: { status?: string; owner?: string; quality?: string }) {
  return useQuery({
    queryKey: ['accounts', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.status) params.set('status', filters.status)
      if (filters?.owner) params.set('owner', filters.owner)
      if (filters?.quality) params.set('quality', filters.quality)
      const res = await fetch(`/api/get-accounts?${params}`)
      if (!res.ok) throw new Error('Failed to fetch accounts')
      return res.json()
    },
  })
}
