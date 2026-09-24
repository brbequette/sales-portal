import { authenticateFunction, withFunctionAuth } from './lib/auth-middleware'
import { Handler } from '@netlify/functions'
import { prisma } from './lib/prisma'
import { isAdminRole } from '../../src/lib/roles'

const authenticatedHandler: Handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    'X-Data-Source': 'POSTGRESQL',
    'X-Zoho-Calls': '0',
    'X-OAuth-Refreshes': '0',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) }

  try {
    const sessionUser = await authenticateFunction(event)
    const actorId = sessionUser.dbId || sessionUser.userId
    const { id, type = 'Invoice' } = event.queryStringParameters || {}
    if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing document identifier' }) }

    const where = { OR: [{ id }, { zohoId: id }] }
    const select = { id: true, account: { select: { ownerId: true } } }
    const document = type === 'SalesOrder'
      ? await prisma.salesOrder.findFirst({ where, select })
      : type === 'Quote'
        ? await prisma.quote.findFirst({ where, select })
        : await prisma.invoice.findFirst({ where, select })
    if (!document) return { statusCode: 409, headers, body: JSON.stringify({ error: 'LOCAL_DATA_INCOMPLETE' }) }
    if (!isAdminRole(sessionUser.role) && (!actorId || document.account.ownerId !== actorId)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) }
    }

    // PDF bytes are not stored in PostgreSQL. A GET must never fill that gap
    // from Zoho or OAuth, so callers receive an explicit local-data blocker.
    return { statusCode: 409, headers, body: JSON.stringify({ error: 'LOCAL_DATA_INCOMPLETE' }) }
  } catch (error) {
    console.error('Local document PDF read error:', error)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'LOCAL_DATA_INCOMPLETE' }) }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
