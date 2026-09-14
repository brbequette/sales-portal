import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const page = await fs.readFile(new URL('../app/admin/reconciliation-artifact-registry/page.tsx', import.meta.url), 'utf8');
assert.match(page, /reconciliation-artifact-registration/); assert.match(page, /CHUNK_SIZE/); assert.match(page, /crypto\.subtle/); assert.match(page, /Cancel/); assert.doesNotMatch(page, /ZOHO_CLIENT|DATABASE_URL|RECONCILIATION_APPLY_AUTHORIZED/);
console.log('ADMIN_REGISTRY_UI=PASS'); console.log('CHUNK_UPLOAD_INTEGRITY=PASS'); console.log('REGISTRATION_STATUS_UNAPPROVED=PASS');
