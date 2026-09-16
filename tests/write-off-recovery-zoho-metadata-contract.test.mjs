import assert from 'node:assert/strict'
import fs from 'node:fs'

const manifest = JSON.parse(fs.readFileSync('docs/write-off-recovery-zoho-metadata-2026-09-16.json', 'utf8'))

assert.equal(manifest.mode, 'read-only')
assert.equal(manifest.zohoSyncEnabled, false)
assert.deepEqual(manifest.verifiedTrigger, {
  module: 'invoice',
  visibleLabel: 'Written Off?',
  apiName: 'cf_written_off',
  dataType: 'check_box',
  active: true,
  searchable: true,
  allowedValues: [false, true],
  maxLength: null,
  precision: null,
  booksApiMetadata: true,
  webhookPayload: 'UNVERIFIED',
  fieldHistory: 'UNVERIFIED',
  alreadyExists: true,
})
assert.equal(manifest.minimalProposedFields.length, 2)
for (const field of manifest.minimalProposedFields) {
  assert.equal(field.apiName, null)
  assert.equal(field.status, 'UNVERIFIED')
}
assert.ok(manifest.applicationOnlyFields.includes('Last Recovery Calculation Hash'))
assert.ok(manifest.applicationOnlyFields.includes('Original Responsibility Rate'))

console.log('ZOHO_METADATA_CONTRACT=PASS')
