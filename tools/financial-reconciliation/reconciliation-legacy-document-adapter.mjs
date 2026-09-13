const clone = value => {
  if (value === undefined) return undefined;
  return structuredClone(value);
};

export function buildLegacyDocumentResult(input) {
  if (!input || typeof input !== 'object') throw new TypeError('Legacy adapter input is required');
  const {
    document, vig, allowlist = [], fieldMetadata = {}, existingFields = {},
    commissionPct = '', payments = [], lineItems = [], additionalCosts,
    calculateDocument, payloadValidator
  } = input;
  if (!document || typeof document !== 'object') throw new TypeError('Legacy adapter document is required');
  if (typeof calculateDocument !== 'function') throw new TypeError('Legacy adapter calculateDocument is required');
  const calculation = calculateDocument({
    id: document.id,
    date: document.date,
    commissionPct,
    lineItems,
    subtotal: document.subtotal || document.total,
    additionalCosts,
    payments
  }, { vig });
  const sources = Array.isArray(calculation.sources) ? calculation.sources : [];
  const lineAccounting = {
    totalLines: lineItems.length, physicalLines: 0, nonphysicalLines: 0,
    resolvedPhysicalLines: 0, unresolvedPhysicalLines: 0,
    historicalInvoiceJson: 0, embeddedBreakdown: 0, purchaseOrder: 0,
    itemExportPurchaseRate: 0, dbCatalogCost: 0
  };
  for (const source of sources) {
    if (source?.source === 'nonphysical') lineAccounting.nonphysicalLines++;
    else {
      lineAccounting.physicalLines++;
      if (Object.hasOwn(lineAccounting, source?.source)) lineAccounting[source.source]++;
      if (source?.source === 'unresolved') lineAccounting.unresolvedPhysicalLines++;
      else lineAccounting.resolvedPhysicalLines++;
    }
  }
  const failures = Array.isArray(calculation.unresolvedLines) ? calculation.unresolvedLines : [];
  const failed = Boolean(calculation.failed);
  const resolvedHere = sources.filter(x => x?.source !== 'unresolved' && x?.source !== 'nonphysical').length;
  const documentAccounting = failed
    ? { fullyResolvedDocuments: 0, partiallyResolvedDocuments: resolvedHere > 0 ? 1 : 0, unresolvedDocuments: resolvedHere > 0 ? 0 : 1, noPhysicalCostRequiredDocuments: 0 }
    : { fullyResolvedDocuments: sources.length && sources.every(x => x?.source === 'nonphysical') ? 0 : 1, partiallyResolvedDocuments: 0, unresolvedDocuments: 0, noPhysicalCostRequiredDocuments: sources.length && sources.every(x => x?.source === 'nonphysical') ? 1 : 0 };
  const after = {
    cf_salesperson_vig: calculation.vig,
    cf_commision_from_profit: calculation.commissionPct,
    cf_dead_cost_total: calculation.deadCost,
    cf_dead_cost_with_vig: calculation.deadCost + calculation.tariff,
    cf_profit: calculation.profit,
    cf_dead_profit_actual: calculation.profit + calculation.cardFee + calculation.additionalCosts
  };
  const calculatedFields = Object.entries(after).map(([apiName, value]) => ({ apiName, value }));
  const changedFields = calculatedFields.filter(field => String(existingFields[field.apiName] ?? '') !== String(field.value ?? ''));
  const rollbackFields = Object.fromEntries(changedFields.map(field => [field.apiName, existingFields[field.apiName]]));
  const noOp = changedFields.length === 0;
  const validFields = allowlist.length ? changedFields.filter(field => allowlist.includes(field.apiName)) : changedFields;
  const forwardPayload = failed || noOp ? null : { zohoId: document.id, type: document.type, customFields: validFields };
  const rollbackPayload = failed || noOp ? null : { zohoId: document.id, type: document.type, customFields: rollbackFields };
  if (payloadValidator && forwardPayload) payloadValidator(forwardPayload);
  return Object.freeze({
    documentId: document.id, documentType: document.type, calculation: clone(calculation),
    lineAccounting: Object.freeze(lineAccounting), documentAccounting: Object.freeze(documentAccounting),
    failures: clone(failures), failureReferences: clone(failures.map((u, i) => ({ lineOrdinal: i + 1, itemId: u.itemId || null, sku: u.sku || null, attemptedSources: ['historicalInvoiceJson','embeddedBreakdown','purchaseOrder','itemExportPurchaseRate','dbCatalogCost'], reason: u.reason }))),
    calculationDetail: { type: document.type, zohoId: document.id, changed: !noOp, costSource: clone(sources), fields: { before: clone(existingFields), after: clone(after) }, paymentApplications: clone(payments), cardFee: calculation.cardFee, additionalCosts: calculation.additionalCosts, tariff: calculation.tariff },
    calculatedFields: clone(calculatedFields), changedFields: clone(validFields), noOp,
    forwardPayload: clone(forwardPayload), rollbackPayload: clone(rollbackPayload),
    exclusionReason: failed ? calculation.failed : null, fieldMetadata: clone(fieldMetadata)
  });
}
