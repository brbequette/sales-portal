import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"
import { FLYER_CAMPAIGN_TYPES } from "@/lib/flyer-studio-config"

const CHANNELS = new Set<string>(FLYER_CAMPAIGN_TYPES.map((channel) => channel.id))

export async function POST(request: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  try {
    const { campaignId, name, channel, content, imageUrl } = await request.json()
    const normalizedChannel = String(channel || "SMS").toUpperCase()
    if (!CHANNELS.has(normalizedChannel)) return NextResponse.json({ error: "Unsupported campaign channel" }, { status: 400 })
    if (!name?.trim() || !content?.trim() || !imageUrl?.startsWith("data:image/")) {
      return NextResponse.json({ error: "Campaign name, copy, and generated flyer are required" }, { status: 400 })
    }
    if (imageUrl.length > 7_500_000) return NextResponse.json({ error: "Flyer image is too large to save" }, { status: 413 })

    const campaign = campaignId
      ? await prisma.campaignTemplate.update({
          where: { id: campaignId },
          data: { name: name.trim(), channel: normalizedChannel, content: content.trim(), imageUrl },
        })
      : await prisma.campaignTemplate.create({
          data: { name: name.trim(), channel: normalizedChannel, content: content.trim(), imageUrl },
        })
    return NextResponse.json({ success: true, campaign })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save campaign" }, { status: 500 })
  }
}
