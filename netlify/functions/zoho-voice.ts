import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { corsHeaders, handleOptions } from "./lib/cors"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()

function normalizePhoneNumber(rawPhoneNumber: string | null | undefined) {
  if (!rawPhoneNumber) return ""

  let phoneNumber = rawPhoneNumber.replace(/[^\d+]/g, "")
  if (phoneNumber.length === 10 && !phoneNumber.startsWith("+")) {
    phoneNumber = `+1${phoneNumber}`
  } else if (!phoneNumber.startsWith("+") && phoneNumber.length > 10) {
    phoneNumber = `+${phoneNumber}`
  }

  return phoneNumber
}

function parseZohoCallId(result: Record<string, any>) {
  const firstDataItem = Array.isArray(result.data) ? result.data[0] : result.data
  if (firstDataItem && typeof firstDataItem === "object") {
    return String(firstDataItem.call_id || firstDataItem.callId || firstDataItem.id || firstDataItem.call_uuid || "")
  }
  return String(result.call_id || result.callId || result.id || result.call_uuid || "")
}

function isZohoVoiceCallSuccess(result: Record<string, any>) {
  const status = String(result.status || result.code || "").toLowerCase()
  const message = String(result.message || "").toLowerCase()
  const firstDataItem = Array.isArray(result.data) ? result.data[0] : result.data
  const itemCode = firstDataItem && typeof firstDataItem === "object"
    ? String(firstDataItem.code || "").toLowerCase()
    : ""

  if (status === "error" || status === "failure" || result.error) return false
  if (itemCode === "error" || itemCode === "failure") return false
  if (status === "success" || status === "ok" || itemCode === "success") return true
  if (parseZohoCallId(result)) return true
  if (message.includes("initiated") || message.includes("success")) return true
  return false
}

async function resolveOutboundVoiceNumber(requestedNumber?: string | null) {
  if (requestedNumber && requestedNumber !== "System") return normalizePhoneNumber(requestedNumber)
  if (process.env.ZOHO_VOICE_FROM_NUMBER) return normalizePhoneNumber(process.env.ZOHO_VOICE_FROM_NUMBER)

  const setting = await prisma.systemSetting.findUnique({ where: { key: "zoho_phone_numbers" } })
  if (!setting?.value) return ""

  try {
    const numbers = JSON.parse(setting.value)
    if (!Array.isArray(numbers)) return ""
    const defaultNumber = numbers.find((n: any) => n?.isDefault) || numbers[0]
    return normalizePhoneNumber(defaultNumber?.number)
  } catch {
    return ""
  }
}

async function initiateZohoVoiceCall(params: {
  accessToken: string
  fromNumber?: string | null
  toNumber?: string | null
}) {
  const callerId = await resolveOutboundVoiceNumber(params.fromNumber)
  const destinationNumber = normalizePhoneNumber(params.toNumber)

  if (!destinationNumber) {
    return { success: false, status: 400, message: "Missing destination number" }
  }
  if (!callerId) {
    return {
      success: false,
      status: 400,
      message: "No outbound Zoho Voice number is configured. Configure one in Admin > Communications."
    }
  }

  const zohoDc = process.env.ZOHO_DC || "com"
  const callUrl = process.env.ZOHO_VOICE_CALL_URL || `https://voice.zoho.${zohoDc}/api/v1/call`
  const callRes = await fetch(callUrl, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from_number: callerId,
      to_number: destinationNumber,
    }),
  })

  const resultText = await callRes.text()
  let resultJson: Record<string, any> = {}
  try { resultJson = JSON.parse(resultText) } catch {}

  if (!callRes.ok || !isZohoVoiceCallSuccess(resultJson)) {
    return {
      success: false,
      status: callRes.ok ? 502 : callRes.status,
      message: resultJson.message || resultJson.error || resultText || "Zoho Voice rejected the call request"
    }
  }

  return {
    success: true,
    status: callRes.status,
    zohoCallId: parseZohoCallId(resultJson) || `zv_call_${Date.now()}`,
    fromNumber: callerId,
    toNumber: destinationNumber,
  }
}

export const handler: Handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { action, accountId, noteContent, sentiment, reminderDate, userId, userEmail, fromNumber, toNumber } = body

    // Resolve author dynamically
    let author = null
    if (userId) {
      author = await prisma.user.findUnique({ where: { id: userId } })
    }
    if (!author && userEmail) {
      author = await prisma.user.findUnique({ where: { email: userEmail } })
    }
    if (!author) {
      author = await prisma.user.findFirst({ where: { email: { contains: "@titandiamond" } } })
    }
    if (!author) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: "No valid user found" })
      }
    }

    // Resolve the account: try zohoId first, then DB id
    const resolveAccount = async (id: string) => {
      let account = await prisma.account.findUnique({ where: { zohoId: id } })
      if (!account) {
        account = await prisma.account.findUnique({ where: { id: id } })
      }
      return account
    }

    if (action === 'LOG_CALL') {
      const account = await resolveAccount(accountId)
      if (!account) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: "Account not found" })
        }
      }

      const note = await prisma.note.create({
        data: {
          accountId: account.id,
          authorId: author.id,
          content: noteContent,
          sentiment: sentiment || 'Neutral',
          callSid: `ZV-${Date.now()}`
        }
      })

      // Maintain lastCalledAt and set optional reminderDate
      const updateData: any = { lastCalledAt: new Date() }
      if (reminderDate) {
        updateData.nextActionDate = new Date(reminderDate)
      }

      await prisma.account.update({
        where: { id: account.id },
        data: updateData
      })

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, note })
      }
    }

    if (action === 'SEND_SMS') {
      const account = await resolveAccount(accountId)
      if (!account) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: "Account not found" })
        }
      }

      // Resolve the primary contact or first contact
      const dbAccount = await prisma.account.findUnique({
        where: { id: account.id },
        include: { contacts: true }
      })
      const contact = dbAccount?.contacts.find((c: any) => c.isPrimary) || dbAccount?.contacts[0]
      const rawPhoneNumber = contact?.mobilePhone || contact?.phone

      if (!rawPhoneNumber) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: "No valid phone number found for this account's contacts" })
        }
      }

      const phoneNumber = normalizePhoneNumber(rawPhoneNumber)

      let apiSuccess = false
      let apiMessage = ""

      try {
        const accessToken = await getZohoAccessToken()
        if (accessToken) {
          const senderNumber = await resolveOutboundVoiceNumber(fromNumber)
          if (!senderNumber) {
            apiMessage = "No outbound Zoho Voice number is configured."
          } else {
            const zohoVoiceUrl = `https://voice.zoho.${process.env.ZOHO_DC || 'com'}/rest/json/v2/sms/send`
            const smsData = {
              customerNumber: phoneNumber,
              message: noteContent,
              senderId: senderNumber,
              mms: false
            }
            const formData = new FormData()
            formData.append('sms_data', JSON.stringify(smsData))

            const smsRes = await fetch(zohoVoiceUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`
              },
              body: formData
            })

            const resultText = await smsRes.text()
            let resultJson: any = {}
            try { resultJson = JSON.parse(resultText) } catch (e) {}

            if (smsRes.ok && resultJson.status !== 'error' && resultJson.code !== 'error') {
              apiSuccess = true
            } else {
              console.error(`Zoho Voice SMS send failed:`, resultText)
              apiMessage = `Zoho Voice API error: ${resultJson.message || resultText}`
            }
          }
        } else {
          apiMessage = "Could not retrieve Zoho access token"
        }
      } catch (err: any) {
        console.error(`Error contacting Zoho Voice API:`, err)
        apiMessage = err.message
      }

      // Record the SMS locally in Notes regardless of API result so user has local history
      const note = await prisma.note.create({
        data: {
          accountId: account.id,
          authorId: author.id,
          content: `[SMS] ${noteContent || ''}`.trim() + (apiSuccess ? '' : ` (Failed to send: ${apiMessage})`),
          sentiment: sentiment || 'Neutral',
        }
      })

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: apiSuccess, note, message: apiMessage })
      }
    }

    if (action === 'SEND_EMAIL' || action === 'SEND_WHATSAPP') {
      const channelTag: Record<string, string> = {
        SEND_EMAIL: '[EMAIL]',
        SEND_WHATSAPP: '[WHATSAPP]',
      }
      const tag = channelTag[action]

      const account = await resolveAccount(accountId)
      if (!account) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: "Account not found" })
        }
      }

      const note = await prisma.note.create({
        data: {
          accountId: account.id,
          authorId: author.id,
          content: `${tag} ${noteContent || ''}`.trim(),
          sentiment: sentiment || 'Neutral',
        }
      })

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, note })
      }
    }

    if (action === 'INITIATE_CALL') {
      const account = await resolveAccount(accountId)
      let destinationNumber = normalizePhoneNumber(toNumber)

      if (!destinationNumber && account) {
        const dbAccount = await prisma.account.findUnique({
          where: { id: account.id },
          include: { contacts: true }
        })
        const contact = dbAccount?.contacts.find((c: any) => c.isPrimary) || dbAccount?.contacts[0]
        destinationNumber = normalizePhoneNumber(contact?.mobilePhone || contact?.phone)
      }

      if (!destinationNumber) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: "No destination phone number found" })
        }
      }

      const accessToken = await getZohoAccessToken()
      if (!accessToken) {
        return {
          statusCode: 502,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: "Could not retrieve Zoho access token" })
        }
      }

      const callResult = await initiateZohoVoiceCall({ accessToken, fromNumber, toNumber: destinationNumber })

      if (!callResult.success) {
        return {
          statusCode: callResult.status || 502,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: callResult.message || "Zoho Voice rejected the call request" })
        }
      }

      if (account) {
        await prisma.account.update({
          where: { id: account.id },
          data: { lastCalledAt: new Date() }
        })
      }
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Call initiated',
          zohoCallId: callResult.zohoCallId,
          fromNumber: callResult.fromNumber,
          toNumber: callResult.toNumber
        })
      }
    }

    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Unknown action' })
    }

  } catch (error: any) {
    console.error('Zoho Voice API Error:', error)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: "Internal server error" })
    }
  }
}
