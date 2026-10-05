// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encode } from 'next-auth/jwt'
import { authenticateFunction } from './auth-middleware'
const event = (cookie: string) => ({ headers: { cookie }, httpMethod: 'GET' }) as any
afterEach(() => vi.unstubAllEnvs())
describe('function session cookie compatibility', () => {
  it('accepts signed production cookies even when NEXTAUTH_URL is absent or local', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000'); vi.stubEnv('NEXTAUTH_SECRET', 'test-only-secret')
    const token = await encode({ token: { id: 'user', dbId: 'db', role: 'AGENT' }, secret: 'test-only-secret' })
    expect(await authenticateFunction(event(`__Secure-next-auth.session-token=${token}`))).toMatchObject({ dbId: 'db', role: 'AGENT' })
  })
  it('reassembles signed chunked production cookies', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('NEXTAUTH_SECRET', 'test-only-secret')
    const token = await encode({ token: { id: 'user' }, secret: 'test-only-secret' })
    expect(await authenticateFunction(event(`__Secure-next-auth.session-token.0=${token.slice(0, 30)}; __Secure-next-auth.session-token.1=${token.slice(30)}`))).toMatchObject({ userId: 'user' })
  })
  it('rejects unsigned cookies and missing sessions', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('NEXTAUTH_SECRET', 'test-only-secret')
    await expect(authenticateFunction(event('__Secure-next-auth.session-token=fake'))).rejects.toThrow('Unauthorized')
    await expect(authenticateFunction(event(''))).rejects.toThrow('Unauthorized')
  })
})
