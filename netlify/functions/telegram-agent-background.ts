import type { Handler } from '@netlify/functions'
import { validSecret } from '../../src/lib/telegram-policy'
import { processTelegramJob } from '../../src/lib/telegram-service'

export const handler: Handler = async event => {
  if (event.httpMethod !== 'POST' || !validSecret(event.headers['x-titan-worker-secret'], process.env.TELEGRAM_WORKER_SECRET)) return { statusCode: 401 }
  let id: unknown
  try { id = JSON.parse(event.body || '{}').id } catch { return { statusCode: 400 } }
  if (typeof id !== 'string' || id.length > 80) return { statusCode: 400 }
  await processTelegramJob(id)
  return { statusCode: 200 }
}
