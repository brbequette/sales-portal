import { Handler } from '@netlify/functions'
import { corsHeaders, handleOptions } from './lib/cors'
import { prisma } from './lib/prisma'

/**
 * Zoho Voice SMS Delivery Status Webhook
 *
 * Register in Zoho Voice: Settings → SMS → Delivery Report Webhook
 * URL: https://your-site.netlify.app/.netlify/functions/zoho-voice-status
 *
 * Updates SmsMessage.status to DELIVERED or FAILED based on the callback.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions()
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    let body: any = {}
    try { body = JSON.parse(event.body || '{}') } catch { /* ignore */ }

    const messageId     = body.messageId || body.message_id || body.smsId || ''
    const toNumber      = body.to || body.toNumber || body.customerNumber || ''
    const deliveryStatus = (body.status || body.deliveryStatus || '').toLowerCase()

    // Map Zoho Voice delivery statuses to our internal statuses
    let internalStatus: string
    if (deliveryStatus === 'delivered' || deliveryStatus === 'success') {
      internalStatus = 'DELIVERED'
    } else if (deliveryStatus === 'failed' || deliveryStatus === 'undelivered' || deliveryStatus === 'error') {
      internalStatus = 'FAILED'
    } else {
      internalStatus = 'SENT'
    }

    // Try to find the most recent outbound message to this number
    const normalizedTo = toNumber.replace(/[^\d+]/g, '')
    const recentMessage = await prisma.smsMessage.findFirst({
      where: {
        toNumber:  { contains: normalizedTo.slice(-10) },
        direction: 'OUTBOUND',
        status:    { not: 'DELIVERED' } // don't downgrade already-delivered
      },
      orderBy: { createdAt: 'desc' }
    })

    if (recentMessage) {
      await prisma.smsMessage.update({
        where: { id: recentMessage.id },
        data:  { status: internalStatus }
      })
      console.log(`[zoho-voice-status] Updated msg ${recentMessage.id} status → ${internalStatus}`)
    } else {
      console.warn(`[zoho-voice-status] No matching outbound SMS found for ${toNumber}`)
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) }

  } catch (err: any) {
    console.error('[zoho-voice-status] Error:', err)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
