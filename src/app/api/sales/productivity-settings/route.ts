import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getSystemSettings } from "@/lib/settings"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const settings = await getSystemSettings()
  return NextResponse.json({ idlePromptMinutes: settings.sales_idle_prompt_minutes })
}
