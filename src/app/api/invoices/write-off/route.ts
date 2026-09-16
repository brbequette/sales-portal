import { NextResponse } from "next/server"

// Direct write-offs bypassed dry-run, idempotency, independent approval, and the
// immutable commission ledger. All new write-offs must use the recovery workflow.
export async function POST() {
  return NextResponse.json({
    error: "Direct write-off is disabled. Create and independently approve a WriteOffRecoveryCase.",
    recoveryEndpoint: "/api/write-off-recovery",
  }, {
    status: 409,
    headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
  })
}
