import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const sha = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
const read = async (dir, name) => JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
const fields = value => Array.isArray(value) ? new Map(value.map(x => [x.apiName, x.value])) : new Map(Object.entries(value || {}));
export async function reviewRun(dir) {
  const [summary, forward, rollback, unresolved, uncertain, metadata] = await Promise.all([
    read(dir, 'reconciliation-summary.json'), read(dir, 'ready-forward-payload.json'), read(dir, 'ready-rollback-snapshot.json'),
    read(dir, 'unresolved-cost-report.json'), read(dir, 'uncertain-classification-report.json'), read(dir, 'custom-field-metadata.json')
  ]);
  const reasons = []; const fids = new Set(); const rids = new Set(); let mismatch = 0; let forbidden = 0;
  const key = item => `${item.type || ''}:${item.zohoId || ''}`;
  for (const item of forward) { const id = key(item); if (fids.has(id)) reasons.push({ reason: 'DUPLICATE_FORWARD_ID', idHash: sha(id) }); fids.add(id); if (!Array.isArray(item.customFields)) reasons.push({ reason: 'INVALID_FORWARD_SHAPE' }); for (const field of item.customFields || []) if (!metadata.allowlist.includes(field.apiName)) forbidden++; }
  for (const item of rollback) { const id = key(item); if (rids.has(id)) reasons.push({ reason: 'DUPLICATE_ROLLBACK_ID', idHash: sha(id) }); rids.add(id); }
  const rollbackById = new Map(rollback.map(item => [key(item), item]));
  for (const item of forward) { const prior = rollbackById.get(key(item)); if (!prior) { mismatch++; continue; } const before = fields(prior.customFields); for (const field of item.customFields || []) if (!before.has(field.apiName)) mismatch++; }
  const unresolvedTotal = Number(unresolved.total || 0); const uncertainTotal = Number(uncertain.total || 0); const failures = Number(summary.failures || 0); const blockers = Number(summary.lineAccounting?.physicalUnresolved || 0) + Number(summary.lineAccounting?.uncertain || 0);
  if (summary.status !== 'COMPLETE_WITH_BLOCKERS') reasons.push({ reason: 'INVALID_COMPLETION_STATUS' });
  if (forward.length !== rollback.length || forward.length !== Number(summary.forwardDocuments || 0)) reasons.push({ reason: 'FORWARD_ROLLBACK_COUNT_MISMATCH' });
  if (failures !== blockers || unresolvedTotal !== Number(summary.lineAccounting?.physicalUnresolved || 0) || uncertainTotal !== Number(summary.lineAccounting?.uncertain || 0)) reasons.push({ reason: 'BLOCKER_CONSERVATION_MISMATCH' });
  if (summary.writesEnabled !== false) reasons.push({ reason: 'APPLY_NOT_DISABLED' });
  const result = { pass: reasons.length === 0 && mismatch === 0 && forbidden === 0 && forward.length > 0, status: summary.status, artifactCounts: { documents: summary.documents, readyForward: forward.length, readyRollback: rollback.length, unresolved: unresolvedTotal, uncertain: uncertainTotal, failures }, forwardRollbackMismatchCount: mismatch, forbiddenFieldCount: forbidden, reasons, generatedAt: new Date().toISOString() };
  await fs.writeFile(path.join(dir, 'payload-review.json'), JSON.stringify(result, null, 2));
  const manifest = {}; for (const name of await fs.readdir(dir)) { if (name === 'sha256-manifest.json' || name === 'credentials.env' || name.endsWith('.log') || name.startsWith('_zip')) continue; const stat = await fs.stat(path.join(dir, name)); if (stat.isFile()) manifest[name] = sha(await fs.readFile(path.join(dir, name))); }
  await fs.writeFile(path.join(dir, 'sha256-manifest.json'), JSON.stringify(manifest, null, 2));
  if (!result.pass) throw new Error('Independent payload review failed'); console.log('INDEPENDENT_PAYLOAD_REVIEW=PASS'); return result;
}
if (process.argv[1] && process.argv[1].endsWith('reconciliation-payload-review.mjs')) await reviewRun(process.env.RECONCILIATION_OUTPUT || process.argv[2]);
