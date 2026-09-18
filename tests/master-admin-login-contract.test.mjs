import assert from 'node:assert/strict'
import fs from 'node:fs'

const masterPage = fs.readFileSync('src/app/(public)/master-admin-login/page.tsx', 'utf8')
const adminPage = fs.readFileSync('src/app/(public)/admin-login/page.tsx', 'utf8')
const auth = fs.readFileSync('src/lib/auth.ts', 'utf8')
const proxy = fs.readFileSync('src/proxy.ts', 'utf8')

assert.match(masterPage, /signIn\("master-admin"/)
assert.match(masterPage, /Unable to authenticate account\./)
assert.doesNotMatch(masterPage, /account not found|wrong password|unknown user/i)
assert.doesNotMatch(adminPage, /signIn\("credentials"|type="password"/)
assert.match(adminPage, /signin\/zoho/)
assert.match(proxy, /'\/master-admin-login'/)
assert.match(auth, /__Secure-next-auth\.session-token/)
assert.match(auth, /httpOnly: true/)
assert.match(auth, /secure: isProd/)
assert.doesNotMatch(auth, /token\.authSource\s*=\s*(?:session|credentials)/)

console.log('MASTER_ADMIN_SEPARATE_LOGIN=PASS')
console.log('MASTER_ADMIN_SECURE_SESSION=PASS')
console.log('MASTER_ADMIN_GENERIC_ERRORS=PASS')
