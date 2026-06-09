import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { corsHeaders, handleOptions } from "./lib/cors"

const prisma = new PrismaClient()

async function getZohoAccessToken() {
  const refreshToken = process.env.ZOHO_SMS_REFRESH_TOKEN || process.env.ZOHO_REFRESH_TOKEN
  if (!refreshToken) return null;
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.ZOHO_SMS_CLIENT_ID || process.env.ZOHO_CLIENT_ID || '',
    client_secret: process.env.ZOHO_SMS_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET || '',
    grant_type: "refresh_token",
  })
  
  try {
    const res = await fetch(`https://accounts.zoho.${process.env.ZOHO_DC || 'com'}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })
    const data = await res.json()
    return data.access_token
  } catch (e) {
    console.error("Error refreshing Zoho Token:", e)
    return null
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
    const { accountIds, channel, text, imageUrl, campaignName, userId, userEmail } = body

    if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: "No recipients selected" })
      }
    }

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

    // Resolve accounts in the database WITH contacts
    const accounts = await prisma.account.findMany({
      where: {
        id: { in: accountIds }
      },
      include: {
        contacts: true
      }
    })

    if (accounts.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: "No matching accounts found" })
      }
    }

    // Create a note for each account to record the campaign message
    const tag = `[CAMPAIGN] [${channel || 'MESSAGE'}]`
    const campaignLabel = campaignName ? `(Campaign: ${campaignName})` : ''
    
    // Construct base note content
    let baseContent = `${tag} ${campaignLabel}`.trim()
    if (text) {
      baseContent += `\n\nMessage: ${text}`
    }
    if (imageUrl) {
      const isDataUrl = imageUrl.startsWith("data:")
      const displayUrl = isDataUrl ? `${imageUrl.substring(0, 50)}... [Base64 Image]` : imageUrl
      baseContent += `\n\nAttachment: ${displayUrl}`
    }

    const notesToCreate: any[] = []
    let successfulCount = 0
    let failedCount = 0

    if (channel === 'SMS') {
      const accessToken = await getZohoAccessToken()
      if (!accessToken) {
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: "Failed to authenticate with Zoho Voice API. Make sure ZOHO_REFRESH_TOKEN is set." })
        }
      }

      for (const account of accounts) {
        const contact = account.contacts.find((c: any) => c.isPrimary) || account.contacts[0]
        const phoneNumber = contact?.mobilePhone || contact?.phone

        if (!phoneNumber) {
          console.log(`Account ${account.name} has no valid phone number. Skipping.`)
          failedCount++
          continue
        }

        try {
          const zohoVoiceUrl = `https://voice.zoho.${process.env.ZOHO_DC || 'com'}/rest/json/v2/sms/send`
          
          const smsData = {
            customerNumber: phoneNumber,
            message: text || campaignName || 'Titan Diamond Update',
            senderId: process.env.ZOHO_VOICE_FROM_NUMBER || '',
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

          if (smsRes.ok) {
             successfulCount++
             notesToCreate.push({
               accountId: account.id,
               authorId: author.id,
               content: baseContent + `\n\n(Sent to ${phoneNumber})`,
               sentiment: 'Neutral',
               isAutoGenerated: false
             })
          } else {
             const errorData = await smsRes.text()
             console.error(`Zoho Voice API failed for ${phoneNumber}:`, errorData)
             failedCount++
          }
        } catch (e) {
          console.error(`Error sending SMS to ${phoneNumber}:`, e)
          failedCount++
        }
      }
    } else {
      // Mock flow for Email and other channels
      for (const account of accounts) {
        successfulCount++
        notesToCreate.push({
          accountId: account.id,
          authorId: author.id,
          content: baseContent,
          sentiment: 'Neutral',
          isAutoGenerated: false
        })
      }
    }

    if (notesToCreate.length > 0) {
      await prisma.note.createMany({
        data: notesToCreate
      })
    }

    console.log(`Campaign "${campaignName || 'Unnamed'}" processed. Success: ${successfulCount}, Failed: ${failedCount}`)

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: successfulCount > 0, 
        message: channel === 'SMS' 
          ? `Campaign sent successfully to ${successfulCount} customers. Failed: ${failedCount}`
          : `Campaign mock sent successfully to ${successfulCount} customers.`,
        count: successfulCount,
        failedCount
      })
    }

  } catch (error: any) {
    console.error('Send Campaign API Error:', error)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: "Internal server error" })
    }
  }
}
