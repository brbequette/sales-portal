import fs from 'node:fs/promises';
import path from 'node:path';
import { createZohoTokenProvider, normalizeDataCenter } from '../../netlify/functions/lib/zoho-token-provider.mjs';

export async function runZohoApplyPreflight({ env = process.env, fetchImpl = fetch, cache, outputDir }) {
  const provider = createZohoTokenProvider({ env, fetchImpl, cache });
  const organizationId = String(env.ZOHO_ORGANIZATION_ID || '');
  const base = `https://www.zohoapis.${normalizeDataCenter(env.ZOHO_DC)}/books/v3`;
  let status = 'FAIL'; let category = 'other_oauth_failure';
  try {
    const token = await provider.getToken();
    const response = await fetchImpl(`${base}/organizations`, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: AbortSignal.timeout(15000) });
    const payload = await response.json().catch(() => ({}));
    const organizations = payload.organizations || payload.organizations_list || [];
    if (!organizations.some(item => String(item.organization_id) === organizationId)) { category = 'organization_mismatch'; throw new Error(category); }
    status = 'PASS'; category = null;
  } finally {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'zoho-apply-preflight.json'), JSON.stringify({ status, category, documentWrites: 0, organizationGuard: status === 'PASS' }, null, 2));
  }
  return { status, documentWrites: 0 };
}

if (process.argv[1]?.endsWith('reconciliation-zoho-apply-preflight.mjs')) {
  runZohoApplyPreflight({ outputDir: process.env.RECONCILIATION_OUTPUT || process.cwd() }).then(result => { console.log(`ZOHO_APPLY_PREFLIGHT=${result.status}`); console.log('DOCUMENT_WRITES=0'); process.exit(result.status === 'PASS' ? 0 : 1); }).catch(() => process.exit(1));
}
