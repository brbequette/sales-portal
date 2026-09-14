import crypto from "crypto"

export const RECONCILIATION_ARTIFACT_FILES = [
  "reconciliation-summary.json", "ready-forward-payload.json", "ready-rollback-snapshot.json",
  "unresolved-cost-report.json", "uncertain-classification-report.json", "payload-review.json",
  "vig-audit.json", "redaction-audit.json", "manifest.json"
] as const

export const ALLOWED_DOCUMENT_TYPES = new Set(["invoice", "quote", "sales_order"])
export const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024
export const MAX_CHUNK_BYTES = 512 * 1024

const forbidden = /password|secret|token|credential|customer|contact|description|line.?item|raw.?data|export|oauth|amount|price|cost|profit|total|subtotal|rate/i
const hash = (value: Uint8Array | string) => crypto.createHash("sha256").update(value).digest("hex")

export function artifactFingerprint(bytes: Uint8Array) { return hash(bytes) }

function rejectSensitive(value: unknown): void {
  if (!value || typeof value !== "object") return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.test(key)) throw new Error("REDACTION_CONTRACT_FAILED")
    rejectSensitive(child)
  }
}

function identities(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("ARTIFACT_ARRAY_REQUIRED")
  return value.map(item => {
    if (!item || typeof item !== "object") throw new Error("ARTIFACT_RECORD_INVALID")
    const record = item as Record<string, unknown>
    const type = String(record.documentType || "")
    const id = String(record.zohoId || record.documentId || "")
    if (!ALLOWED_DOCUMENT_TYPES.has(type) || !id) throw new Error("DOCUMENT_IDENTITY_INVALID")
    return `${type}:${id}`
  })
}

export function validateReconciliationArtifactPackage(files: Record<string, unknown>, expectedCommit?: string) {
  const names = Object.keys(files).sort()
  const expected = [...RECONCILIATION_ARTIFACT_FILES].sort()
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error("ARTIFACT_FILE_SET_INVALID")
  const manifest = files["manifest.json"] as Record<string, unknown>
  if (!manifest || typeof manifest !== "object" || !manifest.sha256 || typeof manifest.sha256 !== "object") throw new Error("MANIFEST_INVALID")
  const manifestHashes = Object.keys(manifest.sha256 as Record<string, unknown>).sort()
  if (JSON.stringify(manifestHashes) !== JSON.stringify(expected.filter(name => name !== "manifest.json").sort()) || Object.values(manifest.sha256 as Record<string, unknown>).some(value => typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value))) throw new Error("MANIFEST_INVALID")
  const summary = files["reconciliation-summary.json"] as Record<string, unknown>
  if (summary.dryRunComplete !== true || summary.readyPayloadIsolation !== true || summary.blockedDocumentExclusion !== true || summary.applyEnabled !== false || summary.status !== "COMPLETE_WITH_BLOCKERS") throw new Error("SUMMARY_GATE_INVALID")
  if (expectedCommit && summary.productionCommit !== expectedCommit) throw new Error("PRODUCTION_COMMIT_INVALID")
  const forwardIds = identities(files["ready-forward-payload.json"])
  const rollbackIds = identities(files["ready-rollback-snapshot.json"])
  if (new Set(forwardIds).size !== forwardIds.length || new Set(rollbackIds).size !== rollbackIds.length) throw new Error("DUPLICATE_IDENTITY")
  if (forwardIds.length !== rollbackIds.length || forwardIds.some(id => !rollbackIds.includes(id))) throw new Error("FORWARD_ROLLBACK_PAIRING_INVALID")
  const unresolved = identities(files["unresolved-cost-report.json"])
  const uncertain = identities(files["uncertain-classification-report.json"])
  const blocked = new Set([...unresolved, ...uncertain])
  if (forwardIds.some(id => blocked.has(id))) throw new Error("BLOCKED_DOCUMENT_IN_READY_PAYLOAD")
  rejectSensitive(files["redaction-audit.json"])
  return Object.freeze({ readyCount: forwardIds.length, blockedCount: blocked.size, fingerprint: hash(JSON.stringify(files)) })
}
