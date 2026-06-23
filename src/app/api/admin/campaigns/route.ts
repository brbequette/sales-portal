import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET() {
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
  try {
    const body = await req.json()
    const { name, content, imageUrl, channel } = body

    const template = await prisma.campaignTemplate.create({
      data: { name, content, imageUrl, channel }
    })

    return NextResponse.json({ success: true, template })
  } catch (error: any) {
    console.error("Error creating template:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
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
