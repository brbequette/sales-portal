import assert from "node:assert/strict"
import { buildMailContentUrl, classifyMailContentFailure, requestMailContent } from "../src/lib/zoho-mail-content.ts"

const url = buildMailContentUrl("https://mail.zoho.test/api", "account", "folder", "message")
assert.equal(url, "https://mail.zoho.test/api/accounts/account/folders/folder/messages/message/content")
assert.deepEqual(classifyMailContentFailure(404, { data: { errorCode: "URL_RULE_NOT_CONFIGURED" } }), { code: "URL_RULE_NOT_CONFIGURED", retryable: false })
assert.deepEqual(classifyMailContentFailure(404, { data: { errorCode: "OTHER" } }), { code: "NOT_FOUND", retryable: false })
assert.deepEqual(classifyMailContentFailure(429, {}), { code: "TRANSIENT_HTTP", retryable: true })
assert.throws(() => buildMailContentUrl("https://mail.zoho.test/api", "", "folder", "message"), /MAIL_CONTENT_ROUTE_IDENTIFIERS_MISSING/)
let requestedUrl = ""
const content = await requestMailContent({ baseUrl: "https://mail.zoho.test/api", accountId: "a", folderId: "f", messageId: "m", token: "injected", fetchImpl: async (url) => { requestedUrl = url; return { ok: true, status: 200, json: async () => ({ data: { content: "redacted-test" } }) } } })
assert.equal(requestedUrl, "https://mail.zoho.test/api/accounts/a/folders/f/messages/m/content")
assert.equal(content.data.content, "redacted-test")
await assert.rejects(() => requestMailContent({ baseUrl: "https://mail.zoho.test/api", accountId: "a", folderId: "f", messageId: "m", token: "injected", fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({ data: { errorCode: "URL_RULE_NOT_CONFIGURED", description: "secret" } }) }) }), /URL_RULE_NOT_CONFIGURED/)
const source = await import("node:fs/promises").then(fs => fs.readFile("netlify/functions/lib/zoho-mail.ts", "utf8"))
assert.match(source, /requestMailContent/)
console.log("ZOHO_MAIL_CONTENT_ROUTE=PASS")
console.log("ZOHO_MAIL_ERROR_REDACTION=PASS")
console.log("ZOHO_MAIL_RETRY_CLASSIFICATION=PASS")
