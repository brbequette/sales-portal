/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { schedule } from "@netlify/functions"
import { getZohoVoiceAccessToken } from "./lib/zoho-voice-auth"
import { evaluateZohoSmsResponse } from "./lib/zoho-sms-response"
import { buildZohoSmsFormData, loadZohoMmsMedia } from "./lib/zoho-mms-media"
import { prisma } from "./lib/prisma"
import { guardSmsSend } from "../../src/lib/sms-suppression"
import { sendEmail } from "./lib/zoho-mail"

// Runs every 10 minutes to process scheduled texts
export const handler = schedule("*/10 * * * *", async () => {
  console.log("=== Process Scheduled Messages Started ===")
  const now = new Date()

  try {
    // 1. Fetch pending scheduled messages that are due
    const messages = await prisma.scheduledMessage.findMany({
      where: {
        status: "PENDING",
        scheduledTime: { lte: now }
      },
      take: 20, // process in small batches of 20 to fit within timeout
      include: {
        account: {
          include: { contacts: true }
        },
        author: true
      }
    })

    if (messages.length === 0) {
      console.log("No pending scheduled messages due.")
      return { statusCode: 200 }
    }

    console.log(`Processing ${messages.length} due scheduled messages...`)

    // Get Zoho voice token once for the batch
    const accessToken = await getZohoVoiceAccessToken()
    if (!accessToken) {
      console.error("Failed to authenticate with Zoho Voice API; scheduled email can continue but SMS items will fail.")
    }

    for (const msg of messages) {
      const contact = msg.contactId ? msg.account.contacts.find((c: any) => c.id === msg.contactId) : (msg.account.contacts.find((c: any) => c.isPrimary) || msg.account.contacts[0])

      if (msg.channel === "EMAIL") {
        const toAddress = contact?.email
        if (!toAddress) {
          await prisma.scheduledMessage.update({ where: { id: msg.id }, data: { status: "FAILED", errorMessage: "Account has no primary contact email", sentAt: now } })
          continue
        }
        try {
          const zohoAccountId = process.env.ZOHO_MAIL_ACCOUNT_ID
          const fromAddress = process.env.COMPANY_FROM_EMAIL
          if (!zohoAccountId || !fromAddress) throw new Error("Zoho Mail sender is not configured")
          const result = await sendEmail(zohoAccountId, { fromAddress, toAddress, subject: msg.fromNumber, content: msg.body })
          const providerMessageId = String(result.data?.messageId || "").trim()
          if (!providerMessageId) throw new Error(result.status?.description || "Zoho Mail returned no message ID")
          await prisma.$transaction([
            prisma.scheduledMessage.update({ where: { id: msg.id }, data: { status: "SENT", sentAt: now } }),
            prisma.email.create({ data: { zohoMailId: providerMessageId, zohoAccountId, subject: msg.fromNumber, body: msg.body, fromAddress, toAddress, direction: "OUTBOUND", status: "REPLIED", sentAt: now, accountId: msg.accountId, contactId: contact?.id || null, userId: msg.authorId } }),
            prisma.communicationEvent.create({ data: { accountId: msg.accountId, contactId: contact?.id || null, actorId: msg.authorId, channel: "EMAIL", direction: "OUTBOUND", eventType: "AUTODIALER_EMAIL_SENT", sourceType: "ScheduledMessage", sourceId: msg.id, subject: msg.fromNumber, summary: msg.body.slice(0, 1000), occurredAt: now } }),
          ])
        } catch (error: any) {
          await prisma.scheduledMessage.update({ where: { id: msg.id }, data: { status: "FAILED", errorMessage: error.message || "Scheduled email failed", sentAt: now } })
        }
        continue
      }
      const rawPhoneNumber = contact?.mobilePhone || contact?.phone

      if (!accessToken) {
        await prisma.scheduledMessage.update({ where: { id: msg.id }, data: { status: "FAILED", errorMessage: "Zoho Voice is not authenticated", sentAt: now } })
        continue
      }

      if (!rawPhoneNumber) {
        await prisma.scheduledMessage.update({
          where: { id: msg.id },
          data: { status: "FAILED", errorMessage: "Account has no valid phone number", sentAt: now }
        })
        
        // Log in campaign blast
        if (msg.campaignBlastId) {
          await prisma.campaignBlast.update({
            where: { id: msg.campaignBlastId },
            data: { failedCount: { increment: 1 } }
          })
          await prisma.campaignLog.create({
            data: {
              campaignBlastId: msg.campaignBlastId,
              accountId: msg.accountId,
              status: "FAILED",
              errorMessage: "Account has no valid phone number",
              zohoNumberUsed: msg.fromNumber
            }
          })
          await updateJobProgress(msg.campaignBlastId, 0, 1)
        }
        continue
      }

      // Check if current time is within business hours in recipient's timezone
      const accountTz = msg.account.timeZone
      if (accountTz) {
        try {
          const localTime = new Date().toLocaleString('en-US', { timeZone: accountTz, hour: 'numeric', hour12: false })
          const localHour = parseInt(localTime, 10)
          // If outside 8 AM - 6 PM local time, reschedule to 8 AM tomorrow in their TZ
          if (localHour < 8 || localHour >= 18) {
            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            // Calculate 8 AM in the recipient's timezone
            const nextDelivery = new Date(tomorrow.toLocaleDateString('en-US', { timeZone: accountTz }) + ' 08:00:00')
            await prisma.scheduledMessage.update({
              where: { id: msg.id },
              data: { scheduledTime: nextDelivery }
            })
            console.log(`[scheduled-messages] Deferred msg ${msg.id} to ${nextDelivery.toISOString()} for TZ ${accountTz}`)
            continue
          }
        } catch (tzErr) {
          console.warn(`[scheduled-messages] TZ check failed for ${accountTz}:`, tzErr)
          // Continue with send if TZ check fails
        }
      }

      // Format number
      let phoneNumber = rawPhoneNumber.replace(/[^\d+]/g, "")
      if (phoneNumber.length === 10 && !phoneNumber.startsWith("+")) phoneNumber = "+1" + phoneNumber
      else if (!phoneNumber.startsWith("+") && phoneNumber.length > 10) phoneNumber = "+" + phoneNumber

      const guard = await guardSmsSend({ phone: phoneNumber, traffic: msg.campaignBlastId ? "PROMOTIONAL" : "TRANSACTIONAL" })
      if (!guard.allowed) {
        await prisma.scheduledMessage.update({ where: { id: msg.id }, data: { status: "FAILED", errorMessage: `Suppressed: ${guard.reason}`, sentAt: now } })
        if (msg.campaignBlastId) { await prisma.campaignLog.create({ data: { campaignBlastId: msg.campaignBlastId, accountId: msg.accountId, status: "FAILED", errorMessage: `Suppressed: ${guard.reason}`, zohoNumberUsed: msg.fromNumber } }); await updateJobProgress(msg.campaignBlastId, 0, 1) }
        continue
      }

      try {
        const isMms = !!msg.imageUrl
        const mmsMedia = isMms && msg.imageUrl ? await loadZohoMmsMedia(msg.imageUrl) : null

        const zohoVoiceUrl = `https://voice.zoho.${process.env.ZOHO_DC || "com"}/rest/json/v2/sms/send`
        const formData = buildZohoSmsFormData({ customerNumber: phoneNumber, message: msg.body || "Titan Diamond Update", senderId: msg.fromNumber, media: mmsMedia })
        const smsRes = await fetch(zohoVoiceUrl, { signal: AbortSignal.timeout(30000),
          method: "POST",
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: "application/json" },
          body: formData
        })
        const resultText = await smsRes.text()
        let resultJson: any = {}
        try { resultJson = JSON.parse(resultText) } catch {}

        const providerResult = evaluateZohoSmsResponse(smsRes, resultText)
        if (providerResult.accepted) {
          // Success
          await prisma.scheduledMessage.update({
            where: { id: msg.id },
            data: { status: "SENT", sentAt: now }
          })

          const tag = `[CAMPAIGN] [SMS]`
          const campaignName = msg.campaignBlastId ? "Scheduled Blast" : ""
          const campaignLabel = campaignName ? `(Campaign: ${campaignName})` : ""
          let baseContent = `${tag} ${campaignLabel}`.trim()
          if (msg.body) baseContent += `\n\nMessage: ${msg.body}`
          if (msg.imageUrl) {
            const isDataUrl = msg.imageUrl.startsWith("data:")
            const displayUrl = isDataUrl ? `${msg.imageUrl.substring(0, 50)}... [Base64 Image]` : msg.imageUrl
            baseContent += `\n\nAttachment: ${displayUrl}`
          }

          // Create note, message and log
          await prisma.note.create({
            data: { accountId: msg.accountId, authorId: msg.authorId, content: baseContent + `\n\n(Sent to ${phoneNumber})`, sentiment: "Neutral", isAutoGenerated: false }
          })
          await prisma.smsMessage.create({
            data: { accountId: msg.accountId, authorId: msg.authorId, fromNumber: msg.fromNumber, toNumber: phoneNumber, body: msg.body, direction: "OUTBOUND", campaignBlastId: msg.campaignBlastId }
          })

          if (msg.campaignBlastId) {
            await prisma.campaignBlast.update({
              where: { id: msg.campaignBlastId },
              data: { sentCount: { increment: 1 } }
            })
            await prisma.campaignLog.create({
              data: { campaignBlastId: msg.campaignBlastId, accountId: msg.accountId, status: "SUCCESS", zohoNumberUsed: msg.fromNumber }
            })
            await updateJobProgress(msg.campaignBlastId, 1, 0)
          }
        } else {
          // Failed Zoho validation
          const errMsg = providerResult.errorMessage
          await prisma.scheduledMessage.update({
            where: { id: msg.id },
            data: { status: "FAILED", errorMessage: errMsg, sentAt: now }
          })

          if (msg.campaignBlastId) {
            await prisma.campaignBlast.update({
              where: { id: msg.campaignBlastId },
              data: { failedCount: { increment: 1 } }
            })
            await prisma.campaignLog.create({
              data: { campaignBlastId: msg.campaignBlastId, accountId: msg.accountId, status: "FAILED", errorMessage: errMsg, zohoNumberUsed: msg.fromNumber }
            })
            await updateJobProgress(msg.campaignBlastId, 0, 1)
          }
        }
      } catch (e: any) {
        // Exception
        const errMsg = e.message || "Unknown Exception"
        await prisma.scheduledMessage.update({
          where: { id: msg.id },
          data: { status: "FAILED", errorMessage: errMsg, sentAt: now }
        })

        if (msg.campaignBlastId) {
          await prisma.campaignBlast.update({
            where: { id: msg.campaignBlastId },
            data: { failedCount: { increment: 1 } }
          })
          await prisma.campaignLog.create({
            data: { campaignBlastId: msg.campaignBlastId, accountId: msg.accountId, status: "FAILED", errorMessage: errMsg, zohoNumberUsed: msg.fromNumber }
          })
          await updateJobProgress(msg.campaignBlastId, 0, 1)
        }
      }
    }

    console.log("=== Process Scheduled Messages Completed Successfully ===")
    return { statusCode: 200 }
  } catch (error: any) {
    console.error("Scheduled messages runner encountered an error:", error)
    return { statusCode: 500 }
  }
})

// Helper to update CampaignJob progress
async function updateJobProgress(blastId: string, successInc: number, failInc: number) {
  try {
    const job = await prisma.campaignJob.findFirst({
      where: { blastId }
    })
    if (!job) return

    const newIndex = job.currentIndex + 1
    const newSent = job.sentCount + successInc
    const newFailed = job.failedCount + failInc
    const isDone = newIndex >= job.total

    await prisma.campaignJob.update({
      where: { id: job.id },
      data: {
        currentIndex: Math.min(newIndex, job.total),
        sentCount: newSent,
        failedCount: newFailed,
        status: isDone ? "COMPLETED" : "PAUSED"
      }
    })
  } catch (err) {
    console.error("Error updating campaign job progress:", err)
  }
}
