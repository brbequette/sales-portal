import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../../');
const auth = fs.readFileSync(path.join(root, 'netlify/functions/lib/zoho-auth.ts'), 'utf8');
const callers = fs.readFileSync(path.join(root, 'netlify/functions/lib/zoho-auth.ts'), 'utf8');
assert.match(auth, /export async function getZohoAccessToken\(forceRefresh = false\): Promise<string>/);
assert.match(auth, /export const ZOHO_DC/);
assert.match(auth, /export const ZOHO_ORGANIZATION_ID/);
assert.match(auth, /return provider\.getToken\(forceRefresh\)/);
assert.match(auth, /systemSetting\.findUnique/);
assert.match(auth, /systemSetting\.upsert/);
const imports = [];
function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f=path.join(dir,e.name); if(e.isDirectory()&&!['node_modules','.next','.git'].includes(e.name)) walk(f); else if(e.isFile()&&/\.(ts|tsx)$/.test(e.name)){const t=fs.readFileSync(f,'utf8'); if(t.includes('zoho-auth')) imports.push(f);}} }
walk(path.join(root, 'netlify')); assert.ok(imports.length > 0);
console.log('EXISTING_APP_AUTH_CHARACTERIZATION=PASS');
console.log('EXISTING_APP_AUTH_COMPATIBILITY=PASS');
