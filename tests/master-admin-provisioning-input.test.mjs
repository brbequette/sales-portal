import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const script = path.join(process.cwd(), 'scripts', 'provision-master-admin.mjs')
const secret = 'NeverPrintThis-9!'

function run(input) {
  return spawnSync(process.execPath, [script, '--login-identifier', 'master@example.test', '--expected-user-id', 'user-1'], {
    cwd: process.cwd(), input, encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', MASTER_ADMIN_DRY_RUN: '1', DATABASE_URL: 'postgresql://test.invalid/db' },
  })
}

const valid = run(`${secret}\n${secret}\n`)
assert.equal(valid.status, 0)
assert.match(valid.stdout, /MASTER_ADMIN_VALIDATION=PASS/)
assert.ok(!valid.stdout.includes(secret) && !valid.stderr.includes(secret))

const invalid = run(`short\nshort\n`)
assert.notEqual(invalid.status, 0)
assert.match(invalid.stderr, /PASSWORD_TOO_SHORT/)
assert.ok(!invalid.stdout.includes('short') && !invalid.stderr.includes('short'))
console.log('MASTER_ADMIN_PASSWORD_NO_ECHO=PASS')
console.log('MASTER_ADMIN_INVALID_INPUT_REDACTION=PASS')
console.log('MASTER_ADMIN_REJECTED_WRITE_FREE=PASS')
