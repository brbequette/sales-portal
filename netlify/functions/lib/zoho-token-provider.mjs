const CACHE_KEY = 'zoho_token_cache';
const SAFETY_MS = 5 * 60 * 1000;

export const SAFE_OAUTH_CATEGORIES = Object.freeze([
  'invalid_client','invalid_code','access_denied','unsupported_grant_type',
  'rate_limited','timeout','database_token_cache_failure','organization_mismatch','other_oauth_failure'
]);

export function cleanEnv(value) {
  return String(value ?? '').trim().replace(/^("|')(.*)\1$/, '$2');
}

export function normalizeDataCenter(value) { return cleanEnv(value) || 'com'; }

export function classifyOAuthFailure(error, status) {
  const code = String(error?.oauthCode ?? error?.code ?? '').toLowerCase();
  if (SAFE_OAUTH_CATEGORIES.includes(code)) return code;
  if (status === 429) return 'rate_limited';
  if (error?.name === 'TimeoutError' || error?.code === 'ABORT_ERR') return 'timeout';
  return 'other_oauth_failure';
}

export function createZohoTokenProvider({ env = {}, cache = {}, fetchImpl = globalThis.fetch, now = () => Date.now(), timeoutMs = 15000 } = {}) {
  let cachedToken = null;
  let cachedExpiresAt = 0;
  const dc = normalizeDataCenter(env.ZOHO_DC);
  const readCache = cache.read ?? (async () => null);
  const writeCache = cache.write ?? (async () => {});
  const required = ['ZOHO_CLIENT_ID','ZOHO_CLIENT_SECRET','ZOHO_REFRESH_TOKEN'];
  const config = Object.freeze(Object.fromEntries(required.map(key => [key, cleanEnv(env[key])] )));
  const getToken = async (forceRefresh = false) => {
    const current = now();
    if (!forceRefresh && cachedToken && current < cachedExpiresAt - SAFETY_MS) return cachedToken;
    if (!forceRefresh) {
      try {
        const row = await readCache(CACHE_KEY);
        if (row) {
          const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row;
          if (parsed?.token && current < Number(parsed.expiresAt) - SAFETY_MS) {
            cachedToken = parsed.token; cachedExpiresAt = Number(parsed.expiresAt); return cachedToken;
          }
        }
      } catch { /* cache failures are classified below only when persistence is required */ }
    }
    if (required.some(key => !config[key])) { const e = new Error('other_oauth_failure'); e.oauthCode = 'other_oauth_failure'; throw e; }
    const body = new URLSearchParams({ client_id: config.ZOHO_CLIENT_ID, client_secret: config.ZOHO_CLIENT_SECRET, refresh_token: config.ZOHO_REFRESH_TOKEN, grant_type: 'refresh_token' }).toString();
    let response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetchImpl(`https://accounts.zoho.${dc}/oauth/v2/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
        signal: controller.signal,
      });
    } catch (error) { const e = new Error(classifyOAuthFailure(error)); e.oauthCode = classifyOAuthFailure(error); throw e; }
    finally { clearTimeout(timer); }
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    if (!response.ok || !payload.access_token) {
      const e = new Error(classifyOAuthFailure({ oauthCode: payload.error }, response.status));
      e.oauthCode = classifyOAuthFailure({ oauthCode: payload.error }, response.status); throw e;
    }
    cachedToken = String(payload.access_token);
    cachedExpiresAt = current + (Number(payload.expires_in) || 3600) * 1000;
    try { await writeCache(CACHE_KEY, { token: cachedToken, expiresAt: cachedExpiresAt }); }
    catch { const e = new Error('database_token_cache_failure'); e.oauthCode = 'database_token_cache_failure'; throw e; }
    return cachedToken;
  };
  return Object.freeze({ getToken, dataCenter: dc, cacheKey: CACHE_KEY, config });
}
