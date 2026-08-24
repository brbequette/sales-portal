import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"
import { getZohoAccessToken } from "./lib/zoho-auth"
import FormData from "form-data"
import { evaluateZohoSmsResponse } from "./lib/zoho-sms-response"

import { prisma } from "./lib/prisma"
import { isAdministratorRole } from "../../src/lib/roles"
const CHUNK_SIZE = 2

const authenticatedHandler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()
  if (event.httpMethod !== "GET") return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ success: false }) }

  try {
    const session = await authenticateFunction(event as any)
    const author = await prisma.user.findFirst({
      where: {
        OR: [
          session.dbId ? { id: session.dbId } : undefined,
          session.userId ? { id: session.userId } : undefined,
          session.email ? { email: { equals: session.email, mode: "insensitive" } } : undefined,
        ].filter(Boolean) as any,
      },
      select: { id: true },
    })
    if (!author) return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Campaign owner not found" }) }

    const administrator = isAdministratorRole(session.role)

    if (event.queryStringParameters?.recoverLatest === "true") {
      const activeJob = await prisma.campaignJob.findFirst({
        where: { status: "RUNNING", ...(administrator ? {} : { authorId: author.id }) },
        orderBy: { updatedAt: "desc" },
        include: { author: { select: { name: true } } },
      })
      if (!activeJob) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, active: false }) }
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, active: true, jobId: activeJob.id, blastId: activeJob.blastId, status: activeJob.status, progress: activeJob.currentIndex, total: activeJob.total, sentCount: activeJob.sentCount, failedCount: activeJob.failedCount, name: activeJob.campaignName, channel: activeJob.channel, authorName: activeJob.author.name, canAdvance: activeJob.authorId === author.id }),
      }
    }
    const jobId = event.queryStringParameters?.jobId
    if (!jobId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Missing jobId" }) }

    const job = await prisma.campaignJob.findFirst({ where: { id: jobId, ...(administrator ? {} : { authorId: author.id }) }, include: { author: { select: { name: true } } } })
    if (!job) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Job not found" }) }

    if (job.authorId !== author.id || event.queryStringParameters?.observeOnly === "true") {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, status: job.status, blastId: job.blastId, progress: job.currentIndex, total: job.total, sentCount: job.sentCount, failedCount: job.failedCount, name: job.campaignName, authorName: job.author.name, canAdvance: job.authorId === author.id, error: job.errorMessage }),
      }
    }
    // If already done/cancelled/error — just return the state
    if (job.status !== "RUNNING") {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, status: job.status, blastId: job.blastId, progress: job.currentIndex, total: job.total, sentCount: job.sentCount, failedCount: job.failedCount, name: job.campaignName, error: job.errorMessage }),
      }
    }

    // Already finished all recipients
    if (job.currentIndex >= job.total) {
      await prisma.campaignJob.update({ where: { id: jobId }, data: { status: "DONE" } })
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, status: "DONE", blastId: job.blastId, progress: job.total, total: job.total, sentCount: job.sentCount, failedCount: job.failedCount, name: job.campaignName }),
      }
    }

    // Process next chunk
    const accountIds = job.accountIds as string[]
    const chunkIds = accountIds.slice(job.currentIndex, job.currentIndex + CHUNK_SIZE)
    const accounts = await prisma.account.findMany({ where: { id: { in: chunkIds } }, include: { contacts: true } })
    const campaignAuthor = await prisma.user.findUnique({ where: { id: job.authorId } })
    if (!campaignAuthor) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Author not found" }) }

    const blast = job.blastId ? await prisma.campaignBlast.findUnique({ where: { id: job.blastId } }) : null
    if (!blast) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Campaign blast not found" }) }

    let successfulCount = 0
    let failedCount = 0
    const text = job.text
    const imageUrl = job.imageUrl || null
    const fromNumber = job.fromNumber || ""
    const campaignName = job.campaignName
    const channel = job.channel

    const tag = `[CAMPAIGN] [${channel}]`
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

    if (channel === "SMS") {
      const accessToken = await getZohoAccessToken()
      if (!accessToken) throw new Error("Failed to authenticate with Zoho Voice API.")

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
        } catch {}
      }

      const limitSetting = await prisma.systemSetting.findUnique({ where: { key: "sms_daily_account_limit" } })
      const accountDailyLimit = limitSetting ? parseInt(limitSetting.value, 10) || 1 : 1
      const recentLogsCounts = await prisma.campaignLog.groupBy({
        by: ["accountId"],
        where: { accountId: { in: accounts.map((a) => a.id) }, status: "SUCCESS", sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
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
            if (isMms && preFetchedImageBuffer) formData.append("mms_media", preFetchedImageBuffer, { filename: `attachment.${preFetchedImageExt}`, contentType: preFetchedImageContentType })
            const smsRes = await fetch(zohoVoiceUrl, { signal: AbortSignal.timeout(15000), method: "POST", headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, ...formData.getHeaders() }, body: formData as any })
            const resultText = await smsRes.text()
            let resultJson: any = {}
            try { resultJson = JSON.parse(resultText) } catch {}
            const providerResult = evaluateZohoSmsResponse(smsRes, resultText)
            if (providerResult.accepted) {
              successfulCount++
              notesToCreate.push({ accountId: account.id, authorId: campaignAuthor.id, content: baseContent + `\n\n(Sent to ${phoneNumber})`, sentiment: "Neutral", isAutoGenerated: false })
              logsToCreate.push({ campaignBlastId: blast.id, accountId: account.id, status: "SUCCESS", zohoNumberUsed: fromNumber })
              smsMessagesToCreate.push({ accountId: account.id, authorId: campaignAuthor.id, fromNumber, toNumber: phoneNumber, body: text || "Titan Diamond Update", direction: "OUTBOUND", campaignBlastId: blast.id })
            } else {
              failedCount++
              logsToCreate.push({ campaignBlastId: blast.id, accountId: account.id, status: "FAILED", errorMessage: providerResult.errorMessage, zohoNumberUsed: fromNumber })
            }
          } catch (e: any) {
            failedCount++
            logsToCreate.push({ campaignBlastId: blast.id, accountId: account.id, status: "FAILED", errorMessage: e.message || "Unknown Exception", zohoNumberUsed: fromNumber })
          }
        })
      )
    } else {
      for (const account of accounts) {
        successfulCount++
        notesToCreate.push({ accountId: account.id, authorId: campaignAuthor.id, content: baseContent, sentiment: "Neutral", isAutoGenerated: false })
        logsToCreate.push({ campaignBlastId: blast.id, accountId: account.id, status: "SUCCESS", zohoNumberUsed: "Mock Sender" })
      }
    }

    if (notesToCreate.length > 0) await prisma.note.createMany({ data: notesToCreate })
    if (logsToCreate.length > 0) await prisma.campaignLog.createMany({ data: logsToCreate })
    if (smsMessagesToCreate.length > 0) await prisma.smsMessage.createMany({ data: smsMessagesToCreate })
    await prisma.campaignBlast.update({ where: { id: blast.id }, data: { sentCount: { increment: successfulCount }, failedCount: { increment: failedCount } } })

    const newIndex = job.currentIndex + CHUNK_SIZE
    const isDone = newIndex >= job.total

    await prisma.campaignJob.update({
      where: { id: jobId },
      data: { currentIndex: Math.min(newIndex, job.total), sentCount: { increment: successfulCount }, failedCount: { increment: failedCount }, status: isDone ? "DONE" : "RUNNING" },
    })

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, status: isDone ? "DONE" : "RUNNING", blastId: job.blastId, progress: Math.min(newIndex, job.total), total: job.total, sentCount: job.sentCount + successfulCount, failedCount: job.failedCount + failedCount, name: job.campaignName }),
    }
  } catch (error: any) {
    console.error("campaign-job-status error:", error)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, message: error.message || "Internal server error" }) }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
