import crypto from 'node:crypto';

const VALID_INVOICE_STATUSES = new Set(['draft', 'sent', 'overdue', 'partially paid', 'partially_paid', 'paid']);
const INVALID_INVOICE_STATUSES = new Set(['void', 'voided', 'deleted', 'writeoff', 'write_off', 'write off', 'bad debt', 'bad_debt']);
const ASSIGNMENT_REASONS = Object.freeze(['CONSTANT_OVERRIDE', 'MANUAL_OVERRIDE', 'PRE_2025_BASELINE', 'JANUARY_BASELINE', 'NEW_HIRE_DEFAULT', 'MATERIALIZED_MONTHLY_GOAL', 'RECOMPUTED_PLAN_GOAL_HIT', 'RECOMPUTED_PLAN_GOAL_MISS', 'STORED_HISTORICAL_VIG_FALLBACK', 'NO_PRIOR_MONTH_DEFAULT', 'UNRESOLVED']);
const normalized = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const monthKey = value => { const m = String(value ?? '').match(/^(\d{4})-(\d{2})/); return m ? `${m[1]}-${m[2]}` : null; };
const priorMonth = key => { const [y, m] = key.split('-').map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const boundedRate = value => Math.min(1.5, Math.max(1, Number(value)));
const historicalKey = value => `historical:${crypto.createHash('sha256').update(normalized(value)).digest('hex').slice(0, 24)}`;

export function isGoalEligibleInvoice(document) {
  if (normalized(document.documentType || document.type) !== 'invoice') return false;
  if (document.isWrittenOff === true || document.deleted === true) return false;
  const status = normalized(document.status);
  return !INVALID_INVOICE_STATUSES.has(status) && VALID_INVOICE_STATUSES.has(status);
}

export function buildAuthoritativeVigInput({ representatives = [], monthlyGoals = [], compensationPlans = [], documents = [] } = {}) {
  const historicalNames = [...new Set(documents.filter(d => isGoalEligibleInvoice(d) && normalized(d.salesperson) && !d.repId).map(d => normalized(d.salesperson)))];
  const knownNames = new Set(representatives.map(rep => normalized(rep.name)).filter(Boolean));
  const historical = historicalNames.filter(name => !knownNames.has(name)).map(name => ({ id: historicalKey(name), name, zohoId: null, constantVigEnabled: false, constantVigValue: null, historical: true }));
  const reps = [...representatives, ...historical]; const byId = new Map(); const byName = new Map();
  for (const rep of reps) { byId.set(String(rep.id), rep); if (rep.zohoId) byId.set(String(rep.zohoId), rep); }
  const aliases = new Map([['monty morgan', 'montgomery morgan'], ['ricky griffin', 'richard griffin'], ['ben bequette', 'benjamin bequette']]);
  for (const rep of reps) for (const value of [rep.name, ...(rep.aliases || [])]) { const key = normalized(value); if (!key) continue; const existing = byName.get(key); byName.set(key, existing && existing.id !== rep.id ? null : rep); }
  const mappingDiagnostics = { blankSalesperson: 0, exactIdentityUnmatched: 0, ambiguousIdentity: 0, otherSchemaMismatch: 0 }; const seen = new Set(); let duplicateEligibleInvoiceCount = 0;
  const mapped = documents.map((document, index) => {
    const eligible = isGoalEligibleInvoice(document); const key = `${document.type || 'invoice'}:${String(document.id || index)}`;
    if (eligible && seen.has(key)) duplicateEligibleInvoiceCount++; if (eligible) seen.add(key);
    const rawId = String(document.repId || '').trim(); const rawName = normalized(document.salesperson); let rep = rawId ? byId.get(rawId) : null; let mappingReason = null;
    if (rawId && !rep) mappingReason = 'exactIdentityUnmatched';
    if (!rep && rawName) { const direct = byName.get(rawName); const aliasTarget = aliases.get(rawName); const alias = aliasTarget ? byName.get(aliasTarget) : undefined; rep = direct || alias || null; mappingReason = rep ? null : (direct === null || alias === null ? 'ambiguousIdentity' : 'exactIdentityUnmatched'); }
    if (!rep && !rawName && !rawId) mappingReason = 'blankSalesperson'; if (!rep && !mappingReason) mappingReason = 'otherSchemaMismatch';
    if (eligible && mappingReason) mappingDiagnostics[mappingReason]++;
    return Object.freeze({ ...document, repId: rep ? String(rep.id) : null, mappingReason });
  });
  const eligible = mapped.filter(isGoalEligibleInvoice); const mappedCount = eligible.filter(d => d.repId).length; const unmappedCount = eligible.length - mappedCount; const categoryTotal = Object.values(mappingDiagnostics).reduce((a, b) => a + b, 0);
  const mappingConservation = Object.freeze({ eligible: eligible.length, mapped: mappedCount, unmapped: unmappedCount, diagnosticCategoryTotal: categoryTotal, duplicateEligibleInvoiceCount, eligibleConservationDelta: eligible.length - mappedCount - unmappedCount, diagnosticConservationDelta: unmappedCount - categoryTotal });
  return Object.freeze({ representatives: Object.freeze(reps.map(r => Object.freeze({ ...r }))), monthlyGoals: Object.freeze(monthlyGoals.map(g => Object.freeze({ ...g }))), compensationPlans: Object.freeze(compensationPlans.map(p => Object.freeze({ ...p }))), documents: Object.freeze(mapped), eligibleInvoiceCount: eligible.length, mappedEligibleInvoiceCount: mappedCount, blankEligibleInvoiceCount: mappingDiagnostics.blankSalesperson, unmappedEligibleInvoiceCount: unmappedCount, mappingDiagnostics: Object.freeze(mappingDiagnostics), mappingConservation });
}

function validStoredRate(documents) { const values = documents.map(d => Number(d.storedVigRate)).filter(v => [1, 1.3, 1.5].includes(v)); const invalid = documents.some(d => d.storedVigRate != null && ![1, 1.3, 1.5].includes(Number(d.storedVigRate))); return !invalid && values.length > 0 && new Set(values).size === 1 ? values[0] : null; }

export function buildVigTimeline({ representatives = [], monthlyGoals = [], compensationPlans = [], documents = [], unmappedEligibleInvoiceCount = 0, evaluateDocument } = {}) {
  if (typeof evaluateDocument !== 'function') throw new Error('Authoritative VIG input requires evaluateDocument');
  const eligible = documents.filter(isGoalEligibleInvoice); const goals = new Map(monthlyGoals.map(g => [`${g.repId}:${g.monthKey}`, g])); const assignments = []; const missingPrior = []; const blocking = { missingMonthlyGoalCount: 0, missingCompensationPlanCount: 0, unsupportedDailyPlanCount: 0, invalidGoalMetricCount: 0, invalidGoalTargetCount: 0 };
  for (const rep of representatives) {
    const repId = String(rep.id); const repDocs = eligible.filter(d => String(d.repId || '') === repId); if (!repDocs.length) continue; const months = [...new Set(repDocs.map(d => monthKey(d.date)).filter(Boolean))].sort(); const firstMonth = months[0]; const priorResults = new Map();
    for (const month of months) {
      const monthDocs = repDocs.filter(d => monthKey(d.date) === month); const monthlyGoal = goals.get(`${repId}:${month}`) || null; const plans = compensationPlans.filter(p => String(p.repId) === repId && normalized(p.status) === 'active' && p.commitmentEnabled === true && String(p.startDate || '').slice(0, 7) <= month && (!p.endDate || String(p.endDate).slice(0, 7) >= month)).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate))); const plan = plans[0] || null;
      const metric = normalized(monthlyGoal?.metric || plan?.commitmentMetric || 'profit').replace('net profit', 'profit').replace('dead profit', 'profit'); const target = Number(metric === 'subtotal' ? (monthlyGoal?.subtotalGoal ?? plan?.commitmentTarget) : (monthlyGoal?.profitGoal ?? plan?.commitmentTarget)); const targetValid = Number.isFinite(target) && target >= 0; const prior = priorResults.get(priorMonth(month)); let rate = null; let assignmentReason = 'UNRESOLVED'; let authoritativeInputSource = null; let blockingReason = null;
      const constantValid = rep.constantVigEnabled === true && Number.isFinite(Number(rep.constantVigValue)) && Number(rep.constantVigValue) > 0;
      const stored = validStoredRate(monthDocs);
      if (constantValid) { rate = boundedRate(rep.constantVigValue); assignmentReason = 'CONSTANT_OVERRIDE'; authoritativeInputSource = 'constantVig'; }
      else if (monthlyGoal?.manualVigRate != null && Number.isFinite(Number(monthlyGoal.manualVigRate))) { rate = boundedRate(monthlyGoal.manualVigRate); assignmentReason = 'MANUAL_OVERRIDE'; authoritativeInputSource = 'monthlyOverride'; }
      else if (month < '2025-01') { rate = 1.3; assignmentReason = 'PRE_2025_BASELINE'; authoritativeInputSource = 'baseline'; }
      else if (month === '2025-01') { rate = 1.3; assignmentReason = 'JANUARY_BASELINE'; authoritativeInputSource = 'baseline'; }
      else if (stored != null) { rate = stored; assignmentReason = 'STORED_HISTORICAL_VIG_FALLBACK'; authoritativeInputSource = 'storedInvoiceVig'; }
      else if (!prior) { rate = 1.3; assignmentReason = firstMonth === month ? 'NEW_HIRE_DEFAULT' : 'NO_PRIOR_MONTH_DEFAULT'; authoritativeInputSource = 'default'; }
      else if (prior.metGoal === null) { rate = 1.3; assignmentReason = 'NO_PRIOR_MONTH_DEFAULT'; authoritativeInputSource = 'default'; missingPrior.push(`${repId}:${month}`); }
      else if (targetValid && monthlyGoal) { rate = prior.metGoal ? 1.3 : 1.5; assignmentReason = 'MATERIALIZED_MONTHLY_GOAL'; authoritativeInputSource = 'materializedMonthlyGoal'; }
      else if (targetValid && plan && normalized(plan.commitmentGoalType) === 'monthly') { rate = prior.metGoal ? 1.3 : 1.5; assignmentReason = prior.metGoal ? 'RECOMPUTED_PLAN_GOAL_HIT' : 'RECOMPUTED_PLAN_GOAL_MISS'; authoritativeInputSource = 'compensationPlan'; }
      else { blockingReason = monthlyGoal ? 'INVALID_GOAL_TARGET' : (plan ? 'MISSING_OR_UNSUPPORTED_PLAN_GOAL' : 'MISSING_GOAL_INPUT'); if (monthlyGoal) blocking.invalidGoalTargetCount++; else if (plan && normalized(plan.commitmentGoalType) !== 'monthly') blocking.unsupportedDailyPlanCount++; else if (plan) blocking.missingCompensationPlanCount++; else blocking.missingMonthlyGoalCount++; }
      let actual = 0; for (const doc of monthDocs) { const value = Number(evaluateDocument(doc, Object.freeze({ vigRate: rate ?? 1.3, metric, monthKey: month }))); if (!Number.isFinite(value)) throw new Error('VIG evaluator returned a nonnumeric result'); actual += value; }
      const metGoal = targetValid ? actual >= target : null; assignments.push(Object.freeze({ representativeKey: repId, month, rate, assignmentReason, authoritativeInputSource, blockingReason, metGoal, repId, monthKey: month, vigRate: rate, reason: assignmentReason })); priorResults.set(month, Object.freeze({ metGoal }));
    }
  }
  const frozenAssignments = Object.freeze(assignments); const reasonCounts = Object.fromEntries(ASSIGNMENT_REASONS.map(reason => [reason, frozenAssignments.filter(a => a.assignmentReason === reason).length])); const rates = { vig1_0: frozenAssignments.filter(a => a.rate === 1).length, vig1_3: frozenAssignments.filter(a => a.rate === 1.3).length, vig1_5: frozenAssignments.filter(a => a.rate === 1.5).length }; const monthsEvaluated = frozenAssignments.length; const reasonTotal = Object.values(reasonCounts).reduce((a, b) => a + b, 0); const rateTotal = Object.values(rates).reduce((a, b) => a + b, 0); const unresolved = reasonCounts.UNRESOLVED;
  const audit = Object.freeze({ representativesCounted: new Set(frozenAssignments.map(a => a.representativeKey)).size, monthsEvaluated, assignments: Object.freeze(rates), reasonCounts: Object.freeze(reasonCounts), assignmentReasonTotal: reasonTotal, rateTotal, eligibleInvoiceCount: eligible.length, mappedEligibleInvoiceCount: eligible.filter(d => d.repId).length, unmappedEligibleInvoiceCount, missingPriorMonthResultCount: missingPrior.length, ...blocking, genuinelyUnresolvedGoalMonths: unresolved, missingAuthoritativeInputCount: unresolved, conservation: Object.freeze({ rateDelta: rateTotal - monthsEvaluated, reasonDelta: reasonTotal - monthsEvaluated }) });
  const vigByDocument = new Map();
  for (const document of documents) {
    if (!document.repId) continue;
    const assignment = frozenAssignments.find(item => item.representativeKey === String(document.repId) && item.month === monthKey(document.date));
    if (assignment && Number.isFinite(assignment.rate)) vigByDocument.set(document.id, assignment.rate);
  }
  return Object.freeze({ assignments: frozenAssignments, assignmentRecords: frozenAssignments, vigByDocument, audit });
}

export function vigMapForDocuments(documents, timeline) {
  if (timeline?.vigByDocument instanceof Map) return timeline.vigByDocument;
  const records = timeline?.assignmentRecords || timeline?.assignments || [];
  const rates = new Map(records.map(a => [`${a.representativeKey || a.repId}:${a.month || a.monthKey}`, a.rate ?? a.vigRate]));
  return new Map(documents.filter(doc => doc.repId).map(doc => [doc.id, rates.get(`${doc.repId}:${monthKey(doc.date)}`)]).filter(([, rate]) => Number.isFinite(rate)));
}
