import { createHmac, timingSafeEqual } from "node:crypto"

export type AiRoleLevel = "VIEWER" | "AGENT" | "MANAGER" | "ADMIN"

export interface AiActionPolicy {
  minimumRole: AiRoleLevel
  mutating: boolean
  requiresConfirmation: boolean
}

const ROLE_RANK: Record<AiRoleLevel, number> = {
  VIEWER: 0,
  AGENT: 1,
  MANAGER: 2,
  ADMIN: 3,
}

const BUILTIN_POLICIES: Record<string, AiActionPolicy> = {
  toggle_timeclock: { minimumRole: "AGENT", mutating: true, requiresConfirmation: true },
  create_task: { minimumRole: "AGENT", mutating: true, requiresConfirmation: true },
  update_task_outcome: { minimumRole: "AGENT", mutating: true, requiresConfirmation: true },
  log_sales_call: { minimumRole: "AGENT", mutating: true, requiresConfirmation: true },
  update_account_status_and_quality: { minimumRole: "AGENT", mutating: true, requiresConfirmation: true },
  process_invoice_financials: { minimumRole: "AGENT", mutating: true, requiresConfirmation: true },
  query_users: { minimumRole: "MANAGER", mutating: false, requiresConfirmation: false },
}

export function normalizeAiRole(role: string | null | undefined): AiRoleLevel {
  const value = role?.trim().toLowerCase() || ""
  if (value === "master_admin" || value.includes("administrator") || value === "admin") return "ADMIN"
  if (value.includes("manager") || value.includes("collections")) return "MANAGER"
  if (value.includes("agent") || value.includes("sales") || value.includes("rep")) return "AGENT"
  return "VIEWER"
}

export function canUseAiTool(role: string | null | undefined, minimumRole: AiRoleLevel): boolean {
  return ROLE_RANK[normalizeAiRole(role)] >= ROLE_RANK[minimumRole]
}

export function getBuiltinAiToolPolicy(name: string): AiActionPolicy {
  return BUILTIN_POLICIES[name] || { minimumRole: "VIEWER", mutating: false, requiresConfirmation: false }
}

interface ConfirmationPayload {
  userId: string
  toolName: string
  args: unknown
  customToolId?: string
  expiresAt: number
}

function confirmationSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
  if (!secret) throw new Error("AI action confirmation is not configured")
  return secret
}

export function createAiConfirmationToken(
  payload: Omit<ConfirmationPayload, "expiresAt">,
  ttlMs = 5 * 60 * 1000,
): string {
  const encoded = Buffer.from(JSON.stringify({ ...payload, expiresAt: Date.now() + ttlMs })).toString("base64url")
  const signature = createHmac("sha256", confirmationSecret()).update(encoded).digest("base64url")
  return `${encoded}.${signature}`
}

export function verifyAiConfirmationToken(token: string, expectedUserId: string): ConfirmationPayload {
  const [encoded, suppliedSignature] = token.split(".")
  if (!encoded || !suppliedSignature) throw new Error("Invalid action confirmation")
  const expectedSignature = createHmac("sha256", confirmationSecret()).update(encoded).digest("base64url")
  const supplied = Buffer.from(suppliedSignature)
  const expected = Buffer.from(expectedSignature)
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("Invalid action confirmation")
  }
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ConfirmationPayload
  if (payload.userId !== expectedUserId) throw new Error("Action confirmation belongs to another user")
  if (!payload.expiresAt || payload.expiresAt < Date.now()) throw new Error("Action confirmation expired")
  return payload
}
