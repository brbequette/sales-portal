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
        const rawPhoneNumber = contact?.mobilePhone || contact?.phone

        if (!rawPhoneNumber) {
          console.log(`Account ${account.name} has no valid phone number. Skipping.`)
          failedCount++
          continue
        }

        // Sanitize the phone number: remove any character that is not a digit or '+'
        let phoneNumber = rawPhoneNumber.replace(/[^\d+]/g, '')
        
        // Ensure US numbers have +1 prefix if they are exactly 10 digits
        if (phoneNumber.length === 10 && !phoneNumber.startsWith('+')) {
          phoneNumber = '+1' + phoneNumber
        } else if (!phoneNumber.startsWith('+') && phoneNumber.length > 10) {
          phoneNumber = '+' + phoneNumber
        }

        try {
          const zohoVoiceUrl = `https://voice.zoho.${process.env.ZOHO_DC || 'com'}/rest/json/v2/sms/send`
          
          const isMms = !!imageUrl
          const smsData = {
            customerNumber: phoneNumber,
            message: text || campaignName || 'Titan Diamond Update',
            senderId: process.env.ZOHO_VOICE_FROM_NUMBER || '',
            mms: isMms
          }
          
          const formData = new FormData()
          formData.append('sms_data', JSON.stringify(smsData))

          if (isMms) {
            try {
              if (imageUrl.startsWith('data:')) {
                const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
                if (match) {
                  const contentType = match[1]
                  const base64Data = match[2]
                  const buffer = Buffer.from(base64Data, 'base64')
                  const blob = new Blob([buffer], { type: contentType })
                  formData.append('mms_media', blob, `attachment.${contentType.split('/')[1] || 'jpg'}`)
                }
              } else {
                const imgRes = await fetch(imageUrl)
                if (imgRes.ok) {
                  const arrayBuffer = await imgRes.arrayBuffer()
                  const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
                  const blob = new Blob([arrayBuffer], { type: contentType })
                  formData.append('mms_media', blob, `attachment.${contentType.split('/')[1] || 'jpg'}`)
                }
              }
            } catch (err) {
              console.error("Error attaching MMS media:", err)
            }
          }

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

          // Zoho APIs often return 200 OK even for errors, so we must check the body
          if (smsRes.ok && resultJson.status !== 'error' && resultJson.code !== 'error') {
             successfulCount++
             notesToCreate.push({
               accountId: account.id,
               authorId: author.id,
               content: baseContent + `\n\n(Sent to ${phoneNumber})`,
               sentiment: 'Neutral',
               isAutoGenerated: false
             })
          } else {
             console.error(`Zoho Voice API failed for ${phoneNumber}:`, resultText)
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
