import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const limit = await prisma.systemSetting.findUnique({ where: { key: 'sms_daily_account_limit' } })
    const prompt = await prisma.systemSetting.findUnique({ where: { key: 'ai_reply_prompt' } })
    
    return NextResponse.json({ 
      success: true, 
      settings: {
        sms_daily_account_limit: limit?.value || '1',
        ai_reply_prompt: prompt?.value || 'You are a helpful sales representative for Titan Diamond, a diamond wholesaler. Review the conversation history and suggest 3 short, professional, and friendly SMS text replies to continue the conversation. Return your response as a JSON array of 3 strings.'
      }
    })
  } catch (error: any) {
    console.error('Fetch Settings Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    
    if (body.sms_daily_account_limit !== undefined) {
      await prisma.systemSetting.upsert({
        where: { key: 'sms_daily_account_limit' },
        update: { value: String(body.sms_daily_account_limit) },
        create: { key: 'sms_daily_account_limit', value: String(body.sms_daily_account_limit) }
      })
    }
    
    if (body.ai_reply_prompt !== undefined) {
      await prisma.systemSetting.upsert({
        where: { key: 'ai_reply_prompt' },
        update: { value: String(body.ai_reply_prompt) },
        create: { key: 'ai_reply_prompt', value: String(body.ai_reply_prompt) }
      })
    }
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Save Settings Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
