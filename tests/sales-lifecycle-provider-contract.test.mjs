import assert from 'node:assert/strict'
import fs from 'node:fs'

const books = fs.readFileSync('src/lib/zoho-books-customer.ts', 'utf8')
const transaction = fs.readFileSync('netlify/functions/create-transaction.ts', 'utf8')
const legacyBooksRoute = fs.readFileSync('netlify/functions/create-books-contact.ts', 'utf8')
const orderBuilder = fs.readFileSync('src/components/useOrderBuilderData.ts', 'utf8')

assert.match(books, /books:customer:create:/, 'Books customer creation must use a durable operation key')
assert.match(books, /state === 'AMBIGUOUS'/, 'ambiguous Books creates must stop before resubmission')
assert.match(books, /zcrm_account_id=.*crmAccountId/, 'Books reconciliation must use an exact CRM link')
assert.doesNotMatch(books, /contact_name=.*encodeURIComponent/, 'Books reconciliation must not match solely by company name')
assert.match(transaction, /ensureBooksCustomer\(account\.id\)/, 'financial document creation must use the durable Books customer resolver')
assert.doesNotMatch(transaction, /searchByName/, 'financial document creation must not retain name-only customer matching')
assert.match(transaction, /books:\$\{endpoint\}:create:\$\{requestId\}/, 'financial document creation must use a caller-stable operation key')
assert.match(transaction, /state === "AMBIGUOUS" \|\| operation\.state === "SYNCING"/, 'in-flight and ambiguous document writes must not be resubmitted')
assert.match(transaction, /Provider accepted; local persistence is pending/, 'provider acceptance must be durably recorded before local document persistence')
assert.match(legacyBooksRoute, /ensureBooksCustomer\(account\.id\)/, 'the direct Books customer route must use the shared resolver')
assert.match(orderBuilder, /itemId: i\.itemId \|\| null/, 'order submission must preserve catalog Books item IDs')

console.log('sales lifecycle provider contract: PASS')
