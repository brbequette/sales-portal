/**
 * accountService.ts
 *
 * Client-side service for all account operations.
 * Single source of truth for account fetch and update calls.
 * Eliminates duplicate fetch patterns in:
 *   - page.tsx (multiple account fetch/update locations)
 *   - AccountSlideout.tsx
 *   - account/page.tsx
 *   - AccountEditModal.tsx
 *   - QualityPicker.tsx
 *   - StatusPicker.tsx
 *   - TimezonePicker.tsx
 *
 * Backend endpoints are preserved as-is; this layer just unifies the client-side call patterns.
 */

// ─── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchAccount(accountId: string): Promise<any> {
  const res = await fetch("/api/get-account-details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId }),
  })
  if (!res.ok) throw new Error(`Failed to fetch account ${accountId}: ${res.status}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.error || "Failed to fetch account")
  return data.account
}

// ─── Patch helpers ─────────────────────────────────────────────────────────────

export interface AccountPatch {
  // General fields (update-account-details)
  name?: string
  industry?: string
  timeZone?: string
  tags?: string[]
  quality?: string
  status?: string
  bladeSizes?: string[]
  materialsCut?: string[]
  currentSupplier?: string
  averageBladeCost?: number
  crewCount?: number
  bladesPerOrder?: number
  improvementPriority?: string

  // Owner change (update-account-owner — has its own Zoho CRM workflow)
  newOwnerId?: string
  note?: string

  // Zoho ID for lookup fallback
  zohoId?: string
}

/**
 * Update one or more fields on an account.
 *
 * Internally routes to the correct endpoint:
 *   - `newOwnerId` → /api/update-account-owner  (also updates Zoho CRM owner + contacts)
 *   - `status`     → /api/update-account-status  (validates enum, logs note)
 *   - `quality`    → /api/update-account-quality (validates enum, logs note)
 *   - `timeZone`   → /api/update-account-timezone (pushes to Zoho CRM field)
 *   - everything else → /api/update-account-details
 *
 * Callers can pass any combination — this service will fan out to the right endpoints.
 */
export async function updateAccount(accountId: string, patch: AccountPatch): Promise<any> {
  const results: any[] = []

  // Owner change — dedicated endpoint with CRM sync
  if (patch.newOwnerId !== undefined) {
    const res = await fetch("/api/update-account-owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, newOwnerId: patch.newOwnerId }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.message || data.error || "Owner update failed")
    results.push(data)
  }

  // Status change — validated + note-logged by dedicated endpoint
  if (patch.status !== undefined) {
    const res = await fetch("/api/update-account-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, zohoId: patch.zohoId, status: patch.status, note: patch.note }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || "Status update failed")
    results.push(data)
  }

  // Quality change — validated + note-logged by dedicated endpoint
  if (patch.quality !== undefined) {
    const res = await fetch("/api/update-account-quality", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, zohoId: patch.zohoId, quality: patch.quality, note: patch.note }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || "Quality update failed")
    results.push(data)
  }

  // Timezone change — pushes to Zoho CRM
  if (patch.timeZone !== undefined) {
    const res = await fetch("/api/update-account-timezone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, zohoId: patch.zohoId, timeZone: patch.timeZone }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || "Timezone update failed")
    results.push(data)
  }

  // General details — anything not handled above
  const detailFields = [
    "name", "industry", "tags",
    "bladeSizes", "materialsCut", "currentSupplier",
    "averageBladeCost", "crewCount", "bladesPerOrder", "improvementPriority",
  ]
  const detailPatch: Record<string, any> = {}
  for (const key of detailFields) {
    if ((patch as any)[key] !== undefined) detailPatch[key] = (patch as any)[key]
  }
  if (Object.keys(detailPatch).length > 0) {
    const res = await fetch("/api/update-account-details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, ...detailPatch }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || "Account details update failed")
    results.push(data)
  }

  // Return the last result's account (or first if only one)
  const last = results[results.length - 1]
  return last?.account ?? last
}
