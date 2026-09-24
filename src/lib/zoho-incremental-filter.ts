const DEFAULT_OVERLAP_MS = 2 * 60 * 1000

function overlappedTimestamp(
  lastSyncAt: string | null | undefined,
  overlapMs = DEFAULT_OVERLAP_MS,
): Date | null {
  if (!lastSyncAt) return null
  const parsed = new Date(lastSyncAt)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(parsed.getTime() - overlapMs)
}

/** Zoho Books requires a full timestamp with a numeric UTC offset. */
export function zohoBooksSinceParam(lastSyncAt: string | null | undefined): string {
  const since = overlappedTimestamp(lastSyncAt)
  if (!since) return ''
  const value = `${since.toISOString().slice(0, 19)}+0000`
  return `&last_modified_time=${encodeURIComponent(value)}`
}

/** Zoho CRM accepts incremental cursors only through If-Modified-Since. */
export function zohoCrmModifiedSince(lastSyncAt: string | null | undefined): string | null {
  const since = overlappedTimestamp(lastSyncAt)
  if (!since) return null
  return since.toISOString().replace('.000Z', '+00:00')
}

export function zohoCrmReadHeaders(
  accessToken: string,
  lastSyncAt: string | null | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${accessToken}`,
  }
  const modifiedSince = zohoCrmModifiedSince(lastSyncAt)
  if (modifiedSince) headers['If-Modified-Since'] = modifiedSince
  return headers
}
