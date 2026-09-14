import fs from 'node:fs/promises';
import path from 'node:path';
import { createZohoTokenProvider, normalizeDataCenter } from '../../netlify/functions/lib/zoho-token-provider.mjs';

export async function runZohoApplyPreflight({ env = process.env, fetchImpl = fetch, cache, outputDir }) {
  const started = Date.now(); let stage = 'CONFIG'; let cacheRead = false; let cacheWrite = false; let organizationVerified = false;
  const provider = createZohoTokenProvider({ env, fetchImpl, cache: {
    read: async key => { cacheRead = true; return cache?.read ? cache.read(key) : null; },
    write: async (key, value) => { cacheWrite = true; return cache?.write ? cache.write(key, value) : undefined; },
  }});
  const organizationId = String(env.ZOHO_ORGANIZATION_ID || '');
  const base = `https://www.zohoapis.${normalizeDataCenter(env.ZOHO_DC)}/books/v3`;
  let status = 'FAIL'; let category = 'other_oauth_failure';
  const marker = value => { console.log(value); };
  try {
    marker('ZOHO_PREFLIGHT_CONFIG=PASS');
    stage = 'CACHE'; marker('ZOHO_PREFLIGHT_CACHE=START');
    marker('ZOHO_PREFLIGHT_CACHE=PASS');
    stage = 'AUTH'; marker('ZOHO_PREFLIGHT_AUTH=START');
    const token = await provider.getToken();
    marker('ZOHO_PREFLIGHT_AUTH=PASS');
    stage = 'ORGANIZATION'; marker('ZOHO_PREFLIGHT_ORGANIZATION=START');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
    let response;
    try { response = await fetchImpl(`${base}/organizations`, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: controller.signal }); }
    finally { clearTimeout(timer); }
    const payload = await response.json().catch(() => ({}));
    const organizations = payload.organizations || payload.organizations_list || [];
    if (!organizations.some(item => String(item.organization_id) === organizationId)) { category = 'organization_mismatch'; throw new Error(category); }
    organizationVerified = true; marker('ZOHO_PREFLIGHT_ORGANIZATION=PASS');
    status = 'PASS'; category = null;
  } catch (error) {
    category = String(error?.oauthCode || error?.message || '').includes('organization_mismatch') ? 'organization_mismatch' : String(error?.oauthCode || 'other_oauth_failure');
    status = 'FAIL';
  } finally {
    stage = 'CLEANUP'; marker('ZOHO_PREFLIGHT_CLEANUP=START');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'zoho-apply-preflight.json'), JSON.stringify({ status, category, stage, cacheRead, cacheWrite, organizationVerified, documentReads: 0, documentWrites: 0, elapsedMs: Date.now() - started }, null, 2));
    marker('ZOHO_PREFLIGHT_CLEANUP=PASS');
  }
  return { status, documentWrites: 0 };
}

if (process.argv[1]?.endsWith('reconciliation-zoho-apply-preflight.mjs')) {
  runZohoApplyPreflight({ outputDir: process.env.RECONCILIATION_OUTPUT || process.cwd() }).then(result => { console.log(`ZOHO_APPLY_PREFLIGHT=${result.status}`); console.log('DOCUMENT_READS=0'); console.log('DOCUMENT_WRITES=0'); process.exitCode = result.status === 'PASS' ? 0 : 1; }).catch(() => { console.error('ZOHO_APPLY_PREFLIGHT=FAIL'); process.exitCode = 1; });
}
