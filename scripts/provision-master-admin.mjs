import { pathToFileURL } from 'node:url'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

export const PROVISION_MODES = Object.freeze({ CREATE: 'create', REPLACE_REVOKED: 'replace-revoked' })

const SAFE_ERRORS = new Set([
  'PASSWORD_INPUT_UNAVAILABLE', 'INVALID_PROVISIONING_INPUT', 'PASSWORD_TOO_SHORT',
  'PASSWORD_POLICY_FAILED', 'PASSWORD_MISMATCH', 'INVALID_PROVISIONING_MODE',
  'TARGET_IDENTITY_NOT_FOUND', 'TARGET_IDENTITY_AMBIGUOUS', 'TARGET_EMAIL_MISMATCH',
  'TARGET_IDENTITY_MISMATCH',
  'UNDERLYING_USER_NOT_ADMINISTRATOR', 'ACTIVE_MASTER_CREDENTIAL_EXISTS',
  'REVOKED_MASTER_CREDENTIAL_EXISTS_EXPLICIT_REPLACE_REQUIRED',
  'REPLACE_REVOKED_REQUIRES_REVOKED_CREDENTIAL',
])

function strong(value) {
  return typeof value === 'string' && value.length >= 14 && /[a-z]/.test(value)
    && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value)
}

function parseArguments(argv) {
  const values = { loginIdentifier: '', expectedUserId: '', mode: PROVISION_MODES.CREATE }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--login-identifier') values.loginIdentifier = String(argv[++index] || '')
    else if (argv[index] === '--expected-user-id') values.expectedUserId = String(argv[++index] || '')
    else if (argv[index] === '--mode') values.mode = String(argv[++index] || '')
    else throw new Error('INVALID_PROVISIONING_INPUT')
  }
  values.loginIdentifier = values.loginIdentifier.trim().toLowerCase()
  if (!values.loginIdentifier || !values.expectedUserId) throw new Error('INVALID_PROVISIONING_INPUT')
  if (!Object.values(PROVISION_MODES).includes(values.mode)) throw new Error('INVALID_PROVISIONING_MODE')
  return values
}

async function readSecretLines(stream) {
  if (stream.isTTY) throw new Error('PASSWORD_INPUT_UNAVAILABLE')
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const input = Buffer.concat(chunks).toString('utf8')
  for (const chunk of chunks) chunk.fill(0)
  const lines = input.split(/\r?\n/)
  return { password: lines[0] || '', confirmation: lines[1] || '' }
}

export async function preflightMasterAdmin(database, { loginIdentifier, expectedUserId, mode = PROVISION_MODES.CREATE }) {
  const normalized = loginIdentifier.trim().toLowerCase()
  if (!normalized) throw new Error('INVALID_PROVISIONING_INPUT')
  if (!Object.values(PROVISION_MODES).includes(mode)) throw new Error('INVALID_PROVISIONING_MODE')
  const users = await database.user.findMany({
    where: { email: { equals: normalized, mode: 'insensitive' } },
    select: { id: true, email: true, name: true, role: true, authType: true },
    take: 2,
  })
  if (users.length === 0) throw new Error('TARGET_IDENTITY_NOT_FOUND')
  if (users.length !== 1) throw new Error('TARGET_IDENTITY_AMBIGUOUS')
  const user = users[0]
  if (!expectedUserId || user.id !== expectedUserId) throw new Error('TARGET_IDENTITY_MISMATCH')
  if (user.email.trim().toLowerCase() !== normalized) throw new Error('TARGET_EMAIL_MISMATCH')
  if (!['admin', 'administrator'].includes(user.role.trim().toLowerCase())) throw new Error('UNDERLYING_USER_NOT_ADMINISTRATOR')
  const credential = await database.localMasterCredential.findUnique({
    where: { userId: user.id }, select: { id: true, active: true, revokedAt: true },
  })
  if (credential?.active && !credential.revokedAt) throw new Error('ACTIVE_MASTER_CREDENTIAL_EXISTS')
  if (credential && mode === PROVISION_MODES.CREATE) throw new Error('REVOKED_MASTER_CREDENTIAL_EXISTS_EXPLICIT_REPLACE_REQUIRED')
  if (!credential && mode === PROVISION_MODES.REPLACE_REVOKED) throw new Error('REPLACE_REVOKED_REQUIRES_REVOKED_CREDENTIAL')
  return { user, credential, mode }
}

export async function provisionMasterAdmin(database, { loginIdentifier, expectedUserId, password, confirmation, mode = PROVISION_MODES.CREATE }) {
  if (!strong(password)) throw new Error(typeof password !== 'string' || password.length < 14 ? 'PASSWORD_TOO_SHORT' : 'PASSWORD_POLICY_FAILED')
  if (password !== confirmation) throw new Error('PASSWORD_MISMATCH')
  const passwordHash = await bcrypt.hash(password, 12)
  return database.$transaction(async tx => {
    const target = await preflightMasterAdmin(tx, { loginIdentifier, expectedUserId, mode })
    const credential = mode === PROVISION_MODES.CREATE
      ? await tx.localMasterCredential.create({ data: {
          userId: target.user.id, loginIdentifier: loginIdentifier.trim().toLowerCase(),
          passwordHash, mustRotatePassword: true,
        }, select: { id: true } })
      : await tx.localMasterCredential.update({
          where: { id: target.credential.id },
          data: {
            passwordHash, active: true, mustRotatePassword: true, failedLoginCount: 0,
            lockedUntil: null, passwordVersion: { increment: 1 }, rotatedAt: null, revokedAt: null,
          },
          select: { id: true },
        })
    await tx.authAuditEvent.create({ data: {
      eventType: mode === PROVISION_MODES.CREATE ? 'LOCAL_MASTER_CREDENTIAL_PROVISIONED' : 'LOCAL_MASTER_CREDENTIAL_REPLACED',
      actorUserId: target.user.id, reasonCode: 'EXPLICIT_OPERATOR_COMMAND',
      entityType: 'LOCAL_MASTER_CREDENTIAL', changedFields: { mustRotatePassword: true, active: true, mode },
    } })
    return { credentialId: credential.id }
  })
}

async function main() {
  let prisma
  let secrets
  try {
    const options = parseArguments(process.argv.slice(2))
    const dryRun = process.env.NODE_ENV === 'test' && process.env.MASTER_ADMIN_DRY_RUN === '1'
    if (!dryRun && process.env.MASTER_ADMIN_SECURE_STDIN !== '1') throw new Error('PASSWORD_INPUT_UNAVAILABLE')
    secrets = await readSecretLines(process.stdin)
    if (dryRun) {
      if (!strong(secrets.password)) throw new Error(secrets.password.length < 14 ? 'PASSWORD_TOO_SHORT' : 'PASSWORD_POLICY_FAILED')
      if (secrets.password !== secrets.confirmation) throw new Error('PASSWORD_MISMATCH')
      console.log('MASTER_ADMIN_VALIDATION=PASS')
      return
    }
    prisma = new PrismaClient()
    await provisionMasterAdmin(prisma, { ...options, ...secrets })
    console.log('MASTER_ADMIN_PROVISIONED=PASS')
  } catch (error) {
    const category = error instanceof Error ? error.message : 'PROVISIONING_FAILED'
    console.error(SAFE_ERRORS.has(category) ? category : 'PROVISIONING_FAILED')
    process.exitCode = 1
  } finally {
    if (secrets) { secrets.password = ''; secrets.confirmation = ''; secrets = null }
    if (prisma) await prisma.$disconnect().catch(() => undefined)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main()
