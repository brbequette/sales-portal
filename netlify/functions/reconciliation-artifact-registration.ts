import { Handler } from "@netlify/functions"
import { getStore } from "@netlify/blobs"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"
import { prisma } from "./lib/prisma"
import { isAdminRole } from "../../src/lib/roles"
import { MAX_ARTIFACT_BYTES, MAX_CHUNK_BYTES, artifactFingerprint, validateReconciliationArtifactPackage } from "../../src/lib/reconciliation-artifact-contract"

const store = () => getStore({ name: "reconciliation-artifacts", consistency: "strong" })
const response = (statusCode: number, body: unknown) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const parse = (body: string | null) => { if (!body) throw new Error("BODY_REQUIRED"); const value = JSON.parse(body); return value as Record<string, unknown> }

export const handler: Handler = async event => {
  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") return response(405, { error: "METHOD_NOT_ALLOWED" })
  let caller
  try { caller = await authenticateFunction(event, { requireAdmin: true }) } catch (error) { return authErrorResponse(error, { "Content-Type": "application/json" }) }
  const user = caller.dbId ? await prisma.user.findUnique({ where: { id: caller.dbId }, select: { role: true } }) : null
  if (!user || !isAdminRole(user.role)) return response(403, { error: "ADMIN_REQUIRED" })
  if (event.httpMethod === "GET") {
    const records = await prisma.reconciliationArtifactRegistration.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { artifactId: true, fingerprint: true, aggregate: true, createdAt: true, finalizedAt: true, validationStatus: true, productionCommit: true, approvalStatus: true } })
    return response(200, { artifacts: records })
  }
  try {
    const body = parse(event.body)
    if (body.action === "chunk") {
      const bytes = Buffer.from(String(body.data || ""), "base64")
      if (bytes.length === 0 || bytes.length > MAX_CHUNK_BYTES) return response(413, { error: "CHUNK_LIMIT" })
      if (String(body.sha256 || "").toLowerCase() !== artifactFingerprint(bytes)) return response(400, { error: "CHUNK_HASH_INVALID" })
      const session = String(body.sessionId || ""); const index = Number(body.index); const total = Number(body.total)
      if (!session || !Number.isInteger(index) || !Number.isInteger(total) || index < 0 || index >= total || total > 32 || (body.expiresAt && Number(body.expiresAt) < Date.now())) return response(400, { error: "CHUNK_SEQUENCE_INVALID" })
      const chunkKey = `sessions/${caller.dbId}/${session}/${index}`
      if (await store().get(chunkKey, { type: "arrayBuffer" })) return response(409, { error: "CHUNK_REPLAY" })
      await store().set(chunkKey, bytes, { metadata: { sha256: artifactFingerprint(bytes), total: String(total) } })
      return response(202, { status: "CHUNK_ACCEPTED", index })
    }
    if (body.action !== "finalize") return response(400, { error: "FINALIZE_REQUIRED" })
    const files = body.files as Record<string, unknown>
    const validation = validateReconciliationArtifactPackage(files)
    const artifactId = `reconciliation/${validation.fingerprint}`
    const existing = await prisma.reconciliationArtifactRegistration.findUnique({ where: { fingerprint: validation.fingerprint } })
    if (existing) return response(409, { error: "ARTIFACT_ALREADY_REGISTERED" })
    await store().set(artifactId, JSON.stringify(files), { metadata: { fingerprint: validation.fingerprint, private: "true" } })
    const record = await prisma.reconciliationArtifactRegistration.create({ data: { artifactId, fingerprint: validation.fingerprint, aggregate: { readyCount: validation.readyCount, blockedCount: validation.blockedCount }, uploaderUserId: caller.dbId || caller.userId, validationStatus: "VALIDATED", finalizedAt: new Date(), approvalStatus: "REGISTERED_UNAPPROVED" } })
    return response(201, { artifactId: record.artifactId, fingerprint: record.fingerprint, status: record.approvalStatus })
  } catch (error) { return response(400, { error: error instanceof Error ? error.message : "ARTIFACT_VALIDATION_FAILED" }) }
}
