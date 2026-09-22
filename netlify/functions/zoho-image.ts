import { Handler } from '@netlify/functions'
import { authenticateFunction, authErrorResponse } from './lib/auth-middleware'

export const handler: Handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Data-Source': 'POSTGRESQL', 'X-Zoho-Calls': '0', 'X-OAuth-Refreshes': '0' }
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  try { await authenticateFunction(event) } catch (error) { return authErrorResponse(error, headers) }
  return { statusCode: 409, headers, body: JSON.stringify({ error: 'LOCAL_DATA_INCOMPLETE' }) }
}
