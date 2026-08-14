import { NextResponse } from 'next/server'
import { getBusinessDefaults, clearBusinessDefaultsCache } from '@/lib/business-defaults'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const defaults = await getBusinessDefaults()
    return NextResponse.json({ success: true, defaults })
  } catch (error) {
    console.error('Failed to get business defaults:', error)
    return NextResponse.json({ success: false, error: 'Failed to get business defaults' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    // Basic auth check would go here if not handled by middleware
    // We'll proceed with the update
    const body = await request.json()
    
    // Update or create SystemSetting
    await prisma.systemSetting.upsert({
      where: { key: 'business_defaults_config' },
      update: { businessDefaults: body },
      create: { key: 'business_defaults_config', value: 'custom', businessDefaults: body }
    })
    
    clearBusinessDefaultsCache()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update business defaults:', error)
    return NextResponse.json({ success: false, error: 'Failed to update business defaults' }, { status: 500 })
  }
}
