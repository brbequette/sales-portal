import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

/**
 * GET /api/admin/holidays
 * Returns stored company holidays as { holidays: string[] } (YYYY-MM-DD)
 *
 * POST /api/admin/holidays
 * Body: { holidays: string[] }
 * Saves the full list of company holidays.
 */

export async function GET() {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const setting = await prisma.systemSetting.findUnique({ where: { key: "company_holidays" } })
    const holidays: string[] = setting ? JSON.parse(setting.value) : []
    return NextResponse.json({ success: true, holidays })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const { holidays } = await req.json()
    if (!Array.isArray(holidays)) {
      return NextResponse.json({ success: false, error: "holidays must be an array of YYYY-MM-DD strings" }, { status: 400 })
    }
    // Deduplicate + sort
    const cleaned = Array.from(new Set(holidays)).sort()
    await prisma.systemSetting.upsert({
      where:  { key: "company_holidays" },
      create: { key: "company_holidays", value: JSON.stringify(cleaned) },
      update: { value: JSON.stringify(cleaned) }
    })
    return NextResponse.json({ success: true, holidays: cleaned, count: cleaned.length })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
