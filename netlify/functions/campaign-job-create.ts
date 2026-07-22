import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { corsHeaders, handleOptions } from "./lib/cors"
import { getZohoAccessToken } from "./lib/zoho-auth"
import fetch from "node-fetch"
import FormData from "form-data"

const prisma = new PrismaClient()

const CHUNK_SIZE = 2

async function sendSmsChunk(params: {
  accounts: any[]
  blast: any
  author: any
  text: string
  imageUrl: string | null
  fromNumber: string
  campaignName: string
  channel: string
}) {
  const { accounts, blast, author, text, imageUrl, fromNumber, campaignName, channel } = params
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
          if (imgRes.ok) {
            preFetchedImageBuffer = Buffer.from(await imgRes.arrayBuffer())
            preFetchedImageContentType = imgRes.headers.get("content-type") || "image/jpeg"
            preFetchedImageExt = preFetchedImageContentType.split("/")[1] || "jpg"
          }
        }
      } catch (err) {
        console.error("Error pre-fetching MMS media:", err)
      }
    }

    const accountDailyLimit = await (async () => {
      const limitSetting = await prisma.systemSetting.findUnique({ where: { key: "sms_daily_account_limit" } })
      return limitSetting ? parseInt(limitSetting.value, 10) || 1 : 1
    })()

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
        if (recentLogs >= accountDailyLimit) {
          logsToCreate.push({ campaignBlastId: blast.id, accountId: account.id, status: "FAILED", errorMessage: "Daily blast limit reached", zohoNumberUsed: fromNumber })
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
          const smsRes = await fetch(zohoVoiceUrl, { method: "POST", headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, ...formData.getHeaders() }, body: formData })
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

// ─── CREATE handler ───────────────────────────────────────────────────────────

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }

  try {
    const body = JSON.parse(event.body || "{}")
    const { accountIds, channel, text, imageUrl, campaignName, fromNumber, userId, userEmail } = body

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

    // Rate limit
    const recentBlast = await prisma.campaignBlast.findFirst({ where: { authorId: author.id, createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } } })
    if (recentBlast && author.role !== "ADMIN") {
      return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Please wait 5 minutes between campaigns." }) }
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

    // Create CampaignJob in DB
    const job = await prisma.campaignJob.create({
      data: {
        authorId: author.id,
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

    // Create the blast record
    const tag = `[CAMPAIGN] [${channel || "SMS"}]`
    const campaignLabel = campaignName ? `(Campaign: ${campaignName})` : ""
    let baseContent = `${tag} ${campaignLabel}`.trim()
    if (text) baseContent += `\n\nMessage: ${text}`

    const blast = await prisma.campaignBlast.create({
      data: { name: campaignName || "Unnamed Campaign", content: baseContent, authorId: author.id, channel: channel || "SMS", sentCount: 0, failedCount: 0 },
    })

    // Update job with blastId
    await prisma.campaignJob.update({ where: { id: job.id }, data: { blastId: blast.id } })

    // Process first chunk immediately
    const firstChunkIds = accountIds.slice(0, CHUNK_SIZE)
    const firstAccounts = await prisma.account.findMany({ where: { id: { in: firstChunkIds } }, include: { contacts: true } })
    const { successfulCount, failedCount } = await sendSmsChunk({ accounts: firstAccounts, blast, author, text, imageUrl, fromNumber: resolvedFromNumber, campaignName, channel })

    const newIndex = Math.min(CHUNK_SIZE, accountIds.length)
    const isDone = newIndex >= accountIds.length
    await prisma.campaignJob.update({
      where: { id: job.id },
      data: { currentIndex: newIndex, sentCount: successfulCount, failedCount, status: isDone ? "DONE" : "RUNNING" },
    })

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, jobId: job.id, progress: newIndex, total: accountIds.length, sentCount: successfulCount, failedCount }),
    }
  } catch (error: any) {
    console.error("campaign-job-create error:", error)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, message: error.message || "Internal server error" }) }
  }
}
