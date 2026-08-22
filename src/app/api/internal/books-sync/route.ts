import { NextRequest, NextResponse } from "next/server"
import { runBooksSync } from "../../../../../netlify/functions/daily-books-sync"

export const dynamic = "force-dynamic"
export const maxDuration = 300

let activeRun: Promise<unknown> | null = null

export async function POST(req: NextRequest) {
  const clean = (value: string | null | undefined) => value?.trim().replace(/^(["'])(.*)\1$/, "$2") || ""
  const secret = clean(process.env.INTERNAL_SYNC_SECRET || process.env.NEXTAUTH_SECRET)
  const body = await req.json().catch(() => ({}))
  const supplied = clean(typeof body.secret === "string" ? body.secret : "")

  if (!secret || supplied !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const requestedYear = Number(body.fullYear)
  const currentYear = new Date().getUTCFullYear()
  const fullYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= currentYear
    ? requestedYear
    : undefined

  if (activeRun) {
    return NextResponse.json({ accepted: true, alreadyRunning: true }, { status: 202 })
  }

  activeRun = runBooksSync({
    fullYear,
    forceDetails: fullYear ? body.forceDetails !== false : false,
  }).finally(() => {
    activeRun = null
  })

  try {
    const result = await activeRun
    return NextResponse.json({ success: true, result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Books sync failed" },
      { status: 500 },
    )
  }
}
