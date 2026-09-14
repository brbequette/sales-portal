const endpointFor = type => ({ invoice: 'invoices', quote: 'estimates', sales_order: 'salesorders' }[type] ?? null);
const json = async response => { const body = await response.json().catch(() => ({})); if (!response.ok) { const error = new Error(`ZOHO_HTTP_${response.status}`); error.status = response.status; throw error; } return body; };

export function createZohoBooksClient({ env = process.env, fetchImpl = fetch } = {}) {
  const required = ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_ORGANIZATION_ID'];
  for (const key of required) if (!env[key]) throw new Error('ZOHO_CONFIGURATION_MISSING');
  const dc = env.ZOHO_DC || 'com'; const organizationId = String(env.ZOHO_ORGANIZATION_ID); let token = null; let verified = false;
  const base = `https://www.zohoapis.${dc}/books/v3`;
  async function refresh() {
    const body = new URLSearchParams({ refresh_token: env.ZOHO_REFRESH_TOKEN, client_id: env.ZOHO_CLIENT_ID, client_secret: env.ZOHO_CLIENT_SECRET, grant_type: 'refresh_token' });
    const response = await fetchImpl(`https://accounts.zoho.${dc}/oauth/v2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const payload = await json(response); if (!payload.access_token) throw new Error('ZOHO_TOKEN_REFRESH_FAILED'); token = payload.access_token; return token;
  }
  async function request(url, options = {}, retry = true) {
    if (!token) await refresh(); const response = await fetchImpl(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Zoho-oauthtoken ${token}` } });
    if (response.status === 401 && retry) { token = null; await refresh(); return request(url, options, false); } return json(response);
  }
  async function verifyOrganization() {
    if (verified) return organizationId;
    const payload = await request(`${base}/organizations`); const organizations = payload.organizations || payload.organizations_list || [];
    if (!organizations.some(item => String(item.organization_id) === organizationId)) throw new Error('ORGANIZATION_MISMATCH');
    verified = true; return organizationId;
  }
  async function read(row) {
    await verifyOrganization(); const endpoint = endpointFor(row.documentType ?? row.type); if (!endpoint) throw new Error('ZOHO_DOCUMENT_TYPE_UNSUPPORTED');
    const payload = await request(`${base}/${endpoint}/${encodeURIComponent(String(row.documentId ?? row.zohoId))}?organization_id=${encodeURIComponent(organizationId)}`);
    const doc = payload.invoice || payload.estimate || payload.salesorder || payload.document || payload; return { organizationId, customFields: doc.custom_fields || doc.customFields || [] };
  }
  async function update(row, customFields) {
    await verifyOrganization(); const endpoint = endpointFor(row.documentType ?? row.type); if (!endpoint) throw new Error('ZOHO_DOCUMENT_TYPE_UNSUPPORTED');
    return request(`${base}/${endpoint}/${encodeURIComponent(String(row.documentId ?? row.zohoId))}?organization_id=${encodeURIComponent(organizationId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ custom_fields: customFields }) });
  }
  return Object.freeze({ organizationId, read, update, verifyOrganization });
}

export { endpointFor };
