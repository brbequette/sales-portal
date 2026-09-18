import { PrismaClient } from '@prisma/client'
import { preflightMasterAdmin, PROVISION_MODES } from './provision-master-admin.mjs'

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? String(process.argv[index + 1] || '') : ''
}

const loginIdentifier = option('--login-identifier').trim().toLowerCase()
const expectedUserId = option('--expected-user-id')
const mode = option('--mode') || PROVISION_MODES.CREATE
const prisma = new PrismaClient()
try {
  const result = await preflightMasterAdmin(prisma, { loginIdentifier, expectedUserId, mode })
  console.log(JSON.stringify({
    status: 'PREFLIGHT_PASS', targetIdentityCount: 1, targetUserId: result.user.id,
    targetUser: result.user.name, targetEmail: result.user.email, targetRole: result.user.role,
    targetAuthType: result.user.authType, existingCredentialId: result.credential?.id || null, mode,
  }))
} catch (error) {
  const safe = new Set([
    'INVALID_PROVISIONING_INPUT', 'INVALID_PROVISIONING_MODE', 'TARGET_IDENTITY_NOT_FOUND',
    'TARGET_IDENTITY_AMBIGUOUS', 'TARGET_EMAIL_MISMATCH', 'TARGET_IDENTITY_MISMATCH',
    'UNDERLYING_USER_NOT_ADMINISTRATOR',
    'ACTIVE_MASTER_CREDENTIAL_EXISTS', 'REVOKED_MASTER_CREDENTIAL_EXISTS_EXPLICIT_REPLACE_REQUIRED',
    'REPLACE_REVOKED_REQUIRES_REVOKED_CREDENTIAL',
  ])
  const category = error instanceof Error ? error.message : 'PREFLIGHT_FAILED'
  console.error(safe.has(category) ? category : 'PREFLIGHT_FAILED')
  process.exitCode = 1
} finally {
  await prisma.$disconnect().catch(() => undefined)
}
