import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { readWriteOffRecoveryHealth } from "@/lib/write-off-recovery-health"

export const dynamic = "force-dynamic"

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0")
  return response
}

export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return noStore(auth.errorResponse)

  const health = await readWriteOffRecoveryHealth(prisma)
  return noStore(NextResponse.json(health, { status: health.assertions.schemaReady ? 200 : 503 }))
}
