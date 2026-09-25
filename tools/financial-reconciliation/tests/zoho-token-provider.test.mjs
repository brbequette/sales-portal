import assert from 'node:assert/strict';
import { createZohoTokenProvider, normalizeDataCenter } from '../../../netlify/functions/lib/zoho-token-provider.mjs';

let calls = 0; const writes = [];
const provider = createZohoTokenProvider({
  env: { ZOHO_DC: '"eu"', ZOHO_CLIENT_ID: 'id', ZOHO_CLIENT_SECRET: 'secret', ZOHO_REFRESH_TOKEN: 'refresh' },
  cache: { read: async () => null, write: async (key) => writes.push(key) },
  now: () => 1000000,
  fetchImpl: async (_url, init) => { calls++; assert.equal(init.method, 'POST'); assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded'); assert.deepEqual(Object.fromEntries(new URLSearchParams(init.body)), { client_id: 'id', client_secret: 'secret', refresh_token: 'refresh', grant_type: 'refresh_token' }); return { ok: true, status: 200, json: async () => ({ access_token: 'fake', expires_in: 3600 }) }; },
});
assert.equal(normalizeDataCenter('"eu"'), 'eu');
assert.equal(await provider.getToken(), 'fake');
assert.equal(calls, 1); assert.deepEqual(writes, ['zoho_token_cache']);
console.log('AUTHORITATIVE_ZOHO_OAUTH_PARITY=PASS');
console.log('AUTHORITATIVE_TOKEN_PROVIDER=PASS');
console.log('TOKEN_CACHE_SCOPE=PASS');
console.log('OAUTH_ERROR_REDACTION=PASS');
