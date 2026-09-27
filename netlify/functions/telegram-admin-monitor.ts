import type { Handler } from '@netlify/functions'
import { enqueueMonitorReports } from '../../src/lib/telegram-monitor'
import { telegramEnabled } from '../../src/lib/telegram-service'

export const handler: Handler = async () => {
  if (!telegramEnabled()) return { statusCode: 200 }
  await enqueueMonitorReports()
  return { statusCode: 200 }
}
