import crypto from "node:crypto"
import bcrypt from "bcryptjs"
import type { Prisma, PrismaClient } from "@prisma/client"

export const MASTER_AUTH_SOURCE = "LOCAL_MASTER" as const
export const ZOHO_AUTH_SOURCE = "ZOHO" as const
export const LOCAL_STAFF_AUTH_SOURCE = "LOCAL_STAFF" as const
export type AuthSource = typeof MASTER_AUTH_SOURCE | typeof ZOHO_AUTH_SOURCE | typeof LOCAL_STAFF_AUTH_SOURCE

const MAX_FAILURES = 8
const WINDOW_MS = 15 * 60 * 1000
const LOCKOUT_MS = 15 * 60 * 1000
const dummyPasswordHash = bcrypt.hashSync("timing-only-password-that-never-authenticates", 12)

type MasterAuthDatabase = Pick<PrismaClient, "localMasterCredential" | "masterAdminLoginThrottle" | "authAuditEvent" | "$transaction">

export type LocalMasterIdentity = {
  id: string
  dbId: string
  name: string | null
  email: string
  role: "MASTER_ADMIN"
  authSource: typeof MASTER_AUTH_SOURCE
  isZohoUser: false
  mustRotatePassword: false
  credentialVersion: number
}

export function effectiveRoleForAuthSource(storedRole: string | null | undefined, source: AuthSource) {
  if (source === MASTER_AUTH_SOURCE) return "MASTER_ADMIN"
  return storedRole?.trim().toLowerCase() === "master_admin" ? "Administrator" : storedRole || "Sales Representative"
}

function authSecret() {
  return process.env.MASTER_ADMIN_AUTH_HMAC_SECRET || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || ""
}

function fingerprint(value: string) {
  const secret = authSecret()
  if (!secret) return null
  return crypto.createHmac("sha256", secret).update(value).digest("hex")
}

function normalizedAddress(value: string | undefined) {
  return String(value || "unknown").split(",")[0].trim().slice(0, 64).toLowerCase()
}

export async function authenticateLocalMaster(
  database: MasterAuthDatabase,
  input: { loginIdentifier: string; password: string; clientAddress?: string; requestId?: string; now?: Date },
): Promise<LocalMasterIdentity | null> {
  const loginIdentifier = input.loginIdentifier.trim().toLowerCase()
  const now = input.now || new Date()
  const throttleKey = fingerprint(`local-master-login:${loginIdentifier}:${normalizedAddress(input.clientAddress)}`)
  if (!loginIdentifier || !input.password || !throttleKey) return null

  const [credential, throttle] = await Promise.all([
    database.localMasterCredential.findUnique({
      where: { loginIdentifier },
      include: { user: { select: { id: true, email: true, name: true } } },
    }),
    database.masterAdminLoginThrottle.findUnique({ where: { key: throttleKey } }),
  ])

  const locked = Boolean((throttle?.lockedUntil && throttle.lockedUntil > now) || (credential?.lockedUntil && credential.lockedUntil > now))
  if (locked) {
    await database.authAuditEvent.create({ data: {
      eventType: "LOCAL_MASTER_LOGIN_LOCKOUT", actorUserId: credential?.userId,
      reasonCode: "BACKOFF_ACTIVE", entityType: "LOCAL_MASTER_CREDENTIAL",
      entityIdHash: throttleKey, requestId: input.requestId,
    } }).catch(() => undefined)
    return null
  }

  const passwordMatches = await bcrypt.compare(input.password, credential?.passwordHash || dummyPasswordHash)
  const usable = Boolean(credential && credential.active && !credential.revokedAt && passwordMatches)
  if (!usable) {
    const insideWindow = throttle && now.getTime() - throttle.windowStartedAt.getTime() <= WINDOW_MS
    const failedCount = insideWindow ? throttle.failedCount + 1 : 1
    const lockedUntil = failedCount >= MAX_FAILURES ? new Date(now.getTime() + LOCKOUT_MS) : null
    await database.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.masterAdminLoginThrottle.upsert({
        where: { key: throttleKey },
        create: { key: throttleKey, failedCount, windowStartedAt: now, lastFailureAt: now, lockedUntil },
        update: { failedCount, windowStartedAt: insideWindow ? throttle!.windowStartedAt : now, lastFailureAt: now, lockedUntil },
      })
      if (credential) {
        await tx.localMasterCredential.update({
          where: { id: credential.id },
          data: { failedLoginCount: { increment: 1 }, lockedUntil },
        })
      }
      await tx.authAuditEvent.create({ data: {
        eventType: lockedUntil ? "LOCAL_MASTER_LOGIN_LOCKOUT" : "LOCAL_MASTER_LOGIN_FAILURE",
        actorUserId: credential?.userId, reasonCode: "INVALID_CREDENTIALS",
        entityType: "LOCAL_MASTER_CREDENTIAL", entityIdHash: throttleKey, requestId: input.requestId,
      } })
    }).catch(() => undefined)
    return null
  }

  if (credential!.mustRotatePassword) {
    await database.authAuditEvent.create({ data: {
      eventType: "LOCAL_MASTER_LOGIN_FAILURE", actorUserId: credential!.userId,
      reasonCode: "ROTATION_REQUIRED", entityType: "LOCAL_MASTER_CREDENTIAL",
      entityIdHash: throttleKey, requestId: input.requestId,
    } }).catch(() => undefined)
    return null
  }

  await database.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.localMasterCredential.update({
      where: { id: credential!.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    })
    await tx.masterAdminLoginThrottle.upsert({
      where: { key: throttleKey },
      create: { key: throttleKey, failedCount: 0, windowStartedAt: now, lastFailureAt: now, lockedUntil: null },
      update: { failedCount: 0, windowStartedAt: now, lastFailureAt: now, lockedUntil: null },
    })
    await tx.authAuditEvent.create({ data: {
      eventType: "LOCAL_MASTER_LOGIN_SUCCESS", actorUserId: credential!.userId,
      reasonCode: "CREDENTIAL_VERIFIED", entityType: "LOCAL_MASTER_CREDENTIAL",
      entityIdHash: throttleKey, requestId: input.requestId,
    } })
  })

  return {
    id: credential!.user.id,
    dbId: credential!.user.id,
    name: credential!.user.name,
    email: credential!.user.email,
    role: "MASTER_ADMIN",
    authSource: MASTER_AUTH_SOURCE,
    isZohoUser: false,
    mustRotatePassword: false,
    credentialVersion: credential!.passwordVersion,
  }
}

export async function isMasterAdminSession(session: unknown, database: Pick<PrismaClient, "localMasterCredential">): Promise<boolean> {
  const user = (session as { user?: { role?: unknown; authSource?: unknown; mustRotatePassword?: unknown } } | null)?.user
  const claimsValid = user?.role === "MASTER_ADMIN"
    && user.authSource === MASTER_AUTH_SOURCE
    && user.mustRotatePassword !== true
  if (!claimsValid) return false
  const sessionUser = user as typeof user & { dbId?: unknown; id?: unknown; credentialVersion?: unknown }
  const userId = typeof sessionUser.dbId === "string" ? sessionUser.dbId : typeof sessionUser.id === "string" ? sessionUser.id : ""
  if (!userId || typeof sessionUser.credentialVersion !== "number") return false
  const credential = await database.localMasterCredential.findUnique({
    where: { userId },
    select: { active: true, revokedAt: true, mustRotatePassword: true, passwordVersion: true },
  })
  return Boolean(credential?.active && !credential.revokedAt && !credential.mustRotatePassword && credential.passwordVersion === sessionUser.credentialVersion)
}
