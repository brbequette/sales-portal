import { schedule } from '@netlify/functions'
import { getMicrosoftMailConfiguration, syncEnabledMicrosoftMailboxes } from '../../src/lib/microsoft-graph-mail'

export const handler = schedule('*/3 * * * *', async () => {
  if (!getMicrosoftMailConfiguration().configured) return { statusCode: 200, body: JSON.stringify({ status: 'NOT_CONFIGURED' }) }
  const results = await syncEnabledMicrosoftMailboxes()
  return { statusCode: 200, body: JSON.stringify({ processed: results.reduce((n, r) => n + r.processed, 0), createdEvents: results.reduce((n, r) => n + r.createdEvents, 0), failures: results.filter(r => r.errors.length).length }) }
})
