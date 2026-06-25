import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

export async function POST(req: Request) {
  try {
    const output = execSync('npx prisma db push --accept-data-loss', { 
      encoding: 'utf8',
      env: { ...process.env, HOME: '/tmp', npm_config_cache: '/tmp/.npm' }
    })
    return NextResponse.json({ success: true, output })
  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      stdout: error.stdout?.toString(),
      stderr: error.stderr?.toString()
    }, { status: 500 })
  }
}
