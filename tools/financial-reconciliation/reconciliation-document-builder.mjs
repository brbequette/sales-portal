const ALLOWLIST = Object.freeze(['cf_salesperson_vig','cf_commision_from_profit','cf_dead_cost_total','cf_dead_cost_with_vig','cf_profit','cf_dead_profit_actual','cf_sales_commission']);
const clone = value => value && typeof value === 'object' ? structuredClone(value) : value;
const fieldArray = fields => Object.freeze(Object.entries(fields || {}).map(([apiName, value]) => Object.freeze({ apiName, value })));
export function buildCalculatedFields(document, context = {}) {
  const row = document.row || {};
  const commissionRaw = row.cf_commission_from_profit || row.cf_sales_commission_profit || row.commission_percentage || '';
  const commission = commissionRaw === '' || commissionRaw == null ? 50 : Number(commissionRaw);
  const calc = context.calculation || {};
  const vig = context.vig ?? calc.vig ?? 1.3;
  const fields = { cf_salesperson_vig: vig, cf_commision_from_profit: commission, cf_dead_cost_total: calc.deadCost ?? 0, cf_dead_cost_with_vig: (calc.deadCost ?? 0) + (calc.tariff ?? 0), cf_profit: calc.profit ?? 0, cf_dead_profit_actual: (calc.profit ?? 0) + (calc.cardFee ?? 0) + (calc.additionalCosts ?? 0) };
  return Object.freeze(Object.fromEntries(Object.entries(fields).filter(([key]) => ALLOWLIST.includes(key)).map(([key,value]) => [key,value])));
}
export function compareCalculatedFields(existingFields = {}, calculatedFields = {}) {
  const changedFields = {};
  for (const [key,value] of Object.entries(calculatedFields)) if (String(existingFields[key] ?? '') !== String(value ?? '')) changedFields[key] = value;
  return Object.freeze({ changedFields: clone(changedFields), noOp: Object.keys(changedFields).length === 0 });
}
export function buildRollbackFields(existingFields = {}, changedFields = {}) {
  const rollback = {};
  for (const key of Object.keys(changedFields)) { if (!Object.prototype.hasOwnProperty.call(existingFields,key)) throw new Error(`Missing rollback value: ${key}`); rollback[key] = existingFields[key]; }
  return Object.freeze(clone(rollback));
}
export function buildDocumentPayloadResult(document, context = {}) {
  const calculatedFields = buildCalculatedFields(document, context);
  const comparison = compareCalculatedFields(context.existingFields || {}, calculatedFields);
  const rollbackFields = buildRollbackFields(context.existingFields || {}, comparison.changedFields);
  const status = String(context.status || 'READY').toUpperCase();
  const excluded = status !== 'READY' ? [status] : [];
  return Object.freeze({ calculatedFields, changedFields: comparison.changedFields, noOp: comparison.noOp, forwardPayload: comparison.noOp || excluded.length ? null : Object.freeze({ zohoId: document.id, type: document.type, customFields: fieldArray(comparison.changedFields) }), rollbackPayload: comparison.noOp || excluded.length ? null : Object.freeze({ zohoId: document.id, type: document.type, customFields: fieldArray(rollbackFields) }), exclusionReasons: Object.freeze(excluded), calculationEvidence: clone(context.evidence || {}) });
}
export function buildDocumentResult(document, context = {}) {
  const payload = buildDocumentPayloadResult(document, context);
  const status = context.status || 'ready';
  return Object.freeze({ documentId: document.id, documentType: document.type, status, vigRate: context.vig ?? 1.3, vigReason: context.vigReason ?? 'baseline', commissionPct: payload.calculatedFields.cf_commision_from_profit, commissionPreserved: context.commissionPreserved === true, deadCostTotals: Object.freeze({ ...(context.deadCostTotals || {}) }), tariff: context.calculation?.tariff ?? 0, cardFee: context.calculation?.cardFee ?? 0, refunds: context.refunds ?? 0, additionalCosts: context.calculation?.additionalCosts ?? 0, ...payload, diagnostic: Object.freeze({ status, exclusionReason: payload.exclusionReasons[0] || null }) });
}
export { ALLOWLIST };
