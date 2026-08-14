import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"
import { getZohoAccessToken } from "./lib/zoho-auth"
import FormData from "form-data"

import { prisma } from "./lib/prisma"

const CHUNK_SIZE = 10

async function sendSmsChunk(params: {
  accounts: any[]
  blast: any
  author: any
  text: string
  imageUrl: string | null
  fromNumber: string
  campaignName: string
  channel: string
  accountDailyLimit: number
}) {
  const { accounts, blast, author, text, imageUrl, fromNumber, campaignName, channel, accountDailyLimit } = params
  const tag = `[CAMPAIGN] [${channel || "SMS"}]`
  const campaignLabel = campaignName ? `(Campaign: ${campaignName})` : ""
  let baseContent = `${tag} ${campaignLabel}`.trim()
  if (text) baseContent += `\n\nMessage: ${text}`
  if (imageUrl) {
    const isDataUrl = imageUrl.startsWith("data:")
    const displayUrl = isDataUrl ? `${imageUrl.substring(0, 50)}... [Base64 Image]` : imageUrl
    baseContent += `\n\nAttachment: ${displayUrl}`
  }

  const notesToCreate: any[] = []
  const logsToCreate: any[] = []
  const smsMessagesToCreate: any[] = []
  let successfulCount = 0
  let failedCount = 0

  if (channel === "SMS") {
    const accessToken = await getZohoAccessToken()
    if (!accessToken) {
      throw new Error("Failed to authenticate with Zoho Voice API.")
    }

    const isMms = !!imageUrl
    let preFetchedImageBuffer: Buffer | null = null
    let preFetchedImageContentType = "image/jpeg"
    let preFetchedImageExt = "jpg"

    if (isMms && imageUrl) {
      try {
        if (imageUrl.startsWith("data:")) {
          const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
          if (match) {
            preFetchedImageContentType = match[1]
            preFetchedImageBuffer = Buffer.from(match[2], "base64")
            preFetchedImageExt = preFetchedImageContentType.split("/")[1] || "jpg"
          }
        } else {
          const imgRes = await fetch(imageUrl)
          if (imgRes.ok, { signal: AbortSignal.timeout(15000) }) {
            preFetchedImageBuffer = Buffer.from(await imgRes.arrayBuffer())
            preFetchedImageContentType = imgRes.headers.get("content-type") || "image/jpeg"
            preFetchedImageExt = preFetchedImageContentType.split("/")[1] || "jpg"
          }
        }
      } catch (err) {
        console.error("Error pre-fetching MMS media:", err)
      }
    }



    const recentLogsCounts = await prisma.campaignLog.groupBy({
      by: ["accountId"],
      where: {
        accountId: { in: accounts.map((a) => a.id) },
        status: "SUCCESS",
        sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      _count: true,
    })
    const recentLogsMap = new Map(recentLogsCounts.map((x) => [x.accountId, x._count]))

    await Promise.all(
      accounts.map(async (account, index) => {
        await new Promise((resolve) => setTimeout(resolve, index * 100))
        const recentLogs = recentLogsMap.get(account.id) || 0
        if (recentLogs >= 1) {
          logsToCreate.push({ campaignBlastId: blast.id, accountId: account.id, status: "FAILED", errorMessage: "Daily blast limit reached (maximum 1 campaign message per day)", zohoNumberUsed: fromNumber })
          failedCount++
          return
        }

        const contact = account.contacts.find((c: any) => c.isPrimary) || account.contacts[0]
        const rawPhoneNumber = contact?.mobilePhone || contact?.phone
        if (!rawPhoneNumber) { failedCount++; return }

        let phoneNumber = rawPhoneNumber.replace(/[^\d+]/g, "")
        if (phoneNumber.length === 10 && !phoneNumber.startsWith("+")) phoneNumber = "+1" + phoneNumber
        else if (!phoneNumber.startsWith("+") && phoneNumber.length > 10) phoneNumber = "+" + phoneNumber

        try {
          const zohoVoiceUrl = `https://voice.zoho.${process.env.ZOHO_DC || "com"}/rest/json/v2/sms/send`
          const smsData = { customerNumber: phoneNumber, message: text || campaignName || "Titan Diamond Update", senderId: fromNumber, mms: isMms }
          const formData = new FormData()
          formData.append("sms_data", JSON.stringify(smsData))
          if (isMms && preFetchedImageBuffer) {
            formData.append("mms_media", preFetchedImageBuffer, { filename: `attachment.${preFetchedImageExt}`, contentType: preFetchedImageContentType })
          }
          const smsRes = await fetch(zohoVoiceUrl, { signal: AbortSignal.timeout(15000), method: "POST", headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, ...formData.getHeaders() }, body: formData })
          const resultText = await smsRes.text()
          let resultJson: any = {}
          try { resultJson = JSON.parse(resultText) } catch {}

          if (smsRes.ok && resultJson.status !== "error" && resultJson.code !== "error") {
            successfulCount++
            notesToCreate.push({ accountId: account.id, authorId: author.id, content: baseContent + `\n\n(Sent to ${phoneNumber})`, sentiment: "Neutral", isAutoGenerated: false })
            logsToCreate.push({ campaignBlastId: blast.id, accountId: account.id, status: "SUCCESS", zohoNumberUsed: fromNumber })
            smsMessagesToCreate.push({ accountId: account.id, authorId: author.id, fromNumber, toNumber: phoneNumber, body: text || "Titan Diamond Update", direction: "OUTBOUND", campaignBlastId: blast.id })
          } else {
            failedCount++
            logsToCreate.push({ campaignBlastId: blast.id, accountId: account.id, status: "FAILED", errorMessage: resultJson.message || "Zoho API Error", zohoNumberUsed: fromNumber })
          }
        } catch (e: any) {
          failedCount++
          logsToCreate.push({ campaignBlastId: blast.id, accountId: account.id, status: "FAILED", errorMessage: e.message || "Unknown Exception", zohoNumberUsed: fromNumber })
        }
      })
    )
  } else {
    // Mock for Email/WhatsApp
    for (const account of accounts) {
      successfulCount++
      notesToCreate.push({ accountId: account.id, authorId: author.id, content: baseContent, sentiment: "Neutral", isAutoGenerated: false })
      logsToCreate.push({ campaignBlastId: blast.id, accountId: account.id, status: "SUCCESS", zohoNumberUsed: "Mock Sender" })
    }
  }

  if (notesToCreate.length > 0) await prisma.note.createMany({ data: notesToCreate })
  if (logsToCreate.length > 0) await prisma.campaignLog.createMany({ data: logsToCreate })
  if (smsMessagesToCreate.length > 0) await prisma.smsMessage.createMany({ data: smsMessagesToCreate })
  await prisma.campaignBlast.update({ where: { id: blast.id }, data: { sentCount: { increment: successfulCount }, failedCount: { increment: failedCount } } })

  return { successfulCount, failedCount }
}

function getUtcTimeFromLocal(dateStr: string, timeStr: string, timeZone: string | null | undefined): Date {
  const tz = timeZone || "America/New_York"
  try {
    const localIso = `${dateStr}T${timeStr}:00`
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false
    })
    
    const tempDate = new Date(localIso + 'Z')
    const parts = formatter.formatToParts(tempDate)
    const map = new Map(parts.map(p => [p.type, p.value]))
    
    const year = parseInt(map.get('year')!)
    const month = parseInt(map.get('month')!)
    const day = parseInt(map.get('day')!)
    const hour = parseInt(map.get('hour')!)
    const minute = parseInt(map.get('minute')!)
    const second = parseInt(map.get('second')!)
    
    const formattedUtc = Date.UTC(year, month - 1, day, hour, minute, second)
    const diff = tempDate.getTime() - formattedUtc
    
    return new Date(tempDate.getTime() + diff)
  } catch (e) {
    console.error(`Failed to parse time for timezone ${tz}:`, e)
    return new Date(`${dateStr}T${timeStr}:00`)
  }
}

// ─── CREATE handler ───────────────────────────────────────────────────────────

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }

  try {
    const body = JSON.parse(event.body || "{}")
    const { 
      accountIds, 
      channel, 
      text, 
      imageUrl, 
      campaignName, 
      fromNumber, 
      userId, 
      userEmail,
      isScheduled,
      scheduledDate,
      scheduledTime,
      useAccountTimezone
    } = body

    if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: "No recipients selected" }) }
    }

    // Resolve author
    let author: any = null
    if (userId) author = await prisma.user.findUnique({ where: { id: userId } })
    if (!author && userEmail) author = await prisma.user.findUnique({ where: { email: userEmail } })
    if (!author) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: "No valid user found" }) }
    if (author.canSendCampaigns === false && author.role !== "ADMIN") {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, message: "You do not have permission to send campaigns." }) }
    }

    // Rate limit (skip if scheduled)
    if (!isScheduled) {
      const recentBlast = await prisma.campaignBlast.findFirst({ where: { authorId: author.id, createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } } })
      if (recentBlast && author.role !== "ADMIN") {
        return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Please wait 5 minutes between campaigns." }) }
      }
    }

    // Resolve fromNumber
    let resolvedFromNumber = fromNumber || process.env.ZOHO_VOICE_FROM_NUMBER || ""
    if (!resolvedFromNumber) {
      const setting = await prisma.systemSetting.findUnique({ where: { key: "zoho_phone_numbers" } })
      if (setting?.value) {
        try {
          const parsed = JSON.parse(setting.value)
          const defaultNum = parsed.find((n: any) => n.isDefault) || parsed[0]
          if (defaultNum?.number) resolvedFromNumber = defaultNum.number
        } catch {}
      }
    }

    // Base note content structure
    const tag = `[CAMPAIGN] [${channel || "SMS"}]`
    const campaignLabel = campaignName ? `(Campaign: ${campaignName})` : ""
    let baseContent = `${tag} ${campaignLabel}`.trim()
    if (text) baseContent += `\n\nMessage: ${text}`
    if (imageUrl) {
      const isDataUrl = imageUrl.startsWith("data:")
      const displayUrl = isDataUrl ? `${imageUrl.substring(0, 50)}... [Base64 Image]` : imageUrl
      baseContent += `\n\nAttachment: ${displayUrl}`
    }

    // Create the blast record
    const blast = await prisma.campaignBlast.create({
      data: { name: campaignName || "Unnamed Campaign", content: baseContent, authorId: author.id, channel: channel || "SMS", sentCount: 0, failedCount: 0 },
    })

    if (isScheduled && scheduledDate && scheduledTime) {
      // Schedule flow: get account details & resolve scheduled UTC times
      const accounts = await prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, timeZone: true }
      })

      const scheduledMessages = accounts.map(account => {
        const tz = useAccountTimezone ? account.timeZone : "America/New_York"
        const scheduledTimeUtc = getUtcTimeFromLocal(scheduledDate, scheduledTime, tz)
        return {
          accountId: account.id,
          authorId: author.id,
          campaignBlastId: blast.id,
          channel: channel || "SMS",
          fromNumber: resolvedFromNumber,
          body: text || "",
          imageUrl: imageUrl || null,
          scheduledTime: scheduledTimeUtc,
          status: "PENDING"
        }
      })

      await prisma.scheduledMessage.createMany({
        data: scheduledMessages
      })

      // Create CampaignJob record marked as SCHEDULED
      const job = await prisma.campaignJob.create({
        data: {
          authorId: author.id,
          blastId: blast.id,
          status: "SCHEDULED",
          campaignName: campaignName || "Unnamed Campaign",
          channel: channel || "SMS",
          text: text || "",
          imageUrl: imageUrl || null,
          fromNumber: resolvedFromNumber,
          accountIds: accountIds,
          currentIndex: 0,
          total: accountIds.length,
        },
      })

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, jobId: job.id, blastId: blast.id, status: "SCHEDULED", progress: 0, total: accountIds.length, sentCount: 0, failedCount: 0 }),
      }
    }

    // Create CampaignJob in DB for immediate sending
    const job = await prisma.campaignJob.create({
      data: {
        authorId: author.id,
        blastId: blast.id,
        status: "RUNNING",
        campaignName: campaignName || "Unnamed Campaign",
        channel: channel || "SMS",
        text: text || "",
        imageUrl: imageUrl || null,
        fromNumber: resolvedFromNumber,
        accountIds: accountIds,
        currentIndex: 0,
        total: accountIds.length,
      },
    })

    // Process first chunk immediately
    const firstChunkIds = accountIds.slice(0, CHUNK_SIZE)
    const firstAccounts = await prisma.account.findMany({ where: { id: { in: firstChunkIds } }, include: { contacts: true } })
    const limitRow = await prisma.systemSetting.findUnique({ where: { key: 'sms_daily_account_limit' } })
    const accountDailyLimit = limitRow ? parseInt(limitRow.value, 10) || 1 : 1
    const { successfulCount, failedCount } = await sendSmsChunk({ accounts: firstAccounts, blast, author, text, imageUrl, fromNumber: resolvedFromNumber, campaignName, channel, accountDailyLimit })

    const newIndex = Math.min(CHUNK_SIZE, accountIds.length)
    const isDone = newIndex >= accountIds.length
    await prisma.campaignJob.update({
      where: { id: job.id },
      data: { currentIndex: newIndex, sentCount: successfulCount, failedCount, status: isDone ? "DONE" : "RUNNING" },
    })

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, jobId: job.id, blastId: blast.id, progress: newIndex, total: accountIds.length, sentCount: successfulCount, failedCount }),
    }
  } catch (error: any) {
    console.error("campaign-job-create error:", error)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, message: error.message || "Internal server error" }) }
  }
}
