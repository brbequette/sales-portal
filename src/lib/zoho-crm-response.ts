export type CrmWriteResult =
  | { ok: true; id: string; code: string; message: string; details: Record<string, unknown> }
  | { ok: false; code: string; message: string }

// Provider response bodies are runtime JSON with no compile-time schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function interpretCrmWriteResponse(httpStatus: number, payload: any): CrmWriteResult {
  const row = Array.isArray(payload?.data) ? payload.data[0] : null
  const code = String(row?.code || payload?.code || `HTTP_${httpStatus}`)
  const baseMessage = String(row?.message || payload?.message || 'Malformed Zoho CRM response.')
  const rejectedField = String(row?.details?.api_name || row?.details?.field || '').trim()
  const message = rejectedField ? `${baseMessage} (field: ${rejectedField})` : baseMessage
  const id = String(row?.details?.id || row?.id || '').trim()
  if (httpStatus < 200 || httpStatus >= 300 || row?.status !== 'success' || !id) {
    return { ok: false, code, message: id ? message : `${message} Missing returned record ID.` }
  }
  return { ok: true, id, code, message, details: row.details || {} }
}

// Provider response bodies are runtime JSON with no compile-time schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function interpretCrmConversionResponse(httpStatus: number, payload: any): CrmWriteResult & { accountId?: string; contactId?: string } {
  const row = Array.isArray(payload?.data) ? payload.data[0] : null
  const details = row?.details || {}
  const accountId = String(details.Accounts || details.accounts || '').trim()
  const contactId = String(details.Contacts || details.contacts || '').trim()
  const code = String(row?.code || payload?.code || `HTTP_${httpStatus}`)
  const message = String(row?.message || payload?.message || 'Malformed Zoho CRM conversion response.')
  if (httpStatus < 200 || httpStatus >= 300 || row?.status !== 'success' || !accountId) {
    return { ok: false, code, message: accountId ? message : `${message} Missing returned Account ID.` }
  }
  return { ok: true, id: accountId, accountId, contactId: contactId || undefined, code, message, details }
}
