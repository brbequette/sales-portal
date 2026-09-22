const cleanEnv = (value: string | undefined) => value?.trim().replace(/^(["'])(.*)\1$/, "$2") || ""

let cachedVoiceToken: string | null = null
let voiceTokenExpiresAt = 0

export async function getZohoVoiceAccessToken(forceRefresh = false): Promise<string> {
  const now = Date.now()
  if (!forceRefresh && cachedVoiceToken && now < voiceTokenExpiresAt - 5 * 60 * 1000) {
    return cachedVoiceToken
  }

  const refreshToken = cleanEnv(process.env.ZOHO_VOICE_REFRESH_TOKEN)
  const clientId = cleanEnv(process.env.ZOHO_VOICE_CLIENT_ID) || cleanEnv(process.env.ZOHO_CLIENT_ID)
  const clientSecret = cleanEnv(process.env.ZOHO_VOICE_CLIENT_SECRET) || cleanEnv(process.env.ZOHO_CLIENT_SECRET)
  const dc = cleanEnv(process.env.ZOHO_DC) || "com"
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("Zoho Voice OAuth credentials missing. Configure ZOHO_VOICE_REFRESH_TOKEN with ZohoVoice.sms.CREATE scope.")
  }

  const response = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }).toString(),
    signal: AbortSignal.timeout(15000),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.access_token) {
    throw new Error(`Zoho Voice token refresh failed: ${String(data.error || data.code || response.status)}`)
  }

  cachedVoiceToken = String(data.access_token)
  voiceTokenExpiresAt = now + (Number(data.expires_in) || 3600) * 1000
  return cachedVoiceToken
}
