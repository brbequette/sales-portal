import crypto from "crypto"

export const RECONCILIATION_ARTIFACT_FILES = [
  "reconciliation-summary.json", "ready-forward-payload.json", "ready-rollback-snapshot.json",
  "unresolved-cost-report.json", "uncertain-classification-report.json", "payload-review.json",
  "vig-audit.json", "redaction-audit.json", "sha256-manifest.json"
] as const

export const ALLOWED_DOCUMENT_TYPES = new Set(["invoice", "quote", "sales_order"])
export const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024
export const MAX_CHUNK_BYTES = 512 * 1024

const forbidden = /password|secret|token|credential|customer|contact|description|line.?item|raw.?data|export|oauth|amount|price|cost|profit|total|subtotal|rate/i
const hash = (value: Uint8Array | string) => crypto.createHash("sha256").update(value).digest("hex")
const parsed = (value: unknown) => typeof value === "string" ? JSON.parse(value) as unknown : value
const bytes = (value: unknown) => typeof value === "string" ? Buffer.from(value) : Buffer.from(JSON.stringify(value))

export function artifactFingerprint(bytes: Uint8Array) { return hash(bytes) }

export function canonicalArtifactFingerprint(manifest: Record<string, string>, format = "reconciliation-artifact-registration-v1") {
  const names = Object.keys(manifest).sort()
  if (names.length !== RECONCILIATION_ARTIFACT_FILES.length - 1 || names.some(name => !RECONCILIATION_ARTIFACT_FILES.includes(name as typeof RECONCILIATION_ARTIFACT_FILES[number])) || names.some(name => !/^[a-z0-9][a-z0-9._-]*\.json$/.test(name)) || names.some(name => !/^[a-f0-9]{64}$/.test(manifest[name]))) throw new Error("MANIFEST_INVALID")
  return hash(JSON.stringify({ format, manifest: Object.fromEntries(names.map(name => [name, manifest[name]])) }))
}

function rejectSensitive(value: unknown): void {
  if (!value || typeof value !== "object") return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.test(key)) throw new Error("REDACTION_CONTRACT_FAILED")
    rejectSensitive(child)
  }
}

function identities(value: unknown): string[] {
  value = parsed(value)
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
  const manifest = parsed(files["sha256-manifest.json"]) as Record<string, unknown>
  if (!manifest || typeof manifest !== "object") throw new Error("MANIFEST_INVALID")
  const manifestHashes = Object.keys(manifest).sort()
  if (JSON.stringify(manifestHashes) !== JSON.stringify(expected.filter(name => name !== "sha256-manifest.json").sort()) || Object.values(manifest).some(value => typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))) throw new Error("MANIFEST_INVALID")
  for (const name of expected.filter(file => file !== "sha256-manifest.json")) if (hash(bytes(files[name])) !== (manifest as Record<string, string>)[name]) throw new Error("MANIFEST_HASH_MISMATCH")
  const summary = parsed(files["reconciliation-summary.json"]) as Record<string, unknown>
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
  rejectSensitive(parsed(files["redaction-audit.json"]))
  return Object.freeze({ readyCount: forwardIds.length, blockedCount: blocked.size, fingerprint: canonicalArtifactFingerprint(manifest as Record<string, string>) })
}
