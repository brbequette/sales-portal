import { Prisma, type PrismaClient } from "@prisma/client"

const EXPECTED_MIGRATION = "20260917110000_write_off_anomaly_observability"
const REQUIRED_TABLES = [
  "WriteOffRecoveryCase",
  "WriteOffRecoveryTriggerRecord",
  "WriteOffRecoveryCostComponent",
  "WriteOffReturnInspection",
  "WriteOffRecoveryLedgerEvent",
  "WriteOffRecoveryPolicy",
]
const REQUIRED_COLUMN_TABLES = [
  "WriteOffRecoveryCase", "WriteOffRecoveryCase", "WriteOffRecoveryCase", "WriteOffRecoveryCase", "WriteOffRecoveryCase", "WriteOffRecoveryCase", "WriteOffRecoveryCase",
  "WriteOffRecoveryTriggerRecord", "WriteOffRecoveryTriggerRecord", "WriteOffRecoveryTriggerRecord", "WriteOffRecoveryTriggerRecord", "WriteOffRecoveryTriggerRecord", "WriteOffRecoveryTriggerRecord", "WriteOffRecoveryTriggerRecord",
  "WriteOffRecoveryTriggerRecord", "WriteOffRecoveryTriggerRecord", "WriteOffRecoveryTriggerRecord", "WriteOffRecoveryTriggerRecord", "WriteOffRecoveryTriggerRecord", "WriteOffRecoveryTriggerRecord", "WriteOffRecoveryTriggerRecord",
]
const REQUIRED_COLUMNS = [
  "triggerSourceField", "triggerZohoInvoiceId", "evidenceStatus", "missingRequirements", "managerReviewRequired", "salespersonSnapshot", "triggerDetectedAt",
  "caseId", "sourceField", "zohoInvoiceId", "idempotencyKey", "observationKind", "anomalyCode", "payloadFingerprint",
  "observedFieldPath", "observedJsonType", "sanitizedStructuralShape", "checkboxTokenClass", "sourceInvoiceFingerprint", "sourceModificationTimestamp", "anomalySchemaVersion",
]

type QueryClient = Pick<PrismaClient, "$queryRaw">
type BoolRow = { ok: boolean }
type CountRow = Record<string, bigint | number>
type JsonCounts = Record<string, number>
type AnomalyRow = {
  legacy_unknown: bigint | number
  by_reason: JsonCounts
  by_field_path: JsonCounts
  by_json_type: JsonCounts
  by_token_class: JsonCounts
  distinct_source_invoices: bigint | number
  distinct_payloads: bigint | number
  exact_replays: bigint | number
  repeated_payloads: bigint | number
  repeated_source_invoices: bigint | number
  first_observed: Date | null
  last_observed: Date | null
  checkbox_like_string_proven: boolean
}

export type RecoveryHealth = {
  schema: {
    requiredTables: boolean
    requiredColumns: boolean
    uniqueSourceInvoiceConstraint: boolean
    idempotencyIndex: boolean
    appendOnlyProtection: boolean
    expectedMigrationPresent: boolean
  }
  counts: {
    automaticRecoveryCases: number | null
    blockedAutomaticCases: number | null
    triggerObservations: number | null
    malformedFieldAnomalies: number | null
    automaticCasesLackingBlockers: number | null
    automaticCasesWithApprovedCommissionReversals: number | null
    automaticCasesWithApprovedCostResponsibility: number | null
    recoveryLedgerPostingsTiedToAutomaticCases: number | null
    duplicateSourceInvoiceGroups: number | null
    duplicateIdempotencyKeyGroups: number | null
  }
  anomalyDiagnostics: {
    legacyUnknownCount: number | null
    byReason: JsonCounts | null
    byFieldPath: JsonCounts | null
    byJsonType: JsonCounts | null
    byTokenClass: JsonCounts | null
    distinctSourceInvoiceFingerprintCount: number | null
    distinctPayloadFingerprintCount: number | null
    exactReplayDuplicateCount: number | null
    repeatedPayloadFingerprintGroups: number | null
    repeatedSourceInvoiceFingerprintGroups: number | null
    firstObservationTimestamp: string | null
    lastObservationTimestamp: string | null
    checkboxLikeStringRepresentationProven: boolean | null
  }
  assertions: {
    schemaReady: boolean
    duplicatesFound: boolean
    unexpectedFinancialPostings: boolean
    unsafeAutomaticCases: boolean
    syntheticTestReady: boolean
  }
}

const emptyAnomalyDiagnostics = (): RecoveryHealth["anomalyDiagnostics"] => ({
  legacyUnknownCount: null, byReason: null, byFieldPath: null, byJsonType: null, byTokenClass: null,
  distinctSourceInvoiceFingerprintCount: null, distinctPayloadFingerprintCount: null,
  exactReplayDuplicateCount: null, repeatedPayloadFingerprintGroups: null, repeatedSourceInvoiceFingerprintGroups: null,
  firstObservationTimestamp: null, lastObservationTimestamp: null, checkboxLikeStringRepresentationProven: null,
})

const emptyCounts = (): RecoveryHealth["counts"] => ({
  automaticRecoveryCases: null,
  blockedAutomaticCases: null,
  triggerObservations: null,
  malformedFieldAnomalies: null,
  automaticCasesLackingBlockers: null,
  automaticCasesWithApprovedCommissionReversals: null,
  automaticCasesWithApprovedCostResponsibility: null,
  recoveryLedgerPostingsTiedToAutomaticCases: null,
  duplicateSourceInvoiceGroups: null,
  duplicateIdempotencyKeyGroups: null,
})

function number(value: bigint | number | undefined) {
  return Number(value || 0)
}

export async function readWriteOffRecoveryHealth(database: QueryClient): Promise<RecoveryHealth> {
  const schema = {
    requiredTables: false,
    requiredColumns: false,
    uniqueSourceInvoiceConstraint: false,
    idempotencyIndex: false,
    appendOnlyProtection: false,
    expectedMigrationPresent: false,
  }

  try {
    const [tables] = await database.$queryRaw<BoolRow[]>(Prisma.sql`
      SELECT count(*) = ${REQUIRED_TABLES.length} AS ok
      FROM unnest(${REQUIRED_TABLES}::text[]) AS expected(name)
      WHERE to_regclass(format('public.%I', expected.name)) IS NOT NULL
    `)
    schema.requiredTables = Boolean(tables?.ok)

    const [columns] = await database.$queryRaw<BoolRow[]>(Prisma.sql`
      WITH expected(table_name, column_name) AS (
        SELECT * FROM unnest(${REQUIRED_COLUMN_TABLES}::text[], ${REQUIRED_COLUMNS}::text[])
      )
      SELECT count(*) = ${REQUIRED_COLUMNS.length} AS ok
      FROM expected
      JOIN information_schema.columns actual
        ON actual.table_schema = 'public'
       AND actual.table_name = expected.table_name
       AND actual.column_name = expected.column_name
    `)
    schema.requiredColumns = Boolean(columns?.ok)

    const [indexes] = await database.$queryRaw<Array<{ source_unique: boolean; idempotency_unique: boolean }>>(Prisma.sql`
      SELECT
        count(*) FILTER (WHERE tablename = 'WriteOffRecoveryCase' AND indexdef ILIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE '%("triggerSourceField", "triggerZohoInvoiceId")%') = 1 AS source_unique,
        count(*) FILTER (WHERE tablename = 'WriteOffRecoveryTriggerRecord' AND indexdef ILIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE '%("idempotencyKey")%') = 1 AS idempotency_unique
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = ANY(${["WriteOffRecoveryCase", "WriteOffRecoveryTriggerRecord"]}::text[])
    `)
    schema.uniqueSourceInvoiceConstraint = Boolean(indexes?.source_unique)
    schema.idempotencyIndex = Boolean(indexes?.idempotency_unique)

    const [protection] = await database.$queryRaw<BoolRow[]>(Prisma.sql`
      SELECT count(*) = 1 AS ok
      FROM pg_trigger trigger
      JOIN pg_class relation ON relation.oid = trigger.tgrelid
      WHERE relation.relname = 'WriteOffRecoveryTriggerRecord'
        AND trigger.tgname = 'WriteOffRecoveryTriggerRecord_immutable'
        AND NOT trigger.tgisinternal
        AND pg_get_triggerdef(trigger.oid) ILIKE '%BEFORE%'
        AND pg_get_triggerdef(trigger.oid) ILIKE '%UPDATE%'
        AND pg_get_triggerdef(trigger.oid) ILIKE '%DELETE%'
    `)
    schema.appendOnlyProtection = Boolean(protection?.ok)

    const [history] = await database.$queryRaw<BoolRow[]>(Prisma.sql`
      SELECT CASE WHEN to_regclass('"_prisma_migrations"') IS NULL THEN false ELSE
        EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = ${EXPECTED_MIGRATION} AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
      END AS ok
    `)
    schema.expectedMigrationPresent = Boolean(history?.ok)
  } catch {
    return failClosed(schema)
  }

  const schemaReady = Object.values(schema).every(Boolean)
  if (!schemaReady) return failClosed(schema)

  try {
    const [row] = await database.$queryRaw<CountRow[]>(Prisma.sql`
      WITH automatic_cases AS (
        SELECT * FROM "WriteOffRecoveryCase" WHERE "triggerSourceField" = 'cf_written_off'
      ), duplicate_sources AS (
        SELECT "triggerSourceField", "triggerZohoInvoiceId"
        FROM "WriteOffRecoveryCase"
        WHERE "triggerZohoInvoiceId" IS NOT NULL
        GROUP BY 1, 2 HAVING count(*) > 1
      ), duplicate_keys AS (
        SELECT "idempotencyKey" FROM "WriteOffRecoveryTriggerRecord" GROUP BY 1 HAVING count(*) > 1
      )
      SELECT
        (SELECT count(*) FROM automatic_cases) AS automatic_cases,
        (SELECT count(*) FROM automatic_cases WHERE "status" = 'DRAFT' AND "evidenceStatus" IN ('PENDING_EVIDENCE', 'REVIEW_REQUIRED')) AS blocked_cases,
        (SELECT count(*) FROM "WriteOffRecoveryTriggerRecord" WHERE "observationKind" = 'BOOLEAN') AS observations,
        (SELECT count(*) FROM "WriteOffRecoveryTriggerRecord" WHERE "observationKind" = 'PARSE_ANOMALY') AS anomalies,
        (SELECT count(*) FROM automatic_cases WHERE jsonb_typeof("missingRequirements") <> 'array' OR jsonb_array_length("missingRequirements") = 0) AS lacking_blockers,
        (SELECT count(DISTINCT recovery.id) FROM "WriteOffRecoveryLedgerEvent" event JOIN automatic_cases recovery ON recovery.id = event."caseId" WHERE event."eventType" = 'COMMISSION_REVERSAL') AS commission_reversals,
        (SELECT count(DISTINCT recovery.id) FROM "WriteOffRecoveryLedgerEvent" event JOIN automatic_cases recovery ON recovery.id = event."caseId" WHERE event."eventType" = 'COST_RESPONSIBILITY_DEBIT') AS cost_responsibility,
        (SELECT count(*) FROM "WriteOffRecoveryLedgerEvent" event JOIN automatic_cases recovery ON recovery.id = event."caseId") AS ledger_postings,
        (SELECT count(*) FROM duplicate_sources) AS duplicate_sources,
        (SELECT count(*) FROM duplicate_keys) AS duplicate_keys
    `)
    const counts: RecoveryHealth["counts"] = {
      automaticRecoveryCases: number(row?.automatic_cases),
      blockedAutomaticCases: number(row?.blocked_cases),
      triggerObservations: number(row?.observations),
      malformedFieldAnomalies: number(row?.anomalies),
      automaticCasesLackingBlockers: number(row?.lacking_blockers),
      automaticCasesWithApprovedCommissionReversals: number(row?.commission_reversals),
      automaticCasesWithApprovedCostResponsibility: number(row?.cost_responsibility),
      recoveryLedgerPostingsTiedToAutomaticCases: number(row?.ledger_postings),
      duplicateSourceInvoiceGroups: number(row?.duplicate_sources),
      duplicateIdempotencyKeyGroups: number(row?.duplicate_keys),
    }
    const duplicatesFound = counts.duplicateSourceInvoiceGroups! > 0 || counts.duplicateIdempotencyKeyGroups! > 0
    const unexpectedFinancialPostings = counts.recoveryLedgerPostingsTiedToAutomaticCases! > 0
    const unsafeAutomaticCases = counts.automaticCasesLackingBlockers! > 0 || unexpectedFinancialPostings
    const [anomaly] = await database.$queryRaw<AnomalyRow[]>(Prisma.sql`
      WITH anomalies AS (
        SELECT * FROM "WriteOffRecoveryTriggerRecord" WHERE "observationKind" = 'PARSE_ANOMALY'
      ), payload_repeats AS (
        SELECT "payloadFingerprint" FROM anomalies GROUP BY 1 HAVING count(*) > 1
      ), source_repeats AS (
        SELECT "sourceInvoiceFingerprint" FROM anomalies
        WHERE "sourceInvoiceFingerprint" IS NOT NULL GROUP BY 1 HAVING count(*) > 1
      ), replay_duplicates AS (
        SELECT "idempotencyKey" FROM anomalies GROUP BY 1 HAVING count(*) > 1
      )
      SELECT
        count(*) FILTER (WHERE "anomalySchemaVersion" IS NULL) AS legacy_unknown,
        COALESCE((SELECT jsonb_object_agg(key, total) FROM (SELECT COALESCE("anomalyCode", 'UNKNOWN') key, count(*) total FROM anomalies GROUP BY 1) grouped), '{}'::jsonb) AS by_reason,
        COALESCE((SELECT jsonb_object_agg(key, total) FROM (SELECT COALESCE("observedFieldPath", 'LEGACY_UNKNOWN') key, count(*) total FROM anomalies GROUP BY 1) grouped), '{}'::jsonb) AS by_field_path,
        COALESCE((SELECT jsonb_object_agg(key, total) FROM (SELECT COALESCE("observedJsonType", 'LEGACY_UNKNOWN') key, count(*) total FROM anomalies GROUP BY 1) grouped), '{}'::jsonb) AS by_json_type,
        COALESCE((SELECT jsonb_object_agg(key, total) FROM (SELECT COALESCE("checkboxTokenClass", 'LEGACY_UNKNOWN') key, count(*) total FROM anomalies GROUP BY 1) grouped), '{}'::jsonb) AS by_token_class,
        count(DISTINCT "sourceInvoiceFingerprint") AS distinct_source_invoices,
        count(DISTINCT "payloadFingerprint") AS distinct_payloads,
        (SELECT count(*) FROM replay_duplicates) AS exact_replays,
        (SELECT count(*) FROM payload_repeats) AS repeated_payloads,
        (SELECT count(*) FROM source_repeats) AS repeated_source_invoices,
        min("ingestedAt") AS first_observed,
        max("ingestedAt") AS last_observed,
        COALESCE(bool_or("anomalySchemaVersion" = 'SANITIZED_V1' AND "checkboxTokenClass" IN ('STRING_TRUE', 'STRING_FALSE', 'STRING_YES_NO', 'STRING_ONE_ZERO')), false) AS checkbox_like_string_proven
      FROM anomalies
    `)
    const anomalyDiagnostics: RecoveryHealth["anomalyDiagnostics"] = {
      legacyUnknownCount: number(anomaly?.legacy_unknown),
      byReason: anomaly?.by_reason || {}, byFieldPath: anomaly?.by_field_path || {},
      byJsonType: anomaly?.by_json_type || {}, byTokenClass: anomaly?.by_token_class || {},
      distinctSourceInvoiceFingerprintCount: number(anomaly?.distinct_source_invoices),
      distinctPayloadFingerprintCount: number(anomaly?.distinct_payloads),
      exactReplayDuplicateCount: number(anomaly?.exact_replays),
      repeatedPayloadFingerprintGroups: number(anomaly?.repeated_payloads),
      repeatedSourceInvoiceFingerprintGroups: number(anomaly?.repeated_source_invoices),
      firstObservationTimestamp: anomaly?.first_observed?.toISOString() || null,
      lastObservationTimestamp: anomaly?.last_observed?.toISOString() || null,
      checkboxLikeStringRepresentationProven: Boolean(anomaly?.checkbox_like_string_proven),
    }
    return { schema, counts, anomalyDiagnostics, assertions: { schemaReady, duplicatesFound, unexpectedFinancialPostings, unsafeAutomaticCases, syntheticTestReady: schemaReady && !duplicatesFound && !unexpectedFinancialPostings && !unsafeAutomaticCases } }
  } catch {
    return failClosed(schema)
  }
}

function failClosed(schema: RecoveryHealth["schema"]): RecoveryHealth {
  return {
    schema,
    counts: emptyCounts(), anomalyDiagnostics: emptyAnomalyDiagnostics(),
    assertions: { schemaReady: false, duplicatesFound: false, unexpectedFinancialPostings: false, unsafeAutomaticCases: true, syntheticTestReady: false },
  }
}
