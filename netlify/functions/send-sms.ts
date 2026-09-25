/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import FormData from "form-data"
import { corsHeaders, handleOptions } from "./lib/cors"
import { getZohoVoiceAccessToken } from "./lib/zoho-voice-auth"
import { prisma } from "./lib/prisma"
import { guardSmsSend } from "../../src/lib/sms-suppression"
import { createHash } from "node:crypto"

// Module-level cache for phone numbers (rarely changes)
let _phoneNumbersCache: any[] | null = null
let _phoneNumbersCacheAt = 0
const PHONE_CACHE_TTL = 60 * 60 * 1000 // 1 hour

async function getFromNumber(): Promise<string> {
  const now = Date.now()
  if (_phoneNumbersCache && now < _phoneNumbersCacheAt + PHONE_CACHE_TTL) {
    const defaultNum = _phoneNumbersCache.find(n => n.isDefault) || _phoneNumbersCache[0]
    return defaultNum?.number || ''
  }
  const envNum = process.env.ZOHO_VOICE_FROM_NUMBER || ''
  if (envNum) return envNum
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'zoho_phone_numbers' } })
    if (setting?.value) {
      _phoneNumbersCache = JSON.parse(setting.value)
      _phoneNumbersCacheAt = now
      const defaultNum = _phoneNumbersCache!.find(n => n.isDefault) || _phoneNumbersCache![0]
      return defaultNum?.number || ''
    }
  } catch (e) { console.warn('Failed to parse phone numbers setting:', e) }
  return ''
}

const authenticatedHandler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: "Method Not Allowed" })
    }
  }

  let activeOperationKey: string | null = null
  let providerSubmissionStarted = false
  try {
    const caller = await authenticateFunction(event)
    const { accountId, contactId, message, requestId } = JSON.parse(event.body || "{}")

    if (!accountId || !message || !requestId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: "Missing accountId, message, or requestId" })
      }
    }

    const callerId = String(caller.dbId || caller.userId || "")
    const author = callerId ? await prisma.user.findUnique({ where: { id: callerId } }) : null
    if (!author) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: "Unauthorized: User not found" })
      }
    }

    // Fetch the primary contact or first contact of the account
    const account = await prisma.account.findFirst({
      where: { OR: [{ id: accountId }, { zohoId: accountId }] },
      include: { contacts: true }
    })

    if (!account) {
      return {
        statusCode: 444,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: "Account not found" })
      }
    }

    const role = String(caller.role || "").toLowerCase()
    const privileged = role.includes("admin") || role.includes("manager")
    if (!privileged && account.ownerId !== callerId) {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, error: "Forbidden" }) }
    }

    const requestedContact = contactId ? account.contacts.find((c: any) => c.id === contactId) : null
    if (contactId && !requestedContact) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: "Selected contact does not belong to this account" }) }
    }
    const contact = requestedContact || account.contacts.find((c: any) => c.isPrimary) || account.contacts[0]
    const rawPhoneNumber = contact?.mobilePhone || contact?.phone

    if (!rawPhoneNumber) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: "Recipient contact has no valid phone number" })
      }
    }

    let phoneNumber = rawPhoneNumber.replace(/[^\d+]/g, '')
    if (phoneNumber.length === 10 && !phoneNumber.startsWith('+')) {
      phoneNumber = '+1' + phoneNumber
    } else if (!phoneNumber.startsWith('+') && phoneNumber.length > 10) {
      phoneNumber = '+' + phoneNumber
    }
    const guard = await guardSmsSend({ phone: phoneNumber, traffic: "TRANSACTIONAL" })
    if (!guard.allowed) return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ success: false, error: `SMS blocked: ${guard.reason}` }) }

    const operationKey = `zoho-voice:sms:individual:${String(requestId)}`
    activeOperationKey = operationKey
    const requestFingerprint = createHash('sha256').update(JSON.stringify({ accountId: account.id, contactId: contact?.id || null, phoneNumber, message })).digest('hex')
    const operation = await prisma.providerWriteOperation.upsert({ where: { operationKey }, update: {}, create: { operationKey, provider: 'ZOHO_VOICE', entityType: 'SMS', entityId: account.id, operation: 'SEND_MESSAGE', requestFingerprint } })
    if (operation.requestFingerprint !== requestFingerprint) return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'requestId was already used for different message data' }) }
    if (operation.state === 'SUCCEEDED') {
      const prior = operation.providerRecordIds as Record<string, string> | null
      const smsMessage = prior?.localMessageId ? await prisma.smsMessage.findUnique({ where: { id: prior.localMessageId } }) : null
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, providerAccepted: true, alreadyProcessed: true, smsMessage, provider: prior }) }
    }
    if (operation.state === 'SYNCING' || operation.state === 'AMBIGUOUS') return { statusCode: 202, headers: corsHeaders, body: JSON.stringify({ success: false, providerState: operation.state, error: 'This SMS is already in progress or has an unknown provider outcome. It was not resent.' }) }
    if (operation.state === 'FAILED') return { statusCode: 422, headers: corsHeaders, body: JSON.stringify({ success: false, providerState: 'FAILED', error: operation.providerMessage || 'The prior send failed and was not retried.' }) }
    const claimed = await prisma.providerWriteOperation.updateMany({ where: { operationKey, state: 'PENDING' }, data: { state: 'SYNCING', attemptCount: { increment: 1 }, lastAttemptAt: new Date() } })
    if (claimed.count !== 1) return { statusCode: 202, headers: corsHeaders, body: JSON.stringify({ success: false, providerState: 'SYNCING', error: 'This SMS is already being submitted.' }) }

    const accessToken = await getZohoVoiceAccessToken()
    if (!accessToken) {
      await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'FAILED', lastError: 'Zoho Voice authentication failed before submission.', providerMessage: 'Authentication failed before provider submission.', completedAt: new Date() } })
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: "Failed to authenticate with Zoho Voice" })
      }
    }

    const fromNumber = await getFromNumber()
    if (!fromNumber) {
      await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'FAILED', lastError: 'No outbound sender configured before submission.', providerMessage: 'No outbound sender configured.', completedAt: new Date() } })
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'No outbound Zoho Voice SMS number configured' })
      }
    }

    // Post to Zoho
    const zohoVoiceUrl = `https://voice.zoho.${process.env.ZOHO_DC || 'com'}/rest/json/v2/sms/send`
    const smsData = {
      customerNumber: phoneNumber,
      message: message,
      senderId: fromNumber,
      mms: false
    }

    const formData = new FormData()
    formData.append('sms_data', JSON.stringify(smsData))

    let smsRes: Response
    try {
      providerSubmissionStarted = true
      smsRes = await fetch(zohoVoiceUrl, { signal: AbortSignal.timeout(15000), method: 'POST', headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Accept': 'application/json', ...formData.getHeaders() }, body: formData as any })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Zoho Voice submission error'
      await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'AMBIGUOUS', lastError: message, providerMessage: 'Submission outcome is unknown; do not retry automatically.' } })
      return { statusCode: 202, headers: corsHeaders, body: JSON.stringify({ success: false, providerState: 'AMBIGUOUS', error: 'SMS submission outcome is unknown and was not retried.' }) }
    }

    const resultText = await smsRes.text()
    let resultJson: any = {}
    try { resultJson = JSON.parse(resultText) } catch (e) {}

    const providerStatus = String(resultJson.status || '').toUpperCase()
    const providerCode = String(resultJson.code || '').toUpperCase()
    const providerAccepted = smsRes.ok && (providerCode === 'SUCCESS' || providerCode === 'ZVSMS-2000' || providerStatus === 'SUCCESS')
    const provider = { httpStatus: smsRes.status, code: String(resultJson.code || ''), status: String(resultJson.status || ''), message: String(resultJson.message || ''), logId: String(resultJson.logId || resultJson.log_id || ''), mmsId: String(resultJson.mmsId || resultJson.mms_id || ''), fromNumber, toNumber: phoneNumber }

    if (providerAccepted) {
      const smsMessage = await prisma.$transaction(async tx => {
        const savedMessage = await tx.smsMessage.create({
          data: {
            accountId: account.id,
            contactId: contact?.id || null,
            authorId: author.id,
            fromNumber: fromNumber,
            toNumber: phoneNumber,
            body: message,
            direction: 'OUTBOUND'
          }
        })
        await tx.communicationEvent.create({
          data: {
            accountId: account.id,
            contactId: contact?.id || null,
            actorId: author.id,
            channel: 'SMS',
            direction: 'OUTBOUND',
            eventType: 'MESSAGE_SENT',
            sourceType: 'SmsMessage',
            sourceId: savedMessage.id,
            summary: message.slice(0, 1000),
            occurredAt: savedMessage.createdAt,
            metadata: { ...provider, provider: 'ZOHO_VOICE' }
          }
        })
        await tx.providerWriteOperation.update({ where: { operationKey }, data: { state: 'SUCCEEDED', providerRecordIds: { ...provider, localMessageId: savedMessage.id }, providerCode: provider.code, providerMessage: provider.message || provider.status, completedAt: new Date(), lastError: null } })
        return savedMessage
      })

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, smsMessage, providerAccepted: true, provider })
      }
    } else if (smsRes.ok && resultText.trim().length === 0) {
      await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'AMBIGUOUS', providerCode: `HTTP_${smsRes.status}`, providerMessage: 'Provider returned an empty successful response; submission outcome is unknown.', lastError: 'Empty provider response after submission.' } })
      return { statusCode: 202, headers: corsHeaders, body: JSON.stringify({ success: false, providerState: 'AMBIGUOUS', error: 'SMS submission outcome is unknown and was not retried.' }) }
    } else {
      console.error(`Zoho Voice SMS send error:`, resultText)
      await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'FAILED', providerCode: provider.code || `HTTP_${smsRes.status}`, providerMessage: provider.message || 'Zoho Voice API error', lastError: provider.message || resultText.slice(0, 1000), completedAt: new Date() } })
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: resultJson.message || 'Zoho Voice API error' })
      }
    }
  } catch (err: any) {
    console.error("Send SMS Function Error:", err)
    if (activeOperationKey) {
      await prisma.providerWriteOperation.update({ where: { operationKey: activeOperationKey }, data: providerSubmissionStarted
        ? { state: 'AMBIGUOUS', lastError: String(err?.message || err), providerMessage: 'Submission outcome is unknown; do not retry automatically.' }
        : { state: 'FAILED', lastError: String(err?.message || err), providerMessage: 'Request failed before provider submission.', completedAt: new Date() }
      }).catch(() => undefined)
    }
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
