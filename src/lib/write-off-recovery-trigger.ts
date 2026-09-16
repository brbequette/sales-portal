import { createHash } from "node:crypto"
import { Prisma, type PrismaClient } from "@prisma/client"

export const WRITE_OFF_SOURCE_FIELD = "cf_written_off"
export const AUTOMATIC_RECOVERY_RATE_BPS = 5000
export const WRITE_OFF_TRIGGER_ZOHO_CALLS = 0

type JsonRecord = Record<string, unknown>

export type WriteOffObservation = {
  present: boolean
  value: boolean | null
  anomalyCode?: "NON_BOOLEAN_VALUE"
}

export type ImportedInvoiceSnapshot = {
  id: string
  zohoId: string
  computedSalesperson?: string | null
  items?: unknown
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null
}

function sourceFieldValue(payload: unknown): { present: boolean; value?: unknown } {
  const root = record(payload)
  if (!root) return { present: false }
  if (Object.prototype.hasOwnProperty.call(root, WRITE_OFF_SOURCE_FIELD)) return { present: true, value: root[WRITE_OFF_SOURCE_FIELD] }
  const hash = record(root.custom_field_hash)
  if (hash && Object.prototype.hasOwnProperty.call(hash, WRITE_OFF_SOURCE_FIELD)) return { present: true, value: hash[WRITE_OFF_SOURCE_FIELD] }
  const fields = Array.isArray(root.custom_fields) ? root.custom_fields : []
  const field = fields.map(record).find(item => item?.api_name === WRITE_OFF_SOURCE_FIELD)
  return field ? { present: true, value: field.value } : { present: false }
}

export function parseWrittenOffObservation(payload: unknown): WriteOffObservation {
  const found = sourceFieldValue(payload)
  if (!found.present) return { present: false, value: null }
  if (typeof found.value !== "boolean") return { present: true, value: null, anomalyCode: "NON_BOOLEAN_VALUE" }
  return { present: true, value: found.value }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function writeOffSalespersonSnapshot(payload: unknown, invoice: ImportedInvoiceSnapshot): string | null {
  const root = record(payload)
  return stringValue(root?.salesperson_name) || stringValue(root?.salesperson) || stringValue(invoice.computedSalesperson)
}

function hasCommissionEvidence(payload: unknown): boolean {
  const root = record(payload) || {}
  const hash = record(root.custom_field_hash) || {}
  const names = new Set(["salesCommission", "commission", "cf_commission_amount", "cf_commision_amount", "cf_commission_amount_unformatted"])
  const customFieldValues = (Array.isArray(root.custom_fields) ? root.custom_fields : [])
    .map(record)
    .filter(item => item && names.has(String(item.api_name || "")))
    .map(item => item?.value)
  const candidates = [root.salesCommission, root.commission, root.cf_commission_amount, root.cf_commision_amount, root.cf_commission_amount_unformatted,
    hash.cf_commission_amount, hash.cf_commision_amount, hash.cf_commission_amount_unformatted, ...customFieldValues]
  return candidates.some(value => value !== undefined && value !== null && value !== "")
}

function sourceTimestamp(payload: unknown): Date | null {
  const root = record(payload)
  const raw = stringValue(root?.last_modified_time)
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function transitionKey(zohoInvoiceId: string, previousValue: boolean | null, newValue: boolean, observedSourceTimestamp: Date | null): string {
  return fingerprint({ sourceField: WRITE_OFF_SOURCE_FIELD, zohoInvoiceId, previousValue, newValue, sourceTimestamp: observedSourceTimestamp?.toISOString() || null })
}

function anomalyKey(zohoInvoiceId: string, observedSourceTimestamp: Date | null): string {
  return fingerprint({ sourceField: WRITE_OFF_SOURCE_FIELD, zohoInvoiceId, anomalyCode: "NON_BOOLEAN_VALUE", sourceTimestamp: observedSourceTimestamp?.toISOString() || null })
}

export function writeOffTriggerDryRun(rows: Array<{ invoice_id?: unknown; payload: unknown }>) {
  const qualifying: string[] = []
  let malformed = 0
  for (const row of rows) {
    const observation = parseWrittenOffObservation(row.payload)
    if (observation.anomalyCode) malformed += 1
    if (observation.present && observation.value === true) qualifying.push(fingerprint(String(row.invoice_id || "")).slice(0, 12))
  }
  return { qualifyingCount: qualifying.length, malformedCount: malformed, sanitizedInvoiceIds: qualifying.sort() }
}

export async function observeImportedInvoiceWriteOff(
  tx: Prisma.TransactionClient,
  input: {
    invoice: ImportedInvoiceSnapshot
    incomingPayload: JsonRecord
    previousPayload: unknown
    responsibleRepId?: string | null
    actorId: string
    ingestedAt?: Date
  },
) {
  const next = parseWrittenOffObservation(input.incomingPayload)
  if (!next.present) return { action: "NO_FIELD" as const, zohoCalls: WRITE_OFF_TRIGGER_ZOHO_CALLS }
  if (next.anomalyCode) {
    const detectedAt = input.ingestedAt || new Date()
    const observedSourceTimestamp = sourceTimestamp(input.incomingPayload)
    const sanitizedEvidence = {
      localInvoiceId: input.invoice.id,
      zohoInvoiceId: input.invoice.zohoId,
      sourceField: WRITE_OFF_SOURCE_FIELD,
      sourceTimestamp: observedSourceTimestamp?.toISOString() || null,
      anomalyCode: next.anomalyCode,
    }
    try {
      await tx.writeOffRecoveryTriggerRecord.create({ data: {
        caseId: null,
        localInvoiceId: input.invoice.id,
        zohoInvoiceId: input.invoice.zohoId,
        sourceField: WRITE_OFF_SOURCE_FIELD,
        previousValue: null,
        newValue: null,
        observationKind: "PARSE_ANOMALY",
        anomalyCode: next.anomalyCode,
        sourceTimestamp: observedSourceTimestamp,
        ingestedAt: detectedAt,
        idempotencyKey: anomalyKey(input.invoice.zohoId, observedSourceTimestamp),
        payloadFingerprint: fingerprint(sanitizedEvidence),
        missingRequirements: ["VALID_WRITE_OFF_BOOLEAN"],
      } })
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error
    }
    return { action: "PARSE_ANOMALY" as const, zohoCalls: WRITE_OFF_TRIGGER_ZOHO_CALLS }
  }
  const previous = parseWrittenOffObservation(input.previousPayload)
  const previousValue = previous.present && !previous.anomalyCode ? previous.value : null
  if (next.value === false && previousValue !== true) {
    const detectedAt = input.ingestedAt || new Date()
    const observedSourceTimestamp = sourceTimestamp(input.incomingPayload)
    const sanitizedEvidence = { previousValue, newValue: false, localInvoiceId: input.invoice.id, zohoInvoiceId: input.invoice.zohoId, sourceField: WRITE_OFF_SOURCE_FIELD, sourceTimestamp: observedSourceTimestamp?.toISOString() || null, missingRequirements: [] }
    try {
      await tx.writeOffRecoveryTriggerRecord.create({ data: { caseId: null, localInvoiceId: input.invoice.id, zohoInvoiceId: input.invoice.zohoId, sourceField: WRITE_OFF_SOURCE_FIELD, previousValue, newValue: false, observationKind: "BOOLEAN", anomalyCode: null, sourceTimestamp: observedSourceTimestamp, ingestedAt: detectedAt, idempotencyKey: transitionKey(input.invoice.zohoId, previousValue, false, observedSourceTimestamp), payloadFingerprint: fingerprint(sanitizedEvidence), missingRequirements: [] } })
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error
    }
    return { action: "NO_CASE" as const, zohoCalls: WRITE_OFF_TRIGGER_ZOHO_CALLS }
  }
  if (next.value === previousValue) {
    if (next.value !== true) return { action: "UNCHANGED" as const, zohoCalls: WRITE_OFF_TRIGGER_ZOHO_CALLS }
    const existingCase = await tx.writeOffRecoveryCase.findUnique({ where: { invoiceId: input.invoice.id }, select: { id: true } })
    if (existingCase) return { action: "UNCHANGED" as const, caseId: existingCase.id, zohoCalls: WRITE_OFF_TRIGGER_ZOHO_CALLS }
    // The local invoice may predate this trigger. A first observed true still
    // creates the missing blocked case without requiring a recorded false.
  }

  const repSnapshot = writeOffSalespersonSnapshot(input.incomingPayload, input.invoice)
  const missingRequirements = [
    "HISTORICAL_PRODUCT_COST",
    ...(!input.responsibleRepId ? ["SALESPERSON_SNAPSHOT"] : []),
    ...(!hasCommissionEvidence(input.incomingPayload) ? ["COMMISSION_EVIDENCE"] : []),
  ]
  const detectedAt = input.ingestedAt || new Date()
  const observedSourceTimestamp = sourceTimestamp(input.incomingPayload)
  const recoveryCase = await tx.writeOffRecoveryCase.upsert({
    where: { triggerSourceField_triggerZohoInvoiceId: { triggerSourceField: WRITE_OFF_SOURCE_FIELD, triggerZohoInvoiceId: input.invoice.zohoId } },
    update: next.value === false ? { managerReviewRequired: true, evidenceStatus: "REVIEW_REQUIRED", zohoSyncStatus: "REVIEW_REQUIRED" } : {},
    create: {
      invoiceId: input.invoice.id,
      responsibleRepId: input.responsibleRepId || null,
      triggerSourceField: WRITE_OFF_SOURCE_FIELD,
      triggerZohoInvoiceId: input.invoice.zohoId,
      evidenceStatus: "PENDING_EVIDENCE",
      missingRequirements,
      managerReviewRequired: next.value === false,
      salespersonSnapshot: repSnapshot,
      triggerDetectedAt: detectedAt,
      status: "DRAFT",
      originalResponsibilityRateBps: AUTOMATIC_RECOVERY_RATE_BPS,
      responsibilityRateBps: AUTOMATIC_RECOVERY_RATE_BPS,
      reason: "Automatically detected Zoho Books write-off; blocked pending authoritative evidence and manager review",
      createdById: input.actorId,
      zohoSyncStatus: next.value === false ? "REVIEW_REQUIRED" : "DISABLED",
    },
  })

  const sanitizedEvidence = {
    previousValue,
    newValue: next.value,
    localInvoiceId: input.invoice.id,
    zohoInvoiceId: input.invoice.zohoId,
    sourceField: WRITE_OFF_SOURCE_FIELD,
    sourceTimestamp: observedSourceTimestamp?.toISOString() || null,
    missingRequirements,
  }
  try {
    await tx.writeOffRecoveryTriggerRecord.create({ data: {
      caseId: recoveryCase.id,
      localInvoiceId: input.invoice.id,
      zohoInvoiceId: input.invoice.zohoId,
      sourceField: WRITE_OFF_SOURCE_FIELD,
      previousValue,
      newValue: next.value as boolean,
      sourceTimestamp: observedSourceTimestamp,
      ingestedAt: detectedAt,
      idempotencyKey: transitionKey(input.invoice.zohoId, previousValue, next.value as boolean, observedSourceTimestamp),
      payloadFingerprint: fingerprint(sanitizedEvidence),
      missingRequirements,
    } })
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error
  }
  return { action: next.value ? "CASE_BLOCKED" as const : "REVIEW_REQUIRED" as const, caseId: recoveryCase.id, missingRequirements, zohoCalls: WRITE_OFF_TRIGGER_ZOHO_CALLS }
}

export async function persistBoundedImportedInvoices(
  database: PrismaClient,
  rows: JsonRecord[],
  actorId: string,
  ensureActive: () => Promise<void> = async () => undefined,
) {
  const localUsers = await database.user.findMany({ select: { id: true, name: true } })
  const localUserByName = new Map(localUsers.filter(user => user.name).map(user => [user.name!.trim().toLowerCase(), user.id]))
  let processed = 0
  let skippedUnmatchedAccount = 0
  let writeOffTriggerZohoCalls = 0
  let writeOffParseAnomalyFailures = 0
  for (const row of rows) {
    await ensureActive()
    const zohoInvoiceId = String(row.invoice_id || "")
    if (!zohoInvoiceId) continue
    const incomingObservation = parseWrittenOffObservation(row)
    const existing = await database.invoice.findUnique({ where: { zohoId: zohoInvoiceId }, select: { accountId: true, items: true, computedSalesperson: true } })
    const account = existing?.accountId
      ? { id: existing.accountId }
      : row.customer_id
        ? await database.account.findUnique({ where: { zohoId: String(row.customer_id) }, select: { id: true } })
        : null
    if (!account?.id) { skippedUnmatchedAccount += 1; continue }
    const snapshotName = writeOffSalespersonSnapshot(row, { id: "", zohoId: zohoInvoiceId, computedSalesperson: existing?.computedSalesperson })
    const persisted = await database.$transaction(async tx => {
      const invoice = await tx.invoice.upsert({
        where: { zohoId: zohoInvoiceId },
        update: { status: String(row.status || "draft"), amount: Number(row.total) || 0, balance: Number(row.balance) || 0, issueDate: row.date ? new Date(String(row.date)) : undefined, items: row as Prisma.InputJsonObject },
        create: { zohoId: zohoInvoiceId, accountId: account.id, status: String(row.status || "draft"), amount: Number(row.total) || 0, balance: Number(row.balance) || 0, issueDate: row.date ? new Date(String(row.date)) : new Date(), items: row as Prisma.InputJsonObject },
      })
      if (incomingObservation.anomalyCode) return { invoice, triggerResult: null }
      const triggerResult = await observeImportedInvoiceWriteOff(tx, {
        invoice,
        incomingPayload: row,
        previousPayload: existing?.items,
        responsibleRepId: snapshotName ? localUserByName.get(snapshotName.toLowerCase()) || null : null,
        actorId,
      })
      return { invoice, triggerResult }
    }, { isolationLevel: "Serializable" })
    if (persisted.triggerResult) writeOffTriggerZohoCalls += persisted.triggerResult.zohoCalls
    else {
      // Malformed optional metadata must never roll back a valid invoice. Store
      // its sanitized diagnostic in an independent local transaction.
      try {
        const anomaly = await database.$transaction(tx => observeImportedInvoiceWriteOff(tx, {
          invoice: persisted.invoice,
          incomingPayload: row,
          previousPayload: existing?.items,
          responsibleRepId: snapshotName ? localUserByName.get(snapshotName.toLowerCase()) || null : null,
          actorId,
        }))
        writeOffTriggerZohoCalls += anomaly.zohoCalls
      } catch {
        writeOffParseAnomalyFailures += 1
      }
    }
    processed += 1
  }
  return { processed, skippedUnmatchedAccount, writeOffTriggerZohoCalls, writeOffParseAnomalyFailures }
}
