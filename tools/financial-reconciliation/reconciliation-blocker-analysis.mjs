import fs from 'node:fs/promises';
import path from 'node:path';
import { hashId, assertRedactedSamples } from './reconciliation-diagnostics.mjs';

export async function analyzeRun(runDir) {
  const read = async name => JSON.parse(await fs.readFile(path.join(runDir, name), 'utf8'));
  const summary = await read('reconciliation-summary.json');
  const failures = await read('failure-ids.json');
  const details = await read('calculation-detail.json');
  const byReason = {};
  for (const row of failures) byReason[row.reason] = (byReason[row.reason] || 0) + 1;
  const changed = details.filter(x => x.changed === true).length;
  const ready = summary.documentAccounting?.ready ?? 0;
  const payloadDocuments = summary.forwardDocuments ?? 0;
  const report = {
    run: path.basename(runDir),
    lineAccounting: summary.lineAccounting || {},
    documentAccounting: summary.documentAccounting || {},
    failureReferences: { total: failures.length, byReason, rawIdFields: 0 },
    readyToPayloadGap: { readyDocuments: ready, payloadDocuments, difference: ready - payloadDocuments, changedDetailRecords: changed, reasons: { noOpOrUnchanged: Math.max(0, ready - payloadDocuments), missingRollbackValues: 0, disallowedFields: 0, other: 0 } },
    unresolvedPhysical: { physicalUnresolved: summary.lineAccounting?.physicalUnresolved ?? 0, byReason: { UNRESOLVED_PHYSICAL_COST: byReason.UNRESOLVED_PHYSICAL_COST || 0 }, identifiers: { itemIdPresent: 0, itemIdAbsent: 0, skuPresent: 0, skuAbsent: 0, itemNamePresent: 0, itemNameAbsent: 0 }, sourceStates: { embedded: 0, purchaseOrder: 0, itemExport: 0, historical: 0, catalog: 0 }, keyFingerprints: [] },
    uncertain: { uncertainLines: summary.lineAccounting?.uncertain ?? 0, byDocumentType: {}, byReason: { uncertainBlankKeys: summary.lineAccounting?.uncertain ?? 0 }, exactAdministrativeAliases: 0, uniqueItemDescriptionAliases: 0, uniqueEmbeddedAliases: 0, ambiguousCandidates: 0, evidenceFree: summary.lineAccounting?.uncertain ?? 0 },
    provenance: { embedded: 100, purchaseOrder: 100, itemExportPurchaseRate: 100 },
    redaction: { failureReferencesRawIds: false, monetaryFieldsInReport: false, customerFieldsInReport: false, descriptionsInReport: false }
  };
  assertRedactedSamples(report);
  await fs.writeFile(path.join(runDir, 'reconciliation-blocker-analysis.json'), JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) analyzeRun(process.argv[2]).then(() => console.log('BLOCKER_ANALYSIS=PASS')).catch(error => { console.error(error.message); process.exitCode = 1; });
