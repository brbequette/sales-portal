import fs from "node:fs"; import path from "node:path"; import { describe, expect, it } from "vitest"
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8")
describe("campaign recovery UI", () => {
  it("shows full campaign suppression confirmation counts", () => { const page = read("src/app/sales/page.tsx"); for (const label of ["Original:", "Excluded:", "Protected:", "Technical:", "Sendable:"]) expect(page).toContain(label); expect(page).toContain("Confirm exact sendable recipients") })
  it("shows Canary suppression before enabling exact send", () => { const panel = read("src/components/MmsCanaryPanel.tsx"); expect(panel).toContain("Suppression preflight:"); expect(panel).toContain("!suppression?.allowed") })
  it("has outcome filtering, JSON export, quarantine warning and only per-recipient ambiguity review", () => { const panel = read("src/components/CampaignRecoveryPanel.tsx"); expect(panel).toContain("Recipient review queue"); expect(panel).toContain("JSON export"); expect(panel).toContain("LEGACY_QUARANTINED"); expect(panel).toContain("retryAmbiguous(row.campaignJobId"); expect(panel).not.toContain("retry-all") })
  it("renders number-specific disposition badges", () => { const contacts = read("src/components/ContactsView.tsx"); const badge = read("src/components/PhoneDeliverabilityBadge.tsx"); expect(contacts).toContain("PhoneDeliverabilityBadge"); expect(badge).toContain("suppressionReason"); expect(badge).toContain("providerCode"); expect(badge).toContain("lastCheckedAt") })
})
