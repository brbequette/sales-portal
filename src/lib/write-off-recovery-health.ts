import { Prisma, type PrismaClient } from "@prisma/client"

const EXPECTED_MIGRATION = "20260916190000_write_off_recovery_bounded_trigger"
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
]
const REQUIRED_COLUMNS = [
  "triggerSourceField", "triggerZohoInvoiceId", "evidenceStatus", "missingRequirements", "managerReviewRequired", "salespersonSnapshot", "triggerDetectedAt",
  "caseId", "sourceField", "zohoInvoiceId", "idempotencyKey", "observationKind", "anomalyCode", "payloadFingerprint",
]

type QueryClient = Pick<PrismaClient, "$queryRaw">
type BoolRow = { ok: boolean }
type CountRow = Record<string, bigint | number>

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
  assertions: {
    schemaReady: boolean
    duplicatesFound: boolean
    unexpectedFinancialPostings: boolean
    unsafeAutomaticCases: boolean
    syntheticTestReady: boolean
  }
}

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
    return { schema, counts, assertions: { schemaReady, duplicatesFound, unexpectedFinancialPostings, unsafeAutomaticCases, syntheticTestReady: schemaReady && !duplicatesFound && !unexpectedFinancialPostings && !unsafeAutomaticCases } }
  } catch {
    return failClosed(schema)
  }
}

function failClosed(schema: RecoveryHealth["schema"]): RecoveryHealth {
  return {
    schema,
    counts: emptyCounts(),
    assertions: { schemaReady: false, duplicatesFound: false, unexpectedFinancialPostings: false, unsafeAutomaticCases: true, syntheticTestReady: false },
  }
}
