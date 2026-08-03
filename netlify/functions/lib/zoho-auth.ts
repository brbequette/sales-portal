import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Module-level in-memory cache for fast local access
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;
export const ZOHO_DC = process.env.ZOHO_DC || 'com';
export const ZOHO_ORGANIZATION_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

export async function getZohoAccessToken() {
  const now = Date.now();

  // 1. Check in-memory cache first (valid for at least 5 minutes)
  if (_cachedToken && now < _tokenExpiresAt - 5 * 60 * 1000) {
    return _cachedToken;
  }

  // 2. Check Database SystemSettings for shared cached token
  try {
    const [dbTokenSetting, dbExpiresSetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'zoho_access_token' } }),
      prisma.systemSetting.findUnique({ where: { key: 'zoho_token_expires_at' } })
    ])

    if (dbTokenSetting && dbExpiresSetting) {
      const expiresAt = parseInt(dbExpiresSetting.value, 10)
      if (!isNaN(expiresAt) && now < expiresAt - 5 * 60 * 1000) {
        _cachedToken = dbTokenSetting.value
        _tokenExpiresAt = expiresAt
        return _cachedToken
      }
    }
  } catch (e: any) {
    console.warn('Database token cache read error:', e.message)
  }

  // 3. Try Zoho OAuth refresh_token flow
  if (process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET) {
    try {
      const params = new URLSearchParams({
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token',
      });

      const res = await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const data = await res.json();
      if (data.access_token) {
        const tokenVal = data.access_token
        const expiresVal = now + (data.expires_in || 3600) * 1000

        _cachedToken = tokenVal
        _tokenExpiresAt = expiresVal

        // Save new token to Database
        try {
          await prisma.$transaction([
            prisma.systemSetting.upsert({
              where: { key: 'zoho_access_token' },
              update: { value: tokenVal },
              create: { key: 'zoho_access_token', value: tokenVal }
            }),
            prisma.systemSetting.upsert({
              where: { key: 'zoho_token_expires_at' },
              update: { value: expiresVal.toString() },
              create: { key: 'zoho_token_expires_at', value: expiresVal.toString() }
            })
          ])
        } catch (dbErr: any) {
          console.warn('Database token cache write error:', dbErr.message)
        }

        return _cachedToken;
      }
      console.warn('Zoho Token Refresh failed:', JSON.stringify(data));
    } catch (e: any) {
      console.warn('Zoho Token fetch error:', e.message);
    }
  }

  // 4. Fallback: use static token
  if (process.env.ZOHO_ACCESS_TOKEN) {
    _cachedToken = process.env.ZOHO_ACCESS_TOKEN;
    _tokenExpiresAt = now + 55 * 60 * 1000;
    return _cachedToken;
  }

  throw new Error('No Zoho access token available. Please set ZOHO_REFRESH_TOKEN in Environment Variables.');
}

export async function pushZohoNote(accountId: string, title: string, content: string) {
  try {
    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/crm/v3/Notes`
    const zohoPayload = {
      data: [{
        Note_Title: title,
        Note_Content: content,
        Parent_Id: {
          id: accountId
        },
        $se_module: "Accounts"
      }]
    }

    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(zohoPayload)
    })
    
    const data = await res.json()
    if (data?.data?.[0]?.code !== "SUCCESS") {
      console.warn("Zoho CRM Note push returned non-success:", data)
    }
  } catch (err: any) {
    console.error("pushZohoNote failed:", err.message)
  }
}
