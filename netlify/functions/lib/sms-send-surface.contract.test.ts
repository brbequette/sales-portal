import fs from "node:fs"; import path from "node:path"; import { describe, expect, it } from "vitest"
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8")
describe("SMS send surfaces", () => {
  const guarded = ["netlify/functions/lib/campaign-worker.ts","netlify/functions/campaign-job-test-send.ts","netlify/functions/process-scheduled-messages.ts","netlify/functions/send-sms.ts","netlify/functions/zoho-voice.ts","src/app/api/messages/[accountId]/route.ts","src/app/api/auth/magic-link/route.ts"]
  const voiceAuthenticated = [...guarded, "netlify/functions/campaign-job-create.ts", "src/app/api/sync-zoho-sms/route.ts", "src/app/api/admin/communications/sync-voice/route.ts"]
  it.each(guarded)("uses the shared guard: %s", file => expect(read(file)).toContain("guardSmsSend"))
  it.each(voiceAuthenticated)("uses isolated Zoho Voice OAuth: %s", file => expect(read(file)).toContain("getZohoVoiceAccessToken"))
  it("retires legacy direct bulk sending", () => { const source = read("netlify/functions/send-campaign.ts"); expect(source).toContain("410"); expect(source).not.toContain("/sms/send") })
  it("documents every discovered runtime surface", () => { const inventory = read("docs/sms-send-surface-inventory.md"); for (const label of ["campaign-worker", "process-scheduled-messages", "campaign-job/test-send", "send-sms", "/api/messages/[accountId]", "zoho-voice", "magic-link OTP"]) expect(inventory).toContain(label) })
})
