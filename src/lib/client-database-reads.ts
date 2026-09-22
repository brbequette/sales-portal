let summaryRequest: Promise<unknown> | null = null

/** Deduplicate concurrent header/dashboard reads without retaining stale data. */
export function fetchDatabaseSummary(): Promise<unknown> {
  if (!summaryRequest) {
    summaryRequest = fetch('/api/database-documents?summary=true', { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error || 'LOCAL_DATA_INCOMPLETE')
        return payload
      })
      .finally(() => { summaryRequest = null })
  }
  return summaryRequest
}
