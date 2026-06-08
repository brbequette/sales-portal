// Module-level token cache
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;
const ZOHO_DC = process.env.ZOHO_DC || 'com';

export async function getZohoAccessToken() {
  const now = Date.now();

  // 1. Return cached token if still valid
  if (_cachedToken && now < _tokenExpiresAt - 5 * 60 * 1000) {
    return _cachedToken;
  }

  // 2. Try OAuth refresh_token flow
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
        _cachedToken = data.access_token;
        _tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
        return _cachedToken;
      }
      console.warn('Zoho Token Refresh failed:', JSON.stringify(data));
    } catch (e: any) {
      console.warn('Zoho Token fetch error:', e.message);
    }
  }

  // 3. Fallback: use a static access token set as an env var if defined
  if (process.env.ZOHO_ACCESS_TOKEN) {
    _cachedToken = process.env.ZOHO_ACCESS_TOKEN;
    _tokenExpiresAt = now + 55 * 60 * 1000;
    return _cachedToken;
  }

  throw new Error('No Zoho access token available. Please set ZOHO_REFRESH_TOKEN in Environment Variables.');
}
