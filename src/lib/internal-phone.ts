export function prepareInAppCall(phone: string | null | undefined, context: { accountId?: string; accountName?: string; contactName?: string } = {}) {
  if (!phone) return
  window.dispatchEvent(new CustomEvent('inAppDial', { detail: { phone: phone.replace(/[^\d+]/g, ''), ...context } }))
}
