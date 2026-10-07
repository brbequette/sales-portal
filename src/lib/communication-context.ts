export const COMMUNICATION_CONTEXT_EVENT = 'titan:communication-context'
export type CommunicationContext = {
  accountId?: string
  title?: string
  kind?: 'account' | 'product' | 'Invoice' | 'SalesOrder' | 'Quote'
  recordId?: string
  productSearch?: string
}

let current: CommunicationContext | null = null
let sourcePath = ''
export function getCommunicationContext() {
  if (typeof window !== 'undefined' && sourcePath !== `${window.location.pathname}${window.location.search}`) return null
  return current
}
export function publishCommunicationContext(context: CommunicationContext | null) {
  current = context
  sourcePath = `${window.location.pathname}${window.location.search}`
  window.dispatchEvent(new CustomEvent(COMMUNICATION_CONTEXT_EVENT, { detail: context }))
  window.dispatchEvent(new CustomEvent('titanAiContext', { detail: { selectedRecord: context ? JSON.stringify(context) : undefined } }))
}

// Only application paths may be embedded on screen two; never recurse into a display.
export function screenOneFramePath(path: string) {
  if (!path.startsWith('/') || path.startsWith('//')) return null
  const url = new URL(path, 'https://titan.local')
  if (url.origin !== 'https://titan.local' || /^\/(display|communications|login|api)(\/|$)/.test(url.pathname)) return null
  url.searchParams.set('display', '1')
  return `${url.pathname}${url.search}`
}
