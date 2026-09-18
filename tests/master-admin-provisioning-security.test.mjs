import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  preflightMasterAdmin,
  provisionMasterAdmin,
  PROVISION_MODES,
} from '../scripts/provision-master-admin.mjs'

const target = {
  id: 'user-1', email: 'ben@example.test', name: 'BEN EXAMPLE', role: 'Administrator', authType: 'ZOHO',
}

function fixture({ users = [target], credential = null, auditFailure = false } = {}) {
  const committed = { credentials: [], audits: [] }
  const database = {
    user: { findMany: async () => users },
    localMasterCredential: { findUnique: async () => credential },
    $transaction: async callback => {
      const staged = { credentials: [], audits: [] }
      const tx = {
        user: database.user,
        localMasterCredential: {
          findUnique: database.localMasterCredential.findUnique,
          create: async ({ data }) => {
            const row = { id: 'credential-new', ...data }
            staged.credentials.push(row)
            return { id: row.id }
          },
          update: async ({ where, data }) => {
            const row = { id: where.id, ...data }
            staged.credentials.push(row)
            return { id: row.id }
          },
        },
        authAuditEvent: { create: async ({ data }) => {
          if (auditFailure) throw new Error('SIMULATED_AUDIT_FAILURE')
          staged.audits.push(data)
        } },
      }
      const result = await callback(tx)
      committed.credentials.push(...staged.credentials)
      committed.audits.push(...staged.audits)
      return result
    },
  }
  return { database, committed }
}

await assert.rejects(
  preflightMasterAdmin(fixture({ users: [target, { ...target, id: 'user-2' }] }).database, {
    loginIdentifier: target.email, expectedUserId: target.id,
  }),
  /TARGET_IDENTITY_AMBIGUOUS/,
)

await assert.rejects(
  preflightMasterAdmin(fixture().database, {
    loginIdentifier: target.email, expectedUserId: 'wrong-user',
  }),
  /TARGET_IDENTITY_MISMATCH/,
)

await assert.rejects(
  preflightMasterAdmin(fixture({ credential: { id: 'active', active: true, revokedAt: null } }).database, {
    loginIdentifier: target.email, expectedUserId: target.id,
  }),
  /ACTIVE_MASTER_CREDENTIAL_EXISTS/,
)

const revoked = { id: 'revoked', active: false, revokedAt: new Date() }
await assert.rejects(
  preflightMasterAdmin(fixture({ credential: revoked }).database, {
    loginIdentifier: target.email, expectedUserId: target.id,
  }),
  /REVOKED_MASTER_CREDENTIAL_EXISTS_EXPLICIT_REPLACE_REQUIRED/,
)
assert.equal((await preflightMasterAdmin(fixture({ credential: revoked }).database, {
  loginIdentifier: target.email, expectedUserId: target.id, mode: PROVISION_MODES.REPLACE_REVOKED,
})).credential.id, 'revoked')

const failed = fixture({ auditFailure: true })
await assert.rejects(
  provisionMasterAdmin(failed.database, {
    loginIdentifier: target.email,
    expectedUserId: target.id,
    password: 'Transaction-Safe-Password-9!',
    confirmation: 'Transaction-Safe-Password-9!',
  }),
  /SIMULATED_AUDIT_FAILURE/,
)
assert.deepEqual(failed.committed, { credentials: [], audits: [] })

const script = fileURLToPath(new URL('../scripts/provision-master-admin.mjs', import.meta.url))
const secret = 'Never-Appear-In-Output-9!'
for (const confirmation of [secret, 'Different-Confirmation-8!']) {
  const result = spawnSync(process.execPath, [script, '--login-identifier', target.email, '--expected-user-id', target.id], {
    input: `${secret}\n${confirmation}\n`, encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', MASTER_ADMIN_DRY_RUN: '1', DATABASE_URL: 'postgresql://test.invalid/test' },
  })
  assert.ok(!result.stdout.includes(secret) && !result.stderr.includes(secret))
  assert.ok(!result.stdout.includes(confirmation) && !result.stderr.includes(confirmation))
}

const unsafeDirect = spawnSync(process.execPath, [script, '--login-identifier', target.email, '--expected-user-id', target.id], {
  input: `${secret}\n${secret}\n`, encoding: 'utf8',
  env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: 'postgresql://test.invalid/test', MASTER_ADMIN_SECURE_STDIN: '' },
})
assert.notEqual(unsafeDirect.status, 0)
assert.match(unsafeDirect.stderr, /PASSWORD_INPUT_UNAVAILABLE/)
assert.ok(!unsafeDirect.stdout.includes(secret) && !unsafeDirect.stderr.includes(secret))

const runner = fs.readFileSync(new URL('../scripts/invoke-master-admin-provisioning.ps1', import.meta.url), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
assert.match(runner, /\[Console\]::ReadKey\(\$true\)/)
assert.match(runner, /SECURE_CONSOLE_INPUT_UNAVAILABLE/)
assert.doesNotMatch(runner, /Read-Host[^\r\n]*-AsSecureString/)
assert.doesNotMatch(runner, /Write-(?:Host|Output)[^\r\n]*['"]?\*|output\.write\(['"]\*['"]\)/i)
assert.match(runner, /ZeroFreeBSTR/)
assert.match(runner, /SetEnvironmentVariable\(\$databaseKey, \$previousDatabaseUrl, 'Process'\)/)
assert.match(runner, /MASTER_ADMIN_SECURE_STDIN/)
assert.doesNotMatch(runner, /C:\\Users\\titan\\Documents\\ChatGPT\\Titan Diamond/)
assert.match(runner, /Test-Path -LiteralPath \$EnvironmentFile -PathType Leaf/)
assert.ok(runner.indexOf('Test-Path -LiteralPath $EnvironmentFile') < runner.indexOf('[Environment]::SetEnvironmentVariable($databaseKey, $databaseUrl'))
assert.ok(runner.indexOf('PRODUCTION_DATABASE_URL_INVALID') < runner.indexOf('& $nodePath $preflightScript'))
assert.doesNotMatch(runner, /ArgumentList\.Add\(\$password|Arguments\s*=.*\$password/)
assert.doesNotMatch(runner, /Write-(?:Host|Output).*\$(?:password|confirmation)/i)
assert.match(packageJson.scripts['auth:provision-master-admin'], /\.codex-tmp\/run-production-master-admin-provisioning\.ps1/)
assert.match(packageJson.scripts['auth:install-master-admin-runner'], /install-production-master-admin-runner\.ps1/)
assert.doesNotMatch(packageJson.scripts['auth:provision-master-admin'], /node\s+scripts\/provision-master-admin/)

const installer = fs.readFileSync(new URL('../scripts/install-production-master-admin-runner.ps1', import.meta.url), 'utf8')
assert.match(installer, /\.codex-tmp/)
assert.match(installer, /run-production-master-admin-provisioning\.ps1/)
assert.match(installer, /Copy-Item -LiteralPath \$source -Destination \$destination -Force/)
assert.match(installer, /Security\.Cryptography\.SHA256/)

const installResult = spawnSync('powershell.exe', [
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
  fileURLToPath(new URL('../scripts/install-production-master-admin-runner.ps1', import.meta.url)),
], { encoding: 'utf8' })
assert.equal(installResult.status, 0)
const generatedRunner = fileURLToPath(new URL('../.codex-tmp/run-production-master-admin-provisioning.ps1', import.meta.url))
const windowsSentinel = 'Windows-E2E-Never-Echo-9!'
const redirectedConsole = spawnSync('powershell.exe', [
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', generatedRunner,
  '-Action', 'SecureInputSelfTest', '-LoginIdentifier', target.email,
  '-ExpectedUserId', target.id, '-EnvironmentFile', 'unused',
], {
  input: `${windowsSentinel}\n${windowsSentinel}\n`, encoding: 'utf8',
  env: { ...process.env, MASTER_ADMIN_SECURE_INPUT_SELF_TEST: '1' },
})
assert.notEqual(redirectedConsole.status, 0)
assert.match(redirectedConsole.stderr, /SECURE_CONSOLE_INPUT_UNAVAILABLE/)
assert.ok(!redirectedConsole.stdout.includes(windowsSentinel) && !redirectedConsole.stderr.includes(windowsSentinel))

const wrapper = fileURLToPath(new URL('../scripts/invoke-master-admin-provisioning.ps1', import.meta.url))
const environmentFixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'master-admin-env-'))
try {
  const missing = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', wrapper,
    '-Action', 'Preflight', '-LoginIdentifier', target.email,
    '-ExpectedUserId', target.id, '-EnvironmentFile', path.join(environmentFixtureDirectory, 'missing.env'),
  ], { encoding: 'utf8' })
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /PRODUCTION_ENVIRONMENT_FILE_NOT_FOUND/)

  const malformedSecret = 'Never-Print-Malformed-Environment-Secret'
  const malformedPath = path.join(environmentFixtureDirectory, 'malformed.env')
  fs.writeFileSync(malformedPath, `DATABASE_URL=${malformedSecret}\n`, { mode: 0o600 })
  const malformed = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', wrapper,
    '-Action', 'Preflight', '-LoginIdentifier', target.email,
    '-ExpectedUserId', target.id, '-EnvironmentFile', malformedPath,
  ], { encoding: 'utf8' })
  assert.notEqual(malformed.status, 0)
  assert.match(malformed.stderr, /PRODUCTION_DATABASE_URL_INVALID/)
  assert.ok(!malformed.stdout.includes(malformedSecret) && !malformed.stderr.includes(malformedSecret))
} finally {
  fs.rmSync(environmentFixtureDirectory, { recursive: true, force: true })
}

console.log('MASTER_ADMIN_EXACT_TARGET_PREFLIGHT=PASS')
console.log('MASTER_ADMIN_TRANSACTION_ROLLBACK=PASS')
console.log('MASTER_ADMIN_REVOKED_REPLACEMENT_GUARD=PASS')
console.log('MASTER_ADMIN_WINDOWS_SECURE_INPUT=PASS')
console.log('MASTER_ADMIN_SECRET_OUTPUT_REDACTION=PASS')
console.log('MASTER_ADMIN_ENVIRONMENT_FILE_FAIL_CLOSED=PASS')
