import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const stages = await prisma.salesStage.findMany({
      orderBy: { order: 'asc' }
    })
    return NextResponse.json({ success: true, stages })
  } catch (error: any) {
    console.error('Fetch Sales Stages Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, color, description, order, autoActions, notifications, transitionRule, flowConfig } = body

    if (!name) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    // If no order specified, put it at the end
    let stageOrder = order
    if (stageOrder === undefined || stageOrder === null) {
      const maxStage = await prisma.salesStage.findFirst({
        orderBy: { order: 'desc' }
      })
      stageOrder = (maxStage?.order ?? 0) + 1
    }

    const stage = await prisma.salesStage.create({
      data: {
        name,
        slug,
        color: color || '#6b7280',
        description: description || null,
        order: stageOrder,
        autoActions: autoActions || null,
        notifications: notifications || null,
        transitionRule: transitionRule || null,
        flowConfig: flowConfig || null,
      }
    })

    return NextResponse.json({ success: true, stage })
  } catch (error: any) {
    console.error('Create Sales Stage Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const { id, name, color, description, order, autoActions, notifications, transitionRule, flowConfig, isActive } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'Stage ID is required' }, { status: 400 })
    }

    const updateData: any = {}
    if (name !== undefined) {
      updateData.name = name
      updateData.slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
    }
    if (color !== undefined) updateData.color = color
    if (description !== undefined) updateData.description = description
    if (order !== undefined) updateData.order = order
    if (autoActions !== undefined) updateData.autoActions = autoActions
    if (notifications !== undefined) updateData.notifications = notifications
    if (transitionRule !== undefined) updateData.transitionRule = transitionRule
    if (flowConfig !== undefined) updateData.flowConfig = flowConfig
    if (isActive !== undefined) updateData.isActive = isActive

    const existingStage = await prisma.salesStage.findFirst({
      where: { OR: [{ id }, { slug: id }] }
    })

    if (!existingStage) {
      return NextResponse.json({ success: false, error: `Stage '${id}' not found` }, { status: 404 })
    }

    const stage = await prisma.salesStage.update({
      where: { id: existingStage.id },
      data: updateData
    })

    return NextResponse.json({ success: true, stage })
  } catch (error: any) {
    console.error('Update Sales Stage Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'Stage ID is required' }, { status: 400 })
    }

    // Prevent deleting default stages
    const stage = await prisma.salesStage.findUnique({ where: { id } })
    if (!stage) {
      return NextResponse.json({ success: false, error: 'Stage not found' }, { status: 404 })
    }
    if (stage.isDefault) {
      return NextResponse.json({ success: false, error: 'Cannot delete a default stage' }, { status: 403 })
    }

    await prisma.salesStage.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete Sales Stage Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
