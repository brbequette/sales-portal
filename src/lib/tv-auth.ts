import { cookies } from 'next/headers'
import { decode } from 'next-auth/jwt'

export const TV_SESSION_COOKIE = 'tdgpt-tv-session'

export async function hasValidTvSession() {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || ''
  if (!secret) return false
  const token = (await cookies()).get(TV_SESSION_COOKIE)?.value
  if (!token) return false
  const payload = await decode({ token, secret }).catch(() => null)
  return payload?.type === 'tv'
}
