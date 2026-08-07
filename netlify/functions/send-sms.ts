import { Handler } from "@netlify/functions"
import fetch from "node-fetch"
import FormData from "form-data"
import { corsHeaders, handleOptions } from "./lib/cors"
import { getZohoAccessToken } from "./lib/zoho-auth"
import { prisma } from "./lib/prisma"

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

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: "Method Not Allowed" })
    }
  }

  try {
    const { accountId, message, userId, userEmail } = JSON.parse(event.body || "{}")

    if (!accountId || !message) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: "Missing accountId or message" })
      }
    }

    let author = null
    if (userId) {
      author = await prisma.user.findUnique({ where: { id: userId } })
    }
    if (!author && userEmail) {
      author = await prisma.user.findUnique({ where: { email: userEmail } })
    }
    if (!author) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: "Unauthorized: User not found" })
      }
    }

    // Fetch the primary contact or first contact of the account
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { contacts: true }
    })

    if (!account) {
      return {
        statusCode: 444,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: "Account not found" })
      }
    }

    const contact = account.contacts.find((c: any) => c.isPrimary) || account.contacts[0]
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

    const accessToken = await getZohoAccessToken()
    if (!accessToken) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: "Failed to authenticate with Zoho Voice" })
      }
    }

    const fromNumber = await getFromNumber()
    if (!fromNumber) {
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

    const smsRes = await fetch(zohoVoiceUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        ...formData.getHeaders()
      },
      body: formData
    })

    const resultText = await smsRes.text()
    let resultJson: any = {}
    try { resultJson = JSON.parse(resultText) } catch (e) {}

    if (smsRes.ok && resultJson.status !== 'error' && resultJson.code !== 'error') {
      const smsMessage = await prisma.smsMessage.create({
        data: {
          accountId: account.id,
          authorId: author.id,
          fromNumber: fromNumber,
          toNumber: phoneNumber,
          body: message,
          direction: 'OUTBOUND'
        }
      })

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, smsMessage })
      }
    } else {
      console.error(`Zoho Voice SMS send error:`, resultText)
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: resultJson.message || 'Zoho Voice API error' })
      }
    }
  } catch (err: any) {
    console.error("Send SMS Function Error:", err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
