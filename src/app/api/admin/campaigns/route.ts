import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdministrator } from '@/lib/auth-helpers'

const CHANNELS = new Set(['SMS', 'EMAIL', 'POSTAL', 'VOICE', 'PHONE'])

export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  try {
    const templates = await prisma.campaignTemplate.findMany({
      orderBy: { createdAt: 'desc' }
    })
    const blasts = await prisma.campaignBlast.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { name: true } },
        logs: {
          include: {
            account: { select: { name: true } }
          }
        }
      }
    })
    return NextResponse.json({ success: true, templates, blasts })
  } catch (error: any) {
    console.error("Error fetching campaigns:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  try {
    const body = await req.json()
    const { name, content, imageUrl, channel } = body
    const normalizedName = String(name || '').trim()
    const normalizedContent = String(content || '').trim()
    const normalizedChannel = String(channel || 'SMS').trim().toUpperCase()
    if (!normalizedName || !normalizedContent) return NextResponse.json({ success: false, error: 'Name and content are required' }, { status: 400 })
    if (!CHANNELS.has(normalizedChannel)) return NextResponse.json({ success: false, error: 'Unsupported campaign channel' }, { status: 400 })
    if (imageUrl && !String(imageUrl).startsWith('data:image/') && !/^https:\/\//i.test(String(imageUrl))) {
      return NextResponse.json({ success: false, error: 'Campaign image must use HTTPS or an embedded image' }, { status: 400 })
    }

    const template = await prisma.campaignTemplate.create({
      data: { name: normalizedName, content: normalizedContent, imageUrl: imageUrl ? String(imageUrl).trim() : null, channel: normalizedChannel }
    })

    return NextResponse.json({ success: true, template })
  } catch (error: any) {
    console.error("Error creating template:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ success: false, error: "Missing ID" }, { status: 400 })

    await prisma.campaignTemplate.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting template:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
