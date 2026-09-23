export const COMMISSION_LEDGER_START = new Date("2025-01-01T00:00:00.000Z")

export const COMMISSION_LEDGER_EXCLUDED_STATUSES = new Set([
  "void", "voided", "draft", "orphaned", "deleted",
  "written_off", "writeoff", "write_off", "written off", "bad debt",
])

export function isCommissionLedgerEligible(input: { issueDate: Date | string; status: string }) {
  return new Date(input.issueDate).getTime() >= COMMISSION_LEDGER_START.getTime()
    && !COMMISSION_LEDGER_EXCLUDED_STATUSES.has(String(input.status || "").trim().toLowerCase())
}
