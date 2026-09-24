import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8")

describe("admin control-center navigation", () => {
  it("exposes the business, health and advanced workspaces", () => {
    const layout = read("src/components/AdminLayout.tsx")
    for (const route of ["company-settings", "sales-configuration", "compensation-center", "automation-ai", "communications-center", "products-data", "integrations", "operations-center", "system-health", "advanced"]) {
      expect(layout).toContain(`/admin/${route}`)
    }
  })

  it("keeps dangerous maintenance out of primary navigation", () => {
    const layout = read("src/components/AdminLayout.tsx")
    expect(layout).not.toContain('href: "/admin/books-scripts"')
    const advanced = read("src/app/admin/advanced/page.tsx")
    expect(advanced).toContain('/admin/books-scripts')
    expect(advanced).toContain('warning')
  })

  it("preserves superseded workspace URLs as redirects", () => {
    expect(read("src/app/admin/data-integrations/page.tsx")).toContain('redirect("/admin/integrations")')
    expect(read("src/app/admin/people-time/page.tsx")).toContain('redirect("/admin/company-settings")')
    expect(read("src/app/admin/backfill/page.tsx")).toContain('redirect("/admin/books-scripts")')
    expect(read("src/app/admin/geofences/page.tsx")).toContain('redirect("/admin/timeclock?tab=geofences")')
  })

  it("retains admin authorization and responsive navigation", () => {
    const layout = read("src/components/AdminLayout.tsx")
    expect(layout).toContain("isAdminRole")
    expect(layout).toContain("Access Denied")
    expect(layout).toContain("md:hidden")
    expect(layout).toContain("hidden md:flex")
  })
})
