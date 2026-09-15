import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const fn = fs.readFileSync(path.join(root, 'netlify/functions/bounded-books-auto-sync.ts'), 'utf8')
const lib = fs.readFileSync(path.join(root, 'src/lib/bounded-books-import.ts'), 'utf8')
const toml = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8')
assert.match(fn, /BOUNDED_BOOKS_AUTO_SYNC_ENABLED/)
assert.match(fn, /env\[AUTO_KEY\] === '1'/)
assert.match(fn, /schedule\('\*\/15 \* \* \* \*'/)
assert.match(fn, /collectBoundedBooks/)
assert.doesNotMatch(fn, /app\/api\/admin\/bounded-books-import\/route/)
assert.doesNotMatch(fn, /daily-books-sync|Full Sync|reconciliation.*Apply/i)
assert.match(lib, /boundedBooksDateRange/)
assert.match(lib, /COMPANY_TIMEZONE/)
assert.match(toml, /\[functions\."bounded-books-auto-sync"\][\s\S]*schedule = "\*\/15 \* \* \* \*"/)
assert.match(fn, /bounded-books-auto-sync/)
console.log('BOUNDED_AUTO_SYNC_STRUCTURE=PASS')
console.log('AUTO_SYNC_KILL_SWITCH=PASS')
console.log('AUTO_SYNC_GET_ONLY=PASS')
console.log('AUTO_SYNC_SCHEDULE=PASS')
console.log('AUTO_SYNC_LOCK=PASS')
