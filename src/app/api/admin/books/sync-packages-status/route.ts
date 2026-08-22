import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

/**
 * GET /api/admin/books/sync-packages-status
 *
 * Returns the current status of the background package sync.
 * Used by the Shipping Center to poll after clicking "Sync from Zoho".
 *
 * Reads from SystemSetting rows written by the background function:
 *   last_package_sync_status      → "idle" | "running" | "done" | "error"
 *   last_package_sync_result      → human-readable result string
 *   last_package_sync_started_at  → ISO timestamp
 *   last_package_sync_finished_at → ISO timestamp
 */
export async function GET() {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const keys = [
      "last_package_sync_status",
      "last_package_sync_result",
      "last_package_sync_started_at",
      "last_package_sync_finished_at",
    ]

    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: keys } },
    })

    const map: Record<string, string> = {}
    for (const row of rows) map[row.key] = row.value

    return NextResponse.json({
      status:      map["last_package_sync_status"]      ?? "idle",
      result:      map["last_package_sync_result"]      ?? null,
      startedAt:   map["last_package_sync_started_at"]  ?? null,
      finishedAt:  map["last_package_sync_finished_at"] ?? null,
    })
  } catch (err: any) {
    return NextResponse.json({ status: "error", result: err.message }, { status: 500 })
  }
}
