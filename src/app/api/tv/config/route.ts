import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hasValidTvSession } from '@/lib/tv-auth'

function parseHolidays(value: string | undefined) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function GET() {
  if (!(await hasValidTvSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: ['holidays', 'company_holidays'] } },
  })
  const values = new Map(settings.map(setting => [setting.key, setting.value]))
  const holidayMap = new Map<string, unknown>()
  for (const holiday of [...parseHolidays(values.get('holidays')), ...parseHolidays(values.get('company_holidays'))]) {
    const key = typeof holiday === 'string' ? holiday : String(holiday?.date || '')
    if (key) holidayMap.set(key, holiday)
  }

  return NextResponse.json({ success: true, holidays: [...holidayMap.values()] })
}
