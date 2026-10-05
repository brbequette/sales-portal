export function normalizeMailboxAddress(value: unknown) { return String(value || '').trim().toLowerCase() }
export function isMailboxAddress(value: string) { return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value) }
export function sameOriginEmailRequest(req: Request) {
  const origin = req.headers.get('origin')
  return Boolean(origin && origin === new URL(req.url).origin && req.headers.get('sec-fetch-site') !== 'cross-site')
}
export function graphContinuationUrl(value: string) {
  const url = new URL(value, 'https://graph.microsoft.com/v1.0')
  if (url.origin !== 'https://graph.microsoft.com' || !url.pathname.startsWith('/v1.0/users/') || url.username || url.password || url.hash) throw new Error('Microsoft returned an invalid continuation URL.')
  return url.toString()
}
