import { COST_SOURCES } from '../reconciliation-calculations.mjs';
export { COST_SOURCES };
export const CALCULATED_FIELDS = new Set([
  'cf_salesperson_vig','cf_commision_from_profit','cf_dead_cost_total',
  'cf_dead_cost_subject_to_vig','cf_dead_cost_no_vig','cf_dead_cost_with_vig',
  'cf_profit','cf_dead_profit_actual','cf_sales_commission','cf_commission_status'
]);
export function validateZipEntries(entries) { for (const entry of entries) { const normalized = entry.replace(/\\/g, '/'); if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.split('/').includes('..')) throw new Error(`Unsafe ZIP entry: ${entry}`); } }
export function normalizeOrganizationName(value) { return String(value || '').toUpperCase().replace(/[.,]/g, ' ').replace(/\b(LLC|INC|CORP|CORPORATION)\b/g, ' ').replace(/\s+/g, ' ').trim(); }
export function selectZohoOrganization(response, configuredId) {
  const organizations = response?.organizations;
  if (!Array.isArray(organizations)) throw new Error('Malformed Zoho organization response');
  const matches = organizations.filter(item => String(item?.organization_id ?? '') === String(configuredId));
  if (matches.length !== 1) throw new Error(matches.length ? 'Duplicate matching Zoho organization ID' : 'Configured Zoho organization ID not found');
  const selected = matches[0]; const name = selected.organization_name ?? selected.name;
  if (!name || normalizeOrganizationName(name) !== 'TITAN DIAMOND USA') throw new Error('Zoho organization name mismatch');
  return { organizationName: name, normalizedName: normalizeOrganizationName(name), configuredOrganizationIdMatches: true, selectedOrganizationIdMatches: true, organizationId: String(selected.organization_id) };
}

export function resolveVig({ date, priorGoalMet, override }) {
  if (override != null && Number.isFinite(Number(override))) return Math.min(1.5, Math.max(1.0, Number(override)));
  const d = new Date(`${date}T00:00:00Z`);
  if (d < new Date('2025-01-01T00:00:00Z')) return 1.3;
  if (d.getUTCFullYear() === 2025 && d.getUTCMonth() === 0) return 1.3;
  return priorGoalMet ? 1.3 : 1.5;
}

export function resolveCommissionPct(value) {
  return value == null || String(value).trim() === '' ? 50 : Number(value);
}

export function chooseCost({ historical, breakdown, purchaseOrder, catalog, physical = true }) {
  if (historical != null) return { value: Number(historical), source: 'historical' };
  if (breakdown != null) return { value: Number(breakdown), source: 'historical-breakdown' };
  if (purchaseOrder != null) return { value: Number(purchaseOrder), source: COST_SOURCES.PO };
  if (catalog != null) return { value: Number(catalog), source: COST_SOURCES.CATALOG };
  if (!physical) return { value: 0, source: 'administrative-zero' };
  return { value: null, source: 'unresolved' };
}

export function validatePayload(payload) {
  if (!Array.isArray(payload)) throw new TypeError('Payload must be an array');
  const failures = [];
  for (const doc of payload) {
    if (!doc || typeof doc !== 'object' || !doc.zohoId || !Array.isArray(doc.customFields)) { failures.push(Object.freeze({ reason: 'INVALID_DOCUMENT_SHAPE' })); continue; }
    for (const field of doc.customFields) {
      if (!field || typeof field !== 'object' || !CALCULATED_FIELDS.has(field.apiName)) failures.push(Object.freeze({ reason: 'FIELD_NOT_ALLOWLISTED' }));
      else if ('lineItems' in field || 'nativeFields' in field) failures.push(Object.freeze({ reason: 'NATIVE_OR_LINE_ITEM_DATA' }));
    }
  }
  return Object.freeze(failures);
}

export function assertReconciliationComplete({ documents, forward, rollback, failures }) {
  if (!documents) throw new Error('No parsed documents');
  if (forward.length !== rollback.length) throw new Error('Forward/rollback count mismatch');
  if (failures.length) throw new Error('Reconciliation failures present');
  if (!forward.length && Number(documents) > 0) throw new Error('Empty forward payload for parsed documents');
}

export function buildDocumentPayload(doc) {
  const vig = resolveVig(doc);
  const commissionPct = resolveCommissionPct(doc.commissionPct);
  if (!Number.isFinite(vig) || !Number.isFinite(commissionPct)) throw new Error(`Unresolved calculated values for ${doc.zohoId}`);
  return { zohoId: doc.zohoId, customFields: [
    { apiName: 'cf_salesperson_vig', value: vig },
    { apiName: 'cf_commision_from_profit', value: commissionPct }
  ] };
}
