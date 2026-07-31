import { schedule } from "@netlify/functions"
import fetch from "node-fetch"
import FormData from "form-data"
import { getZohoAccessToken } from "./lib/zoho-auth"
import { prisma } from "./lib/prisma"

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
    const accessToken = await getZohoAccessToken()
    if (!accessToken) {
      console.error("Failed to authenticate with Zoho Voice API for scheduled batch.")
      return { statusCode: 500 }
    }

    for (const msg of messages) {
      const contact = msg.account.contacts.find((c: any) => c.isPrimary) || msg.account.contacts[0]
      const rawPhoneNumber = contact?.mobilePhone || contact?.phone

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

      // Format number
      let phoneNumber = rawPhoneNumber.replace(/[^\d+]/g, "")
      if (phoneNumber.length === 10 && !phoneNumber.startsWith("+")) phoneNumber = "+1" + phoneNumber
      else if (!phoneNumber.startsWith("+") && phoneNumber.length > 10) phoneNumber = "+" + phoneNumber

      try {
        const isMms = !!msg.imageUrl
        let imageBuffer: Buffer | null = null
        let imageContentType = "image/jpeg"
        let imageExt = "jpg"

        if (isMms && msg.imageUrl) {
          try {
            if (msg.imageUrl.startsWith("data:")) {
              const match = msg.imageUrl.match(/^data:([^;]+);base64,(.+)$/)
              if (match) {
                imageContentType = match[1]
                imageBuffer = Buffer.from(match[2], "base64")
                imageExt = imageContentType.split("/")[1] || "jpg"
              }
            } else {
              const imgRes = await fetch(msg.imageUrl)
              if (imgRes.ok) {
                imageBuffer = Buffer.from(await imgRes.arrayBuffer())
                imageContentType = imgRes.headers.get("content-type") || "image/jpeg"
                imageExt = imageContentType.split("/")[1] || "jpg"
              }
            }
          } catch (err) {
            console.error(`Error loading scheduled MMS media for msg ${msg.id}:`, err)
          }
        }

        const zohoVoiceUrl = `https://voice.zoho.${process.env.ZOHO_DC || "com"}/rest/json/v2/sms/send`
        const smsData = { customerNumber: phoneNumber, message: msg.body || "Titan Diamond Update", senderId: msg.fromNumber, mms: isMms }
        const formData = new FormData()
        formData.append("sms_data", JSON.stringify(smsData))
        if (isMms && imageBuffer) {
          formData.append("mms_media", imageBuffer, { filename: `attachment.${imageExt}`, contentType: imageContentType })
        }

        const smsRes = await fetch(zohoVoiceUrl, {
          method: "POST",
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, ...formData.getHeaders() },
          body: formData
        })
        const resultText = await smsRes.text()
        let resultJson: any = {}
        try { resultJson = JSON.parse(resultText) } catch {}

        if (smsRes.ok && resultJson.status !== "error" && resultJson.code !== "error") {
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
          const errMsg = resultJson.message || "Zoho API Error"
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
        status: isDone ? "DONE" : "SCHEDULED"
      }
    })
  } catch (err) {
    console.error("Error updating campaign job progress:", err)
  }
}
