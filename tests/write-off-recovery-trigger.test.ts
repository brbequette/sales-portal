import { describe, expect, it } from "vitest"
/* eslint-disable @typescript-eslint/no-explicit-any -- minimal in-memory Prisma transaction double */
import {
  AUTOMATIC_RECOVERY_RATE_BPS,
  observeImportedInvoiceWriteOff,
  parseWrittenOffObservation,
  persistBoundedImportedInvoices,
  WRITE_OFF_TRIGGER_ZOHO_CALLS,
  writeOffTriggerDryRun,
} from "../src/lib/write-off-recovery-trigger"

function fakeTransaction() {
  const cases = new Map<string, any>()
  const triggers = new Map<string, any>()
  const ledgerCreates: unknown[] = []
  const tx = {
    writeOffRecoveryCase: {
      findUnique: async ({ where }: any) => [...cases.values()].find(value => value.invoiceId === where.invoiceId) || null,
      upsert: async ({ where, update, create }: any) => {
      const key = `${where.triggerSourceField_triggerZohoInvoiceId.triggerSourceField}:${where.triggerSourceField_triggerZohoInvoiceId.triggerZohoInvoiceId}`
      const current = cases.get(key)
      if (current) { const changed = { ...current, ...update }; cases.set(key, changed); return changed }
      const inserted = { id: `case-${cases.size + 1}`, ...create }; cases.set(key, inserted); return inserted
    } },
    writeOffRecoveryTriggerRecord: { create: async ({ data }: any) => {
      if (triggers.has(data.idempotencyKey)) return triggers.get(data.idempotencyKey)
      triggers.set(data.idempotencyKey, data); return data
    } },
    writeOffRecoveryLedgerEvent: { create: async (data: unknown) => { ledgerCreates.push(data) } },
  }
  return { tx: tx as any, cases, triggers, ledgerCreates }
}

function fakeImportDatabase() {
  const state = fakeTransaction()
  const invoices = new Map<string, any>()
  const database = {
    user: { findMany: async () => [] },
    account: { findUnique: async () => ({ id: "account-1" }) },
    invoice: { findUnique: async ({ where }: any) => invoices.get(where.zohoId) || null },
    $transaction: async (callback: any) => callback({
      ...state.tx,
      invoice: { upsert: async ({ where, update, create }: any) => {
        const stored = { id: `local-${where.zohoId}`, computedSalesperson: null, ...(invoices.has(where.zohoId) ? update : create) }
        invoices.set(where.zohoId, stored)
        return stored
      } },
    }),
  }
  return { database: database as any, invoices, ...state }
}

const invoice = { id: "local-invoice-1", zohoId: "zoho-invoice-1", computedSalesperson: "Rep One" }
const incoming = (value: unknown, extras: Record<string, unknown> = {}) => ({ invoice_id: invoice.zohoId, cf_written_off: value, salesperson_name: "Rep One", ...extras })

describe("bounded write-off recovery trigger", () => {
  it("strictly parses Boolean false and creates nothing", async () => {
    const state = fakeTransaction()
    expect(parseWrittenOffObservation(incoming(false))).toEqual({ present: true, value: false })
    const result = await observeImportedInvoiceWriteOff(state.tx, { invoice, incomingPayload: incoming(false), previousPayload: null, responsibleRepId: "rep-1", actorId: "import-1" })
    expect(result.action).toBe("NO_CASE")
    expect(state.cases.size).toBe(0)
  })

  it.each([
    ["false to true", incoming(false)],
    ["initial true", null],
    ["first trigger observation of a previously stored true", incoming(true)],
  ])("%s creates one blocked 5000-bps case", async (_label, previousPayload) => {
    const state = fakeTransaction()
    const result = await observeImportedInvoiceWriteOff(state.tx, { invoice, incomingPayload: incoming(true), previousPayload, responsibleRepId: "rep-1", actorId: "import-1" })
    expect(result).toMatchObject({ action: "CASE_BLOCKED", zohoCalls: 0 })
    expect([...state.cases.values()][0]).toMatchObject({ status: "DRAFT", evidenceStatus: "PENDING_EVIDENCE", responsibilityRateBps: AUTOMATIC_RECOVERY_RATE_BPS, originalResponsibilityRateBps: AUTOMATIC_RECOVERY_RATE_BPS })
    expect(state.triggers.size).toBe(1)
    expect(state.ledgerCreates).toHaveLength(0)
  })

  it("repeated and concurrent true observations retain one case", async () => {
    const state = fakeTransaction()
    await Promise.all(Array.from({ length: 12 }, () => observeImportedInvoiceWriteOff(state.tx, { invoice, incomingPayload: incoming(true), previousPayload: null, responsibleRepId: "rep-1", actorId: "import-1" })))
    expect(state.cases.size).toBe(1)
    expect(state.triggers.size).toBe(1)
    const repeated = await observeImportedInvoiceWriteOff(state.tx, { invoice, incomingPayload: incoming(true), previousPayload: incoming(true), responsibleRepId: "rep-1", actorId: "import-2" })
    expect(repeated.action).toBe("UNCHANGED")
  })

  it("processing N imported invoice observations adds zero Zoho calls", async () => {
    let calls = 0
    for (let index = 0; index < 50; index += 1) {
      const state = fakeTransaction()
      const result = await observeImportedInvoiceWriteOff(state.tx, {
        invoice: { ...invoice, id: `local-${index}`, zohoId: `zoho-${index}` },
        incomingPayload: { ...incoming(index % 2 === 0), invoice_id: `zoho-${index}` },
        previousPayload: null,
        responsibleRepId: "rep-1",
        actorId: "bounded-import",
      })
      calls += result.zohoCalls
    }
    expect(calls).toBe(0)
  })

  it.each(["true", "false", "yes", "1", 1, 0, null])("fails closed on malformed value %j without coercion", value => {
    expect(parseWrittenOffObservation(incoming(value))).toEqual({ present: true, value: null, anomalyCode: "NON_BOOLEAN_VALUE" })
  })

  it("records a sanitized malformed observation without creating a case", async () => {
    const state = fakeTransaction()
    const result = await observeImportedInvoiceWriteOff(state.tx, { invoice, incomingPayload: { ...incoming("yes"), customer_name: "DO NOT STORE" }, previousPayload: null, actorId: "import-1" })
    expect(result).toMatchObject({ action: "PARSE_ANOMALY", zohoCalls: 0 })
    expect(state.cases.size).toBe(0)
    const evidence = [...state.triggers.values()][0]
    expect(evidence).toMatchObject({ caseId: null, newValue: null, observationKind: "PARSE_ANOMALY", anomalyCode: "NON_BOOLEAN_VALUE" })
    expect(JSON.stringify(evidence)).not.toContain("DO NOT STORE")
  })

  it.each([
    ["missing", undefined, 0],
    ["malformed", "yes", 1],
  ])("persists an invoice with %s optional field and makes no Zoho call", async (_label, value, anomalyCount) => {
    const state = fakeImportDatabase()
    const row: Record<string, unknown> = { invoice_id: "zoho-import-1", customer_id: "customer-1", total: 125, customer_name: "PRIVATE CUSTOMER" }
    if (value !== undefined) row.cf_written_off = value
    const result = await persistBoundedImportedInvoices(state.database, [row], "bounded-import")
    expect(result).toMatchObject({ processed: 1, writeOffTriggerZohoCalls: 0 })
    expect(state.invoices.has("zoho-import-1")).toBe(true)
    expect(state.cases.size).toBe(0)
    expect(state.triggers.size).toBe(anomalyCount)
    expect(JSON.stringify([...state.triggers.values()])).not.toContain("PRIVATE CUSTOMER")
  })

  it("keeps a malformed invoice when anomaly persistence itself fails", async () => {
    const state = fakeImportDatabase()
    state.tx.writeOffRecoveryTriggerRecord.create = async () => { throw new Error("diagnostic storage unavailable") }
    const result = await persistBoundedImportedInvoices(state.database, [{ invoice_id: "zoho-import-failure", customer_id: "customer-1", cf_written_off: "true" }], "bounded-import")
    expect(result).toMatchObject({ processed: 1, writeOffTriggerZohoCalls: 0, writeOffParseAnomalyFailures: 1 })
    expect(state.invoices.has("zoho-import-failure")).toBe(true)
    expect(state.cases.size).toBe(0)
  })

  it("true to false preserves the case and flags manager review", async () => {
    const state = fakeTransaction()
    await observeImportedInvoiceWriteOff(state.tx, { invoice, incomingPayload: incoming(true), previousPayload: null, responsibleRepId: "rep-1", actorId: "import-1" })
    const result = await observeImportedInvoiceWriteOff(state.tx, { invoice, incomingPayload: incoming(false), previousPayload: incoming(true), responsibleRepId: "rep-1", actorId: "import-2" })
    expect(result.action).toBe("REVIEW_REQUIRED")
    expect(state.cases.size).toBe(1)
    expect([...state.cases.values()][0]).toMatchObject({ managerReviewRequired: true, evidenceStatus: "REVIEW_REQUIRED", zohoSyncStatus: "REVIEW_REQUIRED" })
    expect(state.triggers.size).toBe(2)
    expect(state.ledgerCreates).toHaveLength(0)
  })

  it("records blockers instead of fetching missing evidence or posting money", async () => {
    const state = fakeTransaction()
    const result = await observeImportedInvoiceWriteOff(state.tx, { invoice: { ...invoice, computedSalesperson: null }, incomingPayload: { invoice_id: invoice.zohoId, cf_written_off: true }, previousPayload: null, actorId: "import-1" })
    expect(result.missingRequirements).toEqual(["HISTORICAL_PRODUCT_COST", "SALESPERSON_SNAPSHOT", "COMMISSION_EVIDENCE"])
    expect(result.zohoCalls).toBe(WRITE_OFF_TRIGGER_ZOHO_CALLS)
    expect(state.ledgerCreates).toHaveLength(0)
  })

  it("dry-run reports only counts and sanitized identifiers", () => {
    const report = writeOffTriggerDryRun([
      { invoice_id: "sensitive-1", payload: incoming(true) },
      { invoice_id: "sensitive-2", payload: incoming(false) },
      { invoice_id: "sensitive-3", payload: incoming("true") },
    ])
    expect(report).toMatchObject({ qualifyingCount: 1, malformedCount: 1 })
    expect(report.sanitizedInvoiceIds[0]).not.toContain("sensitive")
  })
})
