import { useQuery } from '@tanstack/react-query'

export function useInvoices(filters?: { status?: string; rep?: string }) {
  return useQuery({
    queryKey: ['invoices', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.status) params.set('status', filters.status)
      if (filters?.rep) params.set('rep', filters.rep)
      const res = await fetch(`/api/invoices?${params}`)
      if (!res.ok) throw new Error('Failed to fetch invoices')
      return res.json()
    },
  })
}
