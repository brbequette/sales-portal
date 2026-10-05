import { authenticateFunction, withFunctionAuth } from './lib/auth-middleware'
import { Handler } from '@netlify/functions'
import { voiceInventory } from './lib/voice-directory'
const authenticatedHandler: Handler = async event => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Numbers are managed in Zoho Voice. Use Voice user management for assignments.' }) }
  try {
    const inventory = await voiceInventory(await authenticateFunction(event))
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, ...inventory }) }
  } catch (e) { return { statusCode: 503, headers, body: JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Voice inventory unavailable' }) } }
}
export const handler = withFunctionAuth(authenticatedHandler)
