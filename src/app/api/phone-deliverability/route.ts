import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { normalizeSmsPhone } from "@/lib/sms-suppression"
export async function GET(req: Request) { const session = await getServerSession(authOptions); if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const phone = normalizeSmsPhone(new URL(req.url).searchParams.get("phone") || ""); if (!phone) return NextResponse.json({ record: null }); const record = await prisma.phoneDeliverability.findUnique({ where: { normalizedPhone_channel: { normalizedPhone: phone, channel: "SMS" } }, select: { deliverabilityStatus: true, suppressionStatus: true, suppressionReason: true, providerCode: true, lastCheckedAt: true } }); return NextResponse.json({ record }, { headers: { "Cache-Control": "no-store" } }) }
