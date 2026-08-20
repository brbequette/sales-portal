import { prisma } from "./prisma"

// ─────────────────────────────────────────────────────────────────────────────
// Zoho Auth — Canonical Single Source of Truth
//
// All Netlify functions import getZohoAccessToken from here.
// src/lib/zoho-auth.ts is a thin re-export of this file.
//
// Token cache strategy:
//   1. In-memory (warm invocations)       → 0 ms
//   2. Single DB row 'zoho_token_cache'   → 1 DB read  (was 2)
//   3. OAuth refresh_token flow           → 1 HTTP POST + 1 DB write (was 2)
//   4. Throw — never fall back to a static access token
// ─────────────────────────────────────────────────────────────────────────────

let _cachedToken: string | null = null
let _tokenExpiresAt = 0

const cleanEnv = (value: string | undefined) => value?.trim().replace(/^(["'])(.*)\1$/, '$2') || ''

export const ZOHO_DC = cleanEnv(process.env.ZOHO_DC) || 'com'

// Single exported constant — import this everywhere instead of re-declaring
export const ZOHO_ORGANIZATION_ID = cleanEnv(process.env.ZOHO_ORGANIZATION_ID) || '664670946'

const TOKEN_CACHE_KEY = 'zoho_token_cache'

export async function getZohoAccessToken(forceRefresh = false): Promise<string> {
  const now = Date.now()

  // 1. In-memory cache (avoids DB on warm invocations)
  if (!forceRefresh && _cachedToken && now < _tokenExpiresAt - 5 * 60 * 1000) {
    return _cachedToken
  }

  // 2. Single DB row — token + expiry stored as one JSON value
  if (!forceRefresh) {
    try {
      const row = await prisma.systemSetting.findUnique({ where: { key: TOKEN_CACHE_KEY } })
      if (row) {
        const cached = JSON.parse(row.value) as { token: string; expiresAt: number }
        if (cached.token && now < cached.expiresAt - 5 * 60 * 1000) {
          _cachedToken = cached.token
          _tokenExpiresAt = cached.expiresAt
          return _cachedToken
        }
      }
    } catch (e: any) {
      console.warn('[zoho-auth] DB token cache read error:', e.message)
    }
  }

  // 3. OAuth refresh_token flow
  const refreshToken = cleanEnv(process.env.ZOHO_REFRESH_TOKEN)
  const clientId = cleanEnv(process.env.ZOHO_CLIENT_ID)
  const clientSecret = cleanEnv(process.env.ZOHO_CLIENT_SECRET)
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Zoho OAuth credentials missing. Set ZOHO_REFRESH_TOKEN, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET.')
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id:     clientId,
    client_secret: clientSecret,
    grant_type:    'refresh_token',
  })

  const res = await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, { signal: AbortSignal.timeout(15000),
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  })

  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`Zoho token refresh failed: ${JSON.stringify(data)}`)
  }

  const tokenVal  = data.access_token as string
  const expiresAt = now + (data.expires_in || 3600) * 1000

  _cachedToken   = tokenVal
  _tokenExpiresAt = expiresAt

  // Persist as single JSON row — 1 upsert instead of 2
  try {
    await prisma.systemSetting.upsert({
      where:  { key: TOKEN_CACHE_KEY },
      update: { value: JSON.stringify({ token: tokenVal, expiresAt }) },
      create: { key: TOKEN_CACHE_KEY, value: JSON.stringify({ token: tokenVal, expiresAt }) },
    })
  } catch (dbErr: any) {
    console.warn('[zoho-auth] DB token cache write error:', dbErr.message)
  }

  return _cachedToken
}

// ─────────────────────────────────────────────────────────────────────────────
// pushZohoNote
//
// Creates a CRM Note on an Account (default) or any other module record.
// Pass dealId + seModule = "Deals" to link call logs to the deal pipeline.
// ─────────────────────────────────────────────────────────────────────────────
export async function pushZohoNote(
  accountId: string,
  title:     string,
  content:   string,
  options?:  { dealId?: string; seModule?: string }
): Promise<void> {
  try {
    const token  = await getZohoAccessToken()
    const module = options?.seModule || 'Accounts'
    const noteId = options?.dealId || accountId

    const zohoPayload = {
      data: [{
        Note_Title:   title,
        Note_Content: content,
        Parent_Id:    { id: noteId },
        $se_module:   module,
      }],
    }

    const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Notes`, { signal: AbortSignal.timeout(15000),
      method:  'POST',
      headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(zohoPayload),
    })

    const responseData = await res.json()
    if (responseData?.data?.[0]?.code !== 'SUCCESS') {
      console.warn('[pushZohoNote] Non-success response:', responseData)
    }
  } catch (err: any) {
    console.error('[pushZohoNote] Failed:', err.message)
  }
}
