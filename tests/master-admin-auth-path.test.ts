import bcrypt from "bcryptjs"
import { describe, expect, it, vi } from "vitest"
import {
  authenticateLocalMaster,
  effectiveRoleForAuthSource,
  isMasterAdminSession,
  MASTER_AUTH_SOURCE,
  ZOHO_AUTH_SOURCE,
} from "../src/lib/master-admin-auth"

process.env.NEXTAUTH_SECRET = "test-only-master-auth-hmac-secret"

/* eslint-disable @typescript-eslint/no-explicit-any -- focused in-memory Prisma behavior double */
function databaseFixture(options: { revoked?: boolean; mustRotate?: boolean } = {}) {
  const password = "Valid-Local-Master-Password-9!"
  const credential: any = {
    id: "credential-1", userId: "user-1", loginIdentifier: "ben@titandiamond.net",
    passwordHash: bcrypt.hashSync(password, 4), active: !options.revoked,
    revokedAt: options.revoked ? new Date("2026-09-17T00:00:00Z") : null,
    mustRotatePassword: Boolean(options.mustRotate), failedLoginCount: 0, lockedUntil: null,
    passwordVersion: 2, user: { id: "user-1", email: "ben@titandiamond.net", name: "Ben Bequette" },
  }
  const throttles = new Map<string, any>()
  const audits: any[] = []
  const tx: any = {
    localMasterCredential: { update: vi.fn(async ({ data }: any) => {
      if (typeof data.failedLoginCount === "object") credential.failedLoginCount += data.failedLoginCount.increment
      else if (data.failedLoginCount !== undefined) credential.failedLoginCount = data.failedLoginCount
      for (const key of ["lockedUntil", "lastLoginAt"]) if (data[key] !== undefined) credential[key] = data[key]
      return credential
    }) },
    masterAdminLoginThrottle: { upsert: vi.fn(async ({ where, create, update }: any) => {
      const value = throttles.has(where.key) ? { ...throttles.get(where.key), ...update } : create
      throttles.set(where.key, value)
      return value
    }) },
    authAuditEvent: { create: vi.fn(async ({ data }: any) => { audits.push(data); return data }) },
  }
  const database: any = {
    localMasterCredential: {
      findUnique: vi.fn(async ({ where, select }: any) => {
        if (where.loginIdentifier) return where.loginIdentifier === credential.loginIdentifier ? credential : null
        if (where.userId && select) return where.userId === credential.userId ? credential : null
        return null
      }),
    },
    masterAdminLoginThrottle: { findUnique: vi.fn(async ({ where }: any) => throttles.get(where.key) || null) },
    authAuditEvent: { create: tx.authAuditEvent.create },
    $transaction: vi.fn(async (callback: any) => callback(tx)),
  }
  return { database, credential, throttles, audits, password }
}

describe("local Master Administrator authentication", () => {
  it("keeps Zoho authority Administrator while local master authority is method-derived", () => {
    expect(effectiveRoleForAuthSource("MASTER_ADMIN", ZOHO_AUTH_SOURCE)).toBe("Administrator")
    expect(effectiveRoleForAuthSource("Administrator", MASTER_AUTH_SOURCE)).toBe("MASTER_ADMIN")
  })

  it("authenticates the separate local credential with zero Zoho calls", async () => {
    const state = databaseFixture()
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const identity = await authenticateLocalMaster(state.database, {
      loginIdentifier: "BEN@TITANDIAMOND.NET", password: state.password, clientAddress: "192.0.2.10",
    })
    expect(identity).toMatchObject({ dbId: "user-1", role: "MASTER_ADMIN", authSource: "LOCAL_MASTER", credentialVersion: 2 })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(state.audits.at(-1)).toMatchObject({ eventType: "LOCAL_MASTER_LOGIN_SUCCESS", reasonCode: "CREDENTIAL_VERIFIED" })
    expect(JSON.stringify(state.audits)).not.toContain(state.password)
    fetchSpy.mockRestore()
  })

  it("does not elevate an email match or a Zoho/Administrator session", async () => {
    const state = databaseFixture()
    expect(await isMasterAdminSession({ user: { id: "user-1", dbId: "user-1", role: "Administrator", authSource: "ZOHO", credentialVersion: 2 } }, state.database)).toBe(false)
    expect(await isMasterAdminSession({ user: { id: "user-1", dbId: "user-1", role: "MASTER_ADMIN", authSource: "ZOHO", credentialVersion: 2 } }, state.database)).toBe(false)
    expect(state.database.localMasterCredential.findUnique).not.toHaveBeenCalled()
  })

  it("accepts only a live matching local credential version", async () => {
    const state = databaseFixture()
    const session = { user: { id: "user-1", dbId: "user-1", role: "MASTER_ADMIN", authSource: "LOCAL_MASTER", mustRotatePassword: false, credentialVersion: 2 } }
    expect(await isMasterAdminSession(session, state.database)).toBe(true)
    expect(await isMasterAdminSession({ user: { ...session.user, credentialVersion: 1 } }, state.database)).toBe(false)
    state.credential.active = false
    state.credential.revokedAt = new Date()
    expect(await isMasterAdminSession(session, state.database)).toBe(false)
  })

  it("accepts a rotated password and invalidates the prior credential version", async () => {
    const state = databaseFixture()
    const oldSession = { user: { id: "user-1", dbId: "user-1", role: "MASTER_ADMIN", authSource: "LOCAL_MASTER", mustRotatePassword: false, credentialVersion: 2 } }
    state.credential.passwordHash = bcrypt.hashSync("Rotated-Local-Master-Password-10!", 4)
    state.credential.passwordVersion = 3
    expect(await authenticateLocalMaster(state.database, { loginIdentifier: "ben@titandiamond.net", password: state.password })).toBeNull()
    expect(await authenticateLocalMaster(state.database, { loginIdentifier: "ben@titandiamond.net", password: "Rotated-Local-Master-Password-10!" })).toMatchObject({ credentialVersion: 3 })
    expect(await isMasterAdminSession(oldSession, state.database)).toBe(false)
  })

  it("rejects wrong passwords, applies persistent lockout, and emits sanitized audits", async () => {
    const state = databaseFixture()
    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect(await authenticateLocalMaster(state.database, {
        loginIdentifier: "ben@titandiamond.net", password: `wrong-${attempt}`, clientAddress: "192.0.2.20",
        now: new Date(1_800_000_000_000 + attempt),
      })).toBeNull()
    }
    expect([...state.throttles.values()][0].lockedUntil).toBeInstanceOf(Date)
    expect(state.audits.at(-1).eventType).toBe("LOCAL_MASTER_LOGIN_LOCKOUT")
    expect(JSON.stringify(state.audits)).not.toMatch(/wrong-|192\.0\.2\.20|ben@titandiamond\.net/i)
  })

  it("blocks initial credentials until rotation and rejects revoked credentials", async () => {
    const rotating = databaseFixture({ mustRotate: true })
    expect(await authenticateLocalMaster(rotating.database, { loginIdentifier: "ben@titandiamond.net", password: rotating.password })).toBeNull()
    expect(rotating.audits.at(-1)).toMatchObject({ reasonCode: "ROTATION_REQUIRED" })
    const revoked = databaseFixture({ revoked: true })
    expect(await authenticateLocalMaster(revoked.database, { loginIdentifier: "ben@titandiamond.net", password: revoked.password })).toBeNull()
  })
})
