import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import fetch from "node-fetch"
import FormData from "form-data"
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
    const { accountIds, channel, text, imageUrl, campaignName, userId, userEmail, fromNumber: bodyFromNumber } = body

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

    if (author.canSendCampaigns === false && author.role !== 'ADMIN') {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: "You do not have permission to send campaigns." })
      }
    }

    // Rate limit: 1 campaign every 5 minutes
    const recentBlast = await prisma.campaignBlast.findFirst({
      where: { authorId: author.id, createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } }
    })
    if (recentBlast && author.role !== 'ADMIN') {
      return {
        statusCode: 429,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: "You are sending campaigns too frequently. Please wait 5 minutes between blasts." })
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

    const blast = await prisma.campaignBlast.create({
      data: {
        name: campaignName || 'Unnamed Campaign',
        content: baseContent,
        authorId: author.id,
        channel: channel || 'SMS',
        sentCount: 0,
        failedCount: 0
      }
    })
    
    const logsToCreate: any[] = []
    const smsMessagesToCreate: any[] = []

    let accountDailyLimit = 1
    const limitSetting = await prisma.systemSetting.findUnique({ where: { key: "sms_daily_account_limit" } })
    if (limitSetting && limitSetting.value) {
      accountDailyLimit = parseInt(limitSetting.value, 10) || 1
    }

    if (channel === 'SMS') {
      const accessToken = await getZohoAccessToken()
      if (!accessToken) {
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: "Failed to authenticate with Zoho Voice API. Make sure ZOHO_REFRESH_TOKEN is set." })
        }
      }

      let fromNumber = bodyFromNumber || process.env.ZOHO_VOICE_FROM_NUMBER || ''
      if (!fromNumber) {
        const setting = await prisma.systemSetting.findUnique({ where: { key: "zoho_phone_numbers" } })
        if (setting && setting.value) {
          try {
            const parsed = JSON.parse(setting.value)
            const defaultNum = parsed.find((n: any) => n.isDefault) || parsed[0]
            if (defaultNum && defaultNum.number) {
              fromNumber = defaultNum.number
            }
          } catch(e) {}
        }
      }

      if (!fromNumber) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: "No outbound SMS number configured. Please configure one in Admin > Communications." })
        }
      }

      // Pre-fetch MMS image if applicable so we don't fetch it repeatedly in the loop
      const isMms = !!imageUrl
      let preFetchedImageBuffer: Buffer | null = null
      let preFetchedImageContentType = 'image/jpeg'
      let preFetchedImageExt = 'jpg'

      if (isMms) {
        try {
          if (imageUrl.startsWith('data:')) {
            const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
            if (match) {
              preFetchedImageContentType = match[1]
              preFetchedImageBuffer = Buffer.from(match[2], 'base64')
              preFetchedImageExt = preFetchedImageContentType.split('/')[1] || 'jpg'
            }
          } else {
            const imgRes = await fetch(imageUrl)
            if (imgRes.ok) {
              preFetchedImageBuffer = Buffer.from(await imgRes.arrayBuffer())
              preFetchedImageContentType = imgRes.headers.get('content-type') || 'image/jpeg'
              preFetchedImageExt = preFetchedImageContentType.split('/')[1] || 'jpg'
            }
          }
        } catch (err) {
          console.error("Error pre-fetching MMS media:", err)
        }
      }

      for (const account of accounts) {
        // Check daily limit for this account
        const recentLogs = await prisma.campaignLog.count({
          where: {
            accountId: account.id,
            status: 'SUCCESS',
            sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          }
        })

        if (recentLogs >= accountDailyLimit) {
          console.log(`Account ${account.name} has reached the daily limit of ${accountDailyLimit}. Skipping.`)
          logsToCreate.push({
            blastId: blast.id,
            accountId: account.id,
            status: 'FAILED',
            errorMessage: 'Daily blast limit reached for this account',
            zohoNumberUsed: fromNumber
          })
          failedCount++
          continue
        }

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
          
          const smsData = {
            customerNumber: phoneNumber,
            message: text || campaignName || 'Titan Diamond Update',
            senderId: fromNumber,
            mms: isMms
          }
          
          const formData = new FormData()
          formData.append('sms_data', JSON.stringify(smsData))

          if (isMms && preFetchedImageBuffer) {
            formData.append('mms_media', preFetchedImageBuffer, {
              filename: `attachment.${preFetchedImageExt}`,
              contentType: preFetchedImageContentType
            })
          }

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
             logsToCreate.push({
               blastId: blast.id,
               accountId: account.id,
               status: 'SUCCESS',
               zohoNumberUsed: fromNumber
             })
             smsMessagesToCreate.push({
               accountId: account.id,
               authorId: author.id,
               fromNumber: fromNumber,
               toNumber: phoneNumber,
               body: text || campaignName || 'Titan Diamond Update',
               direction: 'OUTBOUND',
               campaignBlastId: blast.id
             })
          } else {
             console.error(`Zoho Voice API failed for ${phoneNumber}:`, resultText)
             failedCount++
             logsToCreate.push({
               blastId: blast.id,
               accountId: account.id,
               status: 'FAILED',
               errorMessage: resultJson.message || 'Zoho API Error',
               zohoNumberUsed: fromNumber
             })
          }
          // Add a small delay to avoid hitting rate limits
          await new Promise(resolve => setTimeout(resolve, 200))

        } catch (e: any) {
          console.error(`Error sending SMS to ${phoneNumber}:`, e)
          failedCount++
          logsToCreate.push({
             blastId: blast.id,
             accountId: account.id,
             status: 'FAILED',
             errorMessage: e.message || 'Unknown Exception',
             zohoNumberUsed: fromNumber
          })
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
        logsToCreate.push({
          blastId: blast.id,
          accountId: account.id,
          status: 'SUCCESS',
          zohoNumberUsed: 'Mock Sender'
        })
      }
    }

    if (notesToCreate.length > 0) {
      await prisma.note.createMany({
        data: notesToCreate
      })
    }
    
    if (logsToCreate.length > 0) {
      await prisma.campaignLog.createMany({
        data: logsToCreate
      })
    }
    
    if (smsMessagesToCreate.length > 0) {
      await prisma.smsMessage.createMany({
        data: smsMessagesToCreate
      })
    }

    await prisma.campaignBlast.update({
      where: { id: blast.id },
      data: {
        sentCount: successfulCount,
        failedCount: failedCount
      }
    })

    console.log(`Campaign "${campaignName || 'Unnamed'}" processed. Success: ${successfulCount}, Failed: ${failedCount}`)
    
    let resultMessage = channel === 'SMS' 
      ? `Campaign sent successfully to ${successfulCount} customers. Failed: ${failedCount}`
      : `Campaign mock sent successfully to ${successfulCount} customers.`

    if (channel === 'SMS' && failedCount > 0 && successfulCount === 0) {
      resultMessage += ` (Hint: Check if your Zoho number is SMS/MMS approved, and verify image size is under 1MB)`
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: successfulCount > 0, 
        message: resultMessage,
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
