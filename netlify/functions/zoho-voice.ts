import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { corsHeaders, handleOptions } from "./lib/cors"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()

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
    const { action, accountId, noteContent, sentiment, reminderDate, userId, userEmail } = body

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
          const zohoVoiceUrl = `https://voice.zoho.${process.env.ZOHO_DC || 'com'}/rest/json/v2/sms/send`
          const smsData = {
            customerNumber: phoneNumber,
            message: noteContent,
            senderId: process.env.ZOHO_VOICE_FROM_NUMBER || '+14804702577',
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
      if (account) {
        // Record call initiation event in account lastCalledAt timestamp
        await prisma.account.update({
          where: { id: account.id },
          data: { lastCalledAt: new Date() }
        })
      }
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, message: 'Call initiated' })
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

