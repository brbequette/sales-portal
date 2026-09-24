import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("shared sales workspace navigation", () => {
  const nav = readFileSync("src/components/SalesWorkspaceNav.tsx", "utf8")

  it("keeps one consistent Today, Accounts & Deals, and Leads path", () => {
    expect(nav).toContain('href: "/sales/todays-calls"')
    expect(nav).toContain('label: "Today"')
    expect(nav).toContain('href: "/sales"')
    expect(nav).toContain('label: "Accounts & Deals"')
    expect(nav).toContain('href: "/sales/leads-calling"')
    expect(nav).toContain('label: "Leads"')
    expect(nav).toContain('aria-current={active ? "page" : undefined}')
  })

  it("is reused by every top-level sales workspace", () => {
    for (const page of ["src/app/sales/page.tsx", "src/app/sales/todays-calls/page.tsx", "src/app/sales/leads-calling/page.tsx"]) {
      expect(readFileSync(page, "utf8")).toContain("<SalesWorkspaceNav />")
    }
  })
})
