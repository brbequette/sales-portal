import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"
import { guardSmsSend } from "@/lib/sms-suppression"

export async function POST(req: Request) {
  const auth = await requireAdministrator(); if (auth.errorResponse) return auth.errorResponse
  const { phone, traffic = "TEST" } = await req.json()
  const decision = await guardSmsSend({ phone: String(phone || ""), traffic })
  return NextResponse.json({ success: true, ...decision }, { headers: { "Cache-Control": "no-store" } })
}
