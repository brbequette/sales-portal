import fs from 'node:fs'
export function loadEnvironment(path) {
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2')
  }
}
export function invoiceProviderClient() {
  const ledgerPath = 'artifacts/invoice-completion/provider-call-ledger.json'
  let token, expires = 0, nextSlot = 0, refreshing
  async function request(url, options, purpose) {
    const slot = Math.max(Date.now(), nextSlot)
    nextSlot = slot + 750
    const delay = Math.max(0, slot - Date.now())
    if (delay) await new Promise(r => setTimeout(r, delay))
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
    if (ledger.calls >= Math.min(14999, ledger.limit)) throw new Error('API_BUDGET_EXHAUSTED')
    ledger.calls++
    ledger.attempts.push({ at: new Date().toISOString(), purpose })
    fs.writeFileSync(ledgerPath + '.tmp', JSON.stringify(ledger))
    fs.renameSync(ledgerPath + '.tmp', ledgerPath)
    return fetch(url, { ...options, signal: AbortSignal.timeout(30000) })
  }
  return { async get(path, params = {}) {
    const dc = process.env.ZOHO_DC || 'com'
    if (!token || Date.now() > expires) {
      refreshing ||= (async () => {
      const response = await request(`https://accounts.zoho.${dc}/oauth/v2/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: process.env.ZOHO_REFRESH_TOKEN, client_id: process.env.ZOHO_CLIENT_ID, client_secret: process.env.ZOHO_CLIENT_SECRET }) }, 'oauth-refresh')
      const data = await response.json()
      if (!response.ok || !data.access_token) throw new Error('PROVIDER_AUTH_FAILED')
      token = data.access_token; expires = Date.now() + 3000000
      })()
      try { await refreshing } finally { refreshing = undefined }
    }
    const query = new URLSearchParams({ organization_id: process.env.ZOHO_ORGANIZATION_ID || '664670946', ...params })
    const response = await request(`https://www.zohoapis.${dc}/books/v3/${path}?${query}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` } }, path)
    const data = await response.json()
    if (!response.ok || data.code !== 0) throw new Error(`PROVIDER_READ_FAILED_${response.status}_${data.code}`)
    return data
  } }
}
