import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"
import { getZohoAccessToken } from "./lib/zoho-auth"

import { prisma } from "./lib/prisma"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"

export const handler: Handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  let authenticatedUser
  try {
    authenticatedUser = await authenticateFunction(event)
  } catch (error) {
    return authErrorResponse(error, corsHeaders)
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { action, accountId, noteContent, sentiment, reminderDate } = body

    // The author must come from the verified session, never caller input.
    let author = authenticatedUser.dbId
      ? await prisma.user.findUnique({ where: { id: authenticatedUser.dbId } })
      : null
    if (!author && authenticatedUser.email) {
      author = await prisma.user.findUnique({ where: { email: authenticatedUser.email } })
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

      // Sanitize phone number
      let phoneNumber = rawPhoneNumber.replace(/[^\d+]/g, '')
      if (phoneNumber.length === 10 && !phoneNumber.startsWith('+')) {
        phoneNumber = '+1' + phoneNumber
      } else if (!phoneNumber.startsWith('+') && phoneNumber.length > 10) {
        phoneNumber = '+' + phoneNumber
      }

      let apiSuccess = false
      let apiMessage = ""

      try {
        const accessToken = await getZohoAccessToken()
        if (accessToken) {
          let fromNumber = process.env.ZOHO_VOICE_FROM_NUMBER || ''
          if (!fromNumber) {
            const setting = await prisma.systemSetting.findUnique({ where: { key: "zoho_phone_numbers" } })
            if (setting && setting.value) {
              try {
                const parsed = JSON.parse(setting.value)
                const defaultNum = parsed.find((n: any) => n.isDefault) || parsed[0]
                if (defaultNum && defaultNum.number) {
                  fromNumber = defaultNum.number
                }
              } catch(e) { console.warn('Failed to parse zoho_phone_numbers setting:', e) }
            }
          }
          if (!fromNumber) fromNumber = process.env.ZOHO_VOICE_FROM_NUMBER || '';

          const zohoVoiceUrl = `https://voice.zoho.${process.env.ZOHO_DC || 'com'}/rest/json/v2/sms/send`
          const smsData = {
            customerNumber: phoneNumber,
            message: noteContent,
            senderId: fromNumber,
            mms: false
          }
          const formData = new FormData()
          formData.append('sms_data', JSON.stringify(smsData))

          const smsRes = await fetch(zohoVoiceUrl, { signal: AbortSignal.timeout(15000),
            method: 'POST',
            headers: {
              'Authorization': `Zoho-oauthtoken ${accessToken}`
            },
            body: formData as any
          })

          const resultText = await smsRes.text()
          let resultJson: any = {}
          try { resultJson = JSON.parse(resultText) } catch (e) { console.warn('Failed to parse Zoho Voice SMS response:', e) }

          const providerStatus = String(resultJson.status || '').toLowerCase()
          const providerCode = String(resultJson.code || '').toLowerCase()
          const providerRejected = providerStatus === 'error' || providerStatus === 'failed' || providerCode === 'error' || providerCode === 'failed'
          if (smsRes.ok && resultText.trim().length > 0 && !providerRejected) {
            apiSuccess = true
          } else {
            console.error(`Zoho Voice SMS send failed:`, resultText)
            apiMessage = `Zoho Voice API error: ${resultJson.message || resultText}`
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
      return {
        statusCode: 501,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: `${action === 'SEND_EMAIL' ? 'Email' : 'WhatsApp'} provider sending is not configured` })
      }
    }
    if (action === 'INITIATE_CALL') {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Calls must be initiated by Zoho Voice WebSDK, ZDialer, or the native device dialer' })
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

