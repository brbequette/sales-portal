import { Handler } from '@netlify/functions'
import { corsHeaders, handleOptions } from './lib/cors'
import { prisma } from './lib/prisma'
import { getZohoAccessToken, ZOHO_DC } from './lib/zoho-auth'
import { authenticateWebhookToken, authErrorResponse } from './lib/auth-middleware'

/**
 * Zoho Voice Inbound SMS Webhook
 *
 * Register this URL in Zoho Voice: Settings → SMS → Inbound Webhook
 * URL: https://your-site.netlify.app/.netlify/functions/zoho-voice-inbound
 *
 * Receives inbound customer replies and:
 *  1. Finds the matching account by phone number
 *  2. Creates an SmsMessage record with direction=INBOUND
 *  3. Pushes a note to Zoho CRM so reps see it
 *  4. Marks the account's nextActionDate to today so it surfaces in queues
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions()
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    authenticateWebhookToken(event, ['ZOHO_VOICE_WEBHOOK_SECRET', 'ZOHO_WEBHOOK_SECRET'], ['x-zoho-webhook-token'])
  } catch (error) {
    return authErrorResponse(error, corsHeaders)
  }

  try {
    let body: any = {}
    try { body = JSON.parse(event.body || '{}') } catch { /* ignore */ }

    const fromNumber = body.from || body.fromNumber || body.sender || ''
    const toNumber   = body.to   || body.toNumber   || body.receiver || ''
    const message    = body.body || body.message    || body.text || ''

    if (!fromNumber || !message) {
      console.warn('[zoho-voice-inbound] Missing fromNumber or message in payload:', body)
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: 'No data to process' }) }
    }

    // Normalize the inbound phone number for lookup
    const normalizedFrom = fromNumber.replace(/[^\d+]/g, '')

    // Find the contact and account by phone number
    const contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { phone:       { contains: normalizedFrom.slice(-10) } },
          { mobilePhone: { contains: normalizedFrom.slice(-10) } },
        ]
      },
      include: { account: true }
    })

    const accountId = contact?.accountId || null

    // Store the inbound message
    const smsRecord = await prisma.smsMessage.create({
      data: {
        accountId:  accountId || undefined,
        fromNumber: fromNumber,
        toNumber:   toNumber || '',
        body:       message,
        direction:  'INBOUND',
      }
    })

    // If we found the account, flag it for follow-up
    if (accountId) {
      await prisma.account.update({
        where: { id: accountId },
        data:  { nextActionDate: new Date() }
      })

      // Push a CRM note so the rep sees the reply in Zoho CRM
      try {
        const { pushZohoNote } = await import('./lib/zoho-auth')
        const account = contact?.account
        if (account?.zohoId) {
          await pushZohoNote(
            account.zohoId,
            `📱 Inbound SMS Reply`,
            `Customer replied from ${fromNumber}:\n\n"${message}"`,
          )
        }
      } catch (noteErr: any) {
        console.warn('[zoho-voice-inbound] CRM note push failed:', noteErr.message)
      }
    }

    console.log(`[zoho-voice-inbound] Stored inbound SMS from ${fromNumber}, accountId=${accountId || 'unknown'}`)
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, id: smsRecord.id }) }

  } catch (err: any) {
    console.error('[zoho-voice-inbound] Error:', err)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
