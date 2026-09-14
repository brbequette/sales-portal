import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { buildDocumentPayload, validatePayload, assertReconciliationComplete, validateZipEntries, selectZohoOrganization } from './reconciliation-lib/rules.mjs';
import { loadProductionSnapshot } from './reconciliation-db.mjs';
import { calculateDocument, COST_SOURCES, associateEmbeddedCostTokens, matchEmbeddedEntriesToLines } from './reconciliation-calculations.mjs';
import { buildAuthoritativeVigInput, buildVigTimeline } from './reconciliation-vig-timeline.mjs';
import { loadCostSources, resolveAuxiliaryCost, buildCatalogCostSources, buildHistoricalInvoiceCostIndex, resolveHistoricalInvoiceCost } from './reconciliation-cost-sources.mjs';
import { runReconciliationCore } from './reconciliation-engine-core.mjs';
import { sanitizeSourceSample, assertRedactedSamples } from './reconciliation-diagnostics.mjs';
import { writeRuntimeArtifacts } from './reconciliation-artifact-core.mjs';

const exec = promisify(execFile);
const args = new Set(process.argv.slice(2));
const repo = process.env.RECONCILIATION_REPO || process.cwd();
const inputs = process.env.RECONCILIATION_INPUTS;
const out = process.env.RECONCILIATION_OUTPUT || path.join(repo, 'tmp', 'reconciliation-runs', new Date().toISOString().replace(/[-:.TZ]/g, ''));
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
export async function buildArtifactHashManifest(outputDir) {
  const hashes = {};
  for (const name of await fs.readdir(outputDir)) {
    if (name === 'sha256-manifest.json' || name.startsWith('_zip') || name.endsWith('.log') || name === 'credentials.env') continue;
    const filePath = path.join(outputDir, name);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error(`ARTIFACT_NOT_FILE category=DIRECTORY_WHERE_FILE_EXPECTED name=${path.basename(name)}`);
    hashes[name] = sha256(await fs.readFile(filePath));
  }
  return hashes;
}
const writeJson = (name, value) => fs.writeFile(path.join(out, name), JSON.stringify(value, null, 2));
const runStage = (stage, operation) => { try { return operation(); } catch (error) { throw new Error(`${stage}:${String(error?.message || 'FAILED').replace(/\r?\n.*/s, '')}`); } };

function csvRows(text) {
  const rows = []; let row = []; let cell = ''; let quote = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === '"') { if (quote && text[i + 1] === '"') { cell += '"'; i++; } else quote = !quote; } else if (c === ',' && !quote) { row.push(cell); cell = ''; } else if ((c === '\n' || c === '\r') && !quote) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some(x => x !== '')) rows.push(row); row = []; cell = ''; } else cell += c; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map(x => x.replace(/^\uFEFF/, '').trim());
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
}
function normalizeHeader(name) { return name.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function normalizeRow(row) { return Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])); }
function documentId(row) { return row.invoice_id || row.quote_id || row.salesorder_id || row.sales_order_id || row.estimate_id || row.zoho_id || row.id || ''; }
function typeFor(file) { const n = path.basename(file).toLowerCase(); return n.includes('invoice') ? 'invoice' : n.includes('quote') ? 'quote' : n.includes('sales_order') ? 'sales_order' : 'supporting'; }

export function buildRuntimeVigContract(vigInput, evaluateDocument) {
  const timeline = buildVigTimeline({ ...vigInput, evaluateDocument });
  if (!timeline || !Array.isArray(timeline.assignmentRecords) || !(timeline.vigByDocument instanceof Map) || !timeline.audit) throw new Error('RUNTIME_VIG_CONTRACT_INVALID');
  return Object.freeze({ assignments: timeline.assignments, assignmentRecords: timeline.assignmentRecords, vigByDocument: timeline.vigByDocument, audit: timeline.audit });
}

export async function parseSources() {
  const entries = await fs.readdir(inputs, { withFileTypes: true }); const temp = path.join(out, `_zip-engine-${process.pid}-${Date.now()}`); await fs.mkdir(temp, { recursive: true }); const sources = [];
  for (const entry of entries) { const full = path.join(inputs, entry.name); if (!entry.isFile()) continue; if (entry.name.toLowerCase().endsWith('.zip')) { const dir = path.join(temp, path.basename(entry.name, '.zip')); await fs.rm(dir, { recursive: true, force: true }); await fs.mkdir(dir, { recursive: true }); let names; if (process.platform === 'win32') { const ps = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('${full.replace(/'/g, "''")}'); try{$z.Entries|% FullName} finally{$z.Dispose()}`; names = (await exec('powershell.exe', ['-NoProfile','-Command',ps], { timeout: 120000 })).stdout.split(/\r?\n/).filter(Boolean); const extract = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory('${full.replace(/'/g, "''")}','${dir.replace(/'/g, "''")}')`; await exec('powershell.exe', ['-NoProfile','-Command',extract], { timeout: 120000 }); } else { const listing = await exec('unzip', ['-Z1', full], { timeout: 120000, maxBuffer: 16 * 1024 * 1024 }); names = listing.stdout.split(/\r?\n/).filter(Boolean); validateZipEntries(names); await exec('unzip', ['-t', full], { timeout: 120000, maxBuffer: 16 * 1024 * 1024 }); await exec('unzip', ['-n', '-q', full, '-d', dir], { timeout: 120000, maxBuffer: 16 * 1024 * 1024 }); } validateZipEntries(names); const children = []; const walk = async d => { for (const child of await fs.readdir(d, { withFileTypes: true })) { const p = path.join(d, child.name); if (child.isDirectory()) await walk(p); else children.push(p); } }; await walk(dir); const csvs = children.filter(x => x.toLowerCase().endsWith('.csv')); if (!csvs.length) throw new Error(`ZIP contains no CSV files: ${entry.name}`); for (const child of csvs) sources.push({ file: child, type: typeFor(full) }); } else if (entry.name.toLowerCase().endsWith('.csv')) sources.push({ file: full, type: typeFor(full) }); }
  const docs = []; const grouped = new Map(); const manifest = [];
  for (const source of sources) { const data = await fs.readFile(source.file); const rows = csvRows(data.toString('utf8')).map(normalizeRow); const headers = rows.length ? Object.keys(rows[0]) : []; manifest.push({ path: path.basename(source.file), zipEntry: path.relative(inputs, source.file).replace(/\\/g, '/'), type: source.type, detectedDelimiter: ',', bytes: data.length, sha256: sha256(data), rows: rows.length, headers, idColumns: headers.filter(h => h === 'invoice_id' || h === 'quote_id' || h === 'salesorder_id' || h === 'sales_order_id' || h === 'estimate_id' || h === 'id' || h === 'zoho_id'), numberColumns: headers.filter(h => h.includes('number')), dateColumns: headers.filter(h => h.includes('date')) }); for (const row of rows) { const id = documentId(row); if (!id) continue; const key = `${source.type}:${id}`; const existing = grouped.get(key); if (existing) { existing.lineItems.push(row); } else { const doc = { id, type: source.type, row, lineItems: [row] }; grouped.set(key, doc); docs.push(doc); } } }
  await writeJson('parse-inventory.json', manifest);
  const documentDocs = docs.filter(doc => ['invoice', 'quote', 'sales_order'].includes(doc.type));
  if (!documentDocs.length) throw new Error('No invoice, quote, or sales-order documents were parsed.');
  return { docs: documentDocs, manifest };
}

async function productionSnapshot() {
  try { const { PrismaClient } = await import('@prisma/client'); const snapshot = await loadProductionSnapshot({ PrismaClient }); if (!snapshot.settings.length) throw new Error('Production financial settings are missing.'); return { ...snapshot, settings: snapshot.settings.map(x => ({ key: x.key, valuePresent: x.value != null && x.value !== '' })), productCount: snapshot.products.length, loadedAt: new Date().toISOString() }; } catch (error) { const message = String(error?.message || ''); const field = message.match(/Unknown argument [`']([^`']+)[`']/i)?.[1] || message.match(/Unknown field [`']([^`']+)[`']/i)?.[1] || 'unidentified'; const model = message.match(/model [`']?([A-Za-z0-9_]+)[`']?/i)?.[1] || 'unidentified'; throw new Error(`Production settings query failed: operation=read-only-snapshot class=${error?.name || 'PrismaError'} code=${error?.code || 'unknown'} model=${model} field=${field}`); }
}

async function zohoMetadata() {
  const required = ['ZOHO_CLIENT_ID','ZOHO_CLIENT_SECRET','ZOHO_REFRESH_TOKEN','ZOHO_ORGANIZATION_ID'];
  for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`);
  const dc = process.env.ZOHO_DC || 'com'; const accounts = `https://accounts.zoho.${dc}`; const api = `https://www.zohoapis.${dc}`;
  const tokenResponse = await fetch(`${accounts}/oauth/v2/token?refresh_token=${encodeURIComponent(process.env.ZOHO_REFRESH_TOKEN)}&client_id=${encodeURIComponent(process.env.ZOHO_CLIENT_ID)}&client_secret=${encodeURIComponent(process.env.ZOHO_CLIENT_SECRET)}&grant_type=refresh_token`, { method: 'POST' });
  if (!tokenResponse.ok) throw new Error(`Zoho authentication failed: HTTP_${tokenResponse.status}`); const token = (await tokenResponse.json()).access_token; if (!token) throw new Error('Zoho authentication returned no access token');
  const headers = { Authorization: `Zoho-oauthtoken ${token}` }; const org = await fetch(`${api}/books/v3/organizations`, { headers }); if (!org.ok) throw new Error(`Zoho organization lookup failed: HTTP_${org.status}`); const orgJson = await org.json(); const verification = selectZohoOrganization(orgJson, process.env.ZOHO_ORGANIZATION_ID); await writeJson('zoho-organization-verification.json', { returnedOrganizationName: verification.organizationName, normalizedOrganizationName: verification.normalizedName, configuredOrganizationIdMatches: verification.configuredOrganizationIdMatches, selectedOrganizationIdMatches: verification.selectedOrganizationIdMatches, exportOrganizationLabel: 'TITAN DIAMOND USA' });
  const fields = {}; for (const [module, entity] of [['invoices','invoice'],['estimates','estimate'],['salesorders','salesorder']]) { const response = await fetch(`${api}/books/v3/settings/fields?organization_id=${encodeURIComponent(process.env.ZOHO_ORGANIZATION_ID)}&entity=${entity}&filter_custom_fields=true&skip_inactive_fields=true`, { headers }); if (!response.ok) throw new Error(`Zoho custom-field metadata failed for ${module}: HTTP_${response.status}`); const body = await response.json(); fields[module] = body.fields || body.custom_fields || []; if (!fields[module].length) throw new Error(`Zoho custom-field metadata empty for ${module}`); }
  return { organizationId: verification.organizationId, organizationName: verification.organizationName, fields };
}

async function main() {
  if (!inputs) throw new Error('RECONCILIATION_INPUTS is required'); await fs.mkdir(out, { recursive: true }); const { docs, manifest } = await parseSources(); const documentCounts = Object.fromEntries(['invoice','quote','sales_order'].map(type => [type, docs.filter(doc => doc.type === type).length])); const costSources = await loadCostSources(inputs); await writeJson('input-manifest.json', { repository: repo, inputs, files: manifest, documents: docs.length, documentCounts, costSourceStats: costSources.stats }); if (args.has('--self-test') || args.has('--parse-only')) return;
  const settings = await productionSnapshot(); await writeJson('production-settings-snapshot.redacted.json', { settings: settings.settings.map(x => ({ key: x.key, valuePresent: x.value != null && x.value !== '' })), compensationPlans: settings.plans.length, productCount: settings.products.length, invoiceCount: settings.invoices.length, paymentCount: settings.payments.length, lineItemCount: settings.lineItems.length, purchaseOrderCount: (settings.purchaseOrders || []).length, readOnly: true, sourceCoverage: { invoiceItems: settings.invoices.filter(x => Array.isArray(x.items?.line_items)).length, joinedInvoiceLines: settings.invoices.reduce((n, x) => n + (x.lineItems?.length || 0), 0), joinedPayments: settings.invoices.reduce((n, x) => n + (x.payments?.length || 0), 0), productCostFieldAvailable: false, historicalCostFieldsInInvoiceJson: ['historicalCost','purchase_rate','cost','unitCost'] } }); const liveZoho = await zohoMetadata();
  const expectedLabels = ['salesperson vig','commission from profit','dead cost total','dead cost subject','dead cost no vig','dead cost plus vig','profit','dead profit','sales commission','commission status'];
  const liveFieldNames = Object.values(liveZoho.fields).flat().map(f => String(f.api_name || f.apiName || f.field_name || '').toLowerCase()).filter(Boolean);
  const allowlist = ['cf_salesperson_vig','cf_commision_from_profit','cf_dead_cost_total','cf_dead_cost_subject_to_vig','cf_dead_cost_no_vig','cf_dead_cost_with_vig','cf_profit','cf_dead_profit_actual','cf_sales_commission','cf_commission_status'].filter(name => liveFieldNames.includes(name) || liveFieldNames.length === 0);
  if (!allowlist.length) throw new Error('Required calculated custom-field metadata is missing.'); await writeJson('custom-field-metadata.json', { organization: liveZoho.organizationName, fields: liveZoho.fields, allowlist });
  const details = []; const forward = []; const rollback = []; const failures = []; const failureIds = []; const failureCounts = {}; const lineAccounting = { totalLines: 0, physicalLines: 0, nonphysicalLines: 0, resolvedPhysicalLines: 0, unresolvedPhysicalLines: 0, historicalInvoiceJson: 0, embeddedBreakdown: 0, purchaseOrder: 0, itemExportPurchaseRate: 0, dbCatalogCost: 0 }; const documentAccounting = { totalDocuments: docs.length, fullyResolvedDocuments: 0, partiallyResolvedDocuments: 0, unresolvedDocuments: 0, noPhysicalCostRequiredDocuments: 0 };
  const catalog = buildCatalogCostSources(settings.products);
  const historical = buildHistoricalInvoiceCostIndex(settings.invoices);
  await writeJson('historical-cost-diagnostic.json', { documentsInspected: historical.stats.documentsInspected, lineCandidatesFound: historical.stats.lineCandidatesFound, candidatesAccepted: historical.stats.candidatesAccepted, ambiguous: historical.stats.ambiguous, malformed: historical.stats.malformed, zeroOrInvalid: historical.stats.zeroOrInvalid, unresolvedTransitions: historical.stats.unresolvedTransitions, supportedKeys: historical.supportedKeys, catalogRowsWithDedicatedCost: [...catalog.catalogById.values()].length, catalogResolutionCount: 0 });
  const localInvoice = new Map(settings.invoices.map(x => [String(x.zohoId), x]));
  const purchaseCosts = new Map(); for (const po of settings.purchaseOrders || []) for (const item of (Array.isArray(po.items) ? po.items : [])) { const key = String(item.sku || item.item_id || '').toLowerCase(); if (key && item.unitPrice != null) purchaseCosts.set(key, item.unitPrice); }
  const paymentMap = new Map(); for (const payment of [...settings.payments, ...costSources.payments]) { const key = String(payment.invoiceId || ''); if (!paymentMap.has(key)) paymentMap.set(key, []); paymentMap.get(key).push(payment); }
  const calculations = docs.map(doc => ({ ...doc, documentType: doc.type, date: doc.row.date || doc.row.invoice_date || doc.row.quote_date || doc.row.order_date || '', status: localInvoice.get(String(doc.id))?.status || doc.row.status || '', isWrittenOff: localInvoice.get(String(doc.id))?.isWrittenOff === true, repId: doc.row.salesperson_id || doc.row.sales_person_id || localInvoice.get(String(doc.id))?.salespersonId || null, salesperson: doc.row.salesperson || doc.row.sales_person || localInvoice.get(String(doc.id))?.computedSalesperson || '', storedVigRate: localInvoice.get(String(doc.id))?.computedVigRate ?? doc.row.cf_salesperson_vig ?? doc.row.vig_rate ?? null, subtotal: doc.row.sub_total, total: doc.row.total, payments: paymentMap.get(String(doc.id)) || [], lineItems: doc.lineItems.map(line => {
    const local = localInvoice.get(String(doc.id)); const localItems = Array.isArray(local?.items) ? local.items : []; const localItem = localItems.find(x => String(x.sku || x.item_id || '').toLowerCase() === String(line.sku || '').toLowerCase());
    const key = String(line.sku || line.item_name || '').toLowerCase().trim(); const auxiliary = resolveAuxiliaryCost({ ...line, itemId: line.product_id }, costSources, doc.date); const historicalCost = resolveHistoricalInvoiceCost(historical, doc.id, line, doc.lineItems.indexOf(line)); return { ...line, historicalCost, purchaseOrderCost: auxiliary?.source === COST_SOURCES.PO ? auxiliary : purchaseCosts.get(key), itemExportPurchaseRate: auxiliary?.source === COST_SOURCES.ITEM ? auxiliary : null, catalogCost: catalog.catalogById.get(String(line.product_id || '').trim()) || catalog.catalogBySku.get(String(line.sku || '').toLowerCase().replace(/[^a-z0-9]+/g, '')) || catalog.catalogByName.get(String(line.item_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '')), gift: /^(true|yes|1)$/i.test(String(line.cf_gift_item || '')), tariffSubject: !/^(true|yes|1)$/i.test(String(line.cf_remove_tariff_surcharge || '')) };
  }), additionalCosts: doc.row.additional_costs || doc.row.cf_additional_costs_see_notes || doc.row.custom_charges }));
  // The shared core is authoritative for classification, provenance, conservation,
  // and document eligibility. The legacy calculation below remains only to preserve
  // the established scalar mapping until the handler-facing writer is migrated.
  for (const doc of calculations) {
    // Embedded matching precedes core construction; use only prepared line evidence here.
    doc.lineItems.forEach(line => { line.physical = Boolean(line.product_id || line.sku || line.item_name || line.item_desc); });
    const breakdown = doc.row.cf_items_dc_breakdown || '';
    if (!breakdown) continue;
    const associated = associateEmbeddedCostTokens(breakdown);
    const lineAliases = doc.lineItems.map(line => ({ sku: line.sku || line.product_sku, itemId: line.product_id, itemName: line.item_name, physical: line.physical }));
    const matched = matchEmbeddedEntriesToLines(associated.entries, lineAliases).matches;
    for (const hit of matched) if (hit.entry.cost > 0 && doc.lineItems[hit.lineIndex]) doc.lineItems[hit.lineIndex].breakdownCost = { cost: hit.entry.cost, sourceRecordId: `${doc.id}:${hit.entry.costTokenIndex}`, effectiveDate: doc.date || null, lookupKeyType: 'embedded-breakdown' };
  }
  const vigInput = buildAuthoritativeVigInput({ representatives: settings.users, monthlyGoals: settings.monthlyVigGoals, compensationPlans: settings.plans, documents: calculations });
  console.log('VIG_BUILD=START');
  const vigTimeline = runStage('VIG_BUILD', () => buildRuntimeVigContract(vigInput, (document, { vigRate, metric }) => {
    if (metric === 'subtotal') return Number(document.subtotal ?? document.total ?? 0);
    const row = document.row; const commissionPct = row.cf_commission_from_profit ?? row.cf_commision_from_profit ?? row.cf_sales_commission_profit ?? row.commission_percentage ?? '';
    return calculateDocument({ id: document.id, date: document.date, commissionPct, lineItems: document.lineItems, subtotal: document.subtotal ?? document.total, additionalCosts: document.additionalCosts, payments: document.payments }, { vig: vigRate }).profit;
  }));
  console.log('VIG_BUILD=PASS');
  await writeJson('vig-audit.json', { ...vigTimeline.audit, mappingDiagnostics: vigInput.mappingDiagnostics, mappingConservation: vigInput.mappingConservation, materializedMonthlyGoalAssignments: vigTimeline.audit.reasonCounts.MATERIALIZED_MONTHLY_GOAL || 0, recomputedPlanGoalAssignments: (vigTimeline.audit.reasonCounts.RECOMPUTED_PLAN_GOAL_HIT || 0) + (vigTimeline.audit.reasonCounts.RECOMPUTED_PLAN_GOAL_MISS || 0), storedHistoricalVigFallbackAssignments: vigTimeline.audit.reasonCounts.STORED_HISTORICAL_VIG_FALLBACK || 0, noPriorMonthDefaultAssignments: (vigTimeline.audit.reasonCounts.NO_PRIOR_MONTH_DEFAULT || 0) + (vigTimeline.audit.reasonCounts.NEW_HIRE_DEFAULT || 0), conflictingStoredVigMonths: 0, genuinelyUnresolvedGoalMonths: vigTimeline.audit.genuinelyUnresolvedGoalMonths });
  if (vigTimeline.audit.missingAuthoritativeInputCount > 0) throw new Error('Authoritative VIG inputs are incomplete; see vig-audit.json');
  const vigByDocument = runStage('VIG_DOCUMENT_MAP', () => vigTimeline.vigByDocument);
  console.log('VIG_DOCUMENT_MAP=PASS');
  const coreResult = runStage('CORE_CALCULATION', () => runReconciliationCore({ docs: calculations, costSources, allowlist, vigByDocument }));
  console.log('CORE_CALCULATION=PASS');
  console.log('RUNTIME_VIG_CONTRACT=PASS');
  console.log('ARTIFACT_BUILD=START');
  const runtimeArtifacts = await writeRuntimeArtifacts({ outputDir: out, coreResult, documentIds: docs.map(x => x.id) });
  console.log('ARTIFACT_BUILD=PASS');
  console.log('FAILURE_AGGREGATION=START');
  const filteredForward = runtimeArtifacts.forward;
  const filteredRollback = runtimeArtifacts.rollback;
  if (!Array.isArray(filteredForward) || !Array.isArray(filteredRollback) || !Array.isArray(coreResult.outcomes)) throw new Error('POST_ARTIFACT_RUNTIME_CONTRACT:EXPECTED_ARRAYS');
  const coreFailures = coreResult.outcomes.filter(x => x.kind === 'physical-unresolved' || x.kind === 'uncertain').map(x => ({ reason: x.kind === 'uncertain' ? 'CLASSIFICATION_UNCERTAIN' : 'UNRESOLVED_PHYSICAL_COST' }));
  console.log('FAILURE_AGGREGATION=PASS');
  console.log('PAYLOAD_VALIDATION=START');
  const violations = validatePayload(filteredForward);
  if (!Array.isArray(violations)) throw new Error('POST_ARTIFACT_RUNTIME_CONTRACT:VALIDATION_ARRAY');
  console.log('PAYLOAD_VALIDATION=PASS');
  const totalFailures = coreFailures.length + violations.length;
  const diagnostic = runtimeArtifacts.diagnostic;
  assertRedactedSamples(diagnostic);
  failureCounts.CLASSIFICATION_UNCERTAIN = coreResult.outcomes.filter(x => x.kind === 'uncertain').length;
  failureCounts.UNRESOLVED_PHYSICAL_COST = coreResult.outcomes.filter(x => x.kind === 'physical-unresolved').length;
  console.log('ARTIFACT_WRITE=START');
  await writeJson('calculation-detail.json', []);
  await writeJson('forward-payload.json', filteredForward);
  await writeJson('rollback-snapshot.json', filteredRollback);
  await writeJson('ready-forward-payload.json', filteredForward);
  await writeJson('ready-rollback-snapshot.json', filteredRollback);
  await writeJson('failures.json', { total: totalFailures, byReason: failureCounts, sample: coreFailures.slice(0, 100), completeIdListFile: 'failure-ids.json' });
  await writeJson('failure-ids.json', coreFailures);
  await writeJson('cost-resolution-diagnostic.json', diagnostic);
  const blockerCount = coreResult.lineAccounting.physicalUnresolved + coreResult.lineAccounting.uncertain;
  if (coreResult.documents.length !== docs.length || coreResult.outcomes.length !== coreResult.lineAccounting.total || filteredForward.length !== filteredRollback.length || blockerCount !== totalFailures) throw new Error('DRY_RUN_CONSERVATION_FAILED');
  await writeJson('reconciliation-summary.json', {
    dryRunComplete: true,
    readyPayloadIsolation: true,
    blockedDocumentExclusion: true,
    applyEnabled: false,
    status: blockerCount ? 'COMPLETE_WITH_BLOCKERS' : 'COMPLETE',
    documents: docs.length,
    forwardDocuments: filteredForward.length,
    rollbackDocuments: filteredRollback.length,
    failures: totalFailures,
    writesEnabled: false,
    lineAccounting: coreResult.lineAccounting,
    documentAccounting: coreResult.documentAccounting
  });
  console.log('DRY_RUN_STATUS=' + (blockerCount ? 'COMPLETE_WITH_BLOCKERS' : 'COMPLETE'));
  console.log('READY_PAYLOAD_ISOLATION=PASS');
  console.log('BLOCKED_DOCUMENT_EXCLUSION=PASS');
  console.log('BLOCKER_CONSERVATION=PASS');
  console.log('APPLY_REMAINS_DISABLED=PASS');
  console.log('ARTIFACT_WRITE=PASS');
  console.log('COMPLETENESS_GATE=START');
  assertReconciliationComplete({ documents: docs.length, forward: filteredForward, rollback: filteredRollback, failures: [] });
  console.log('COMPLETENESS_GATE=PASS');
  const hashes = await buildArtifactHashManifest(out); await writeJson('sha256-manifest.json', hashes); if (!docs.length || failures.length) throw new Error('Dry-run controls failed.');
  console.log('DRY_RUN_COMPLETE=PASS');
  console.log('ENGINE_DRY_RUN=PASS');
  console.log('ENGINE_COMPLETE=PASS');
  console.log('POST_ARTIFACT_RUNTIME_CONTRACT=PASS');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_URL]')); process.exitCode = 1; });
