import { NextResponse } from 'next/server'
import { decode, encode } from 'next-auth/jwt'
import { getSystemSettings } from '@/lib/settings'

const TV_COOKIE = 'tdgpt-tv-session'
const TV_SESSION_SECONDS = 12 * 60 * 60
const authSecret = () => process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || ''

function readCookie(req: Request, name: string) {
  const cookieHeader = req.headers.get('cookie') || ''
  for (const item of cookieHeader.split(';')) {
    const [key, ...value] = item.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return ''
}

export async function GET(req: Request) {
  const secret = authSecret()
  const token = readCookie(req, TV_COOKIE)
  if (!secret || !token) return NextResponse.json({ success: true, valid: false })

  const payload = await decode({ token, secret }).catch(() => null)
  return NextResponse.json({ success: true, valid: payload?.type === 'tv' })
}

export async function POST(req: Request) {
  try {
    const { pin } = await req.json()
    const settings = await getSystemSettings()
    const isValid = pin === settings.tv_pin
    const response = NextResponse.json({ success: true, valid: isValid })
    if (isValid) {
      const secret = authSecret()
      if (!secret) throw new Error('TV session secret is not configured')
      const token = await encode({
        token: { type: 'tv' },
        secret,
        maxAge: TV_SESSION_SECONDS,
      })
      response.cookies.set(TV_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: new URL(req.url).protocol === 'https:',
        path: '/',
        maxAge: TV_SESSION_SECONDS,
      })
    }
    return response
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
