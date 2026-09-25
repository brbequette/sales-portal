/** Use the configured public origin, never proxy/Host headers, for browser writes. */
export function telegramOriginAllowed(actual: string | null, configured: string | undefined): boolean {
  if (!actual || !configured) return false
  try {
    const expected = new URL(configured)
    if (expected.protocol !== 'https:' || expected.username || expected.password ||
        expected.pathname !== '/' || expected.search || expected.hash) return false
    return actual === expected.origin
  } catch {
    return false
  }
}
