import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"
import { getZohoAccessToken } from "./lib/zoho-auth"
import FormData from "form-data"

import { prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ success: false }) }

  try {
    const { testPhone, channel, text, imageUrl, fromNumber, userId, userEmail } = JSON.parse(event.body || "{}")

    if (!testPhone) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Missing testPhone" }) }
    if (!text && !imageUrl) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: "No message content to send" }) }

    // Sanitize phone
    let phoneNumber = testPhone.replace(/[^\d+]/g, "")
    if (phoneNumber.length === 10 && !phoneNumber.startsWith("+")) phoneNumber = "+1" + phoneNumber
    else if (!phoneNumber.startsWith("+") && phoneNumber.length > 10) phoneNumber = "+" + phoneNumber

    if (channel === "SMS" || !channel) {
      // Resolve fromNumber
      let resolvedFrom = fromNumber || process.env.ZOHO_VOICE_FROM_NUMBER || ""
      if (!resolvedFrom) {
        const setting = await prisma.systemSetting.findUnique({ where: { key: "zoho_phone_numbers" } })
        if (setting?.value) {
          try {
            const parsed = JSON.parse(setting.value)
            const defaultNum = parsed.find((n: any) => n.isDefault) || parsed[0]
            if (defaultNum?.number) resolvedFrom = defaultNum.number
          } catch {}
        }
      }

      const accessToken = await getZohoAccessToken()
      if (!accessToken) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Failed to authenticate with Zoho Voice API." }) }

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

      const zohoVoiceUrl = `https://voice.zoho.${process.env.ZOHO_DC || "com"}/rest/json/v2/sms/send`
      const smsData = { customerNumber: phoneNumber, message: text || "Titan Diamond — Test Message", senderId: resolvedFrom, mms: isMms }
      const formData = new FormData()
      formData.append("sms_data", JSON.stringify(smsData))
      if (isMms && preFetchedImageBuffer) formData.append("mms_media", preFetchedImageBuffer, { filename: `attachment.${preFetchedImageExt}`, contentType: preFetchedImageContentType })

      const smsRes = await fetch(zohoVoiceUrl, { signal: AbortSignal.timeout(15000), method: "POST", headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, ...formData.getHeaders() }, body: formData })
      const resultText = await smsRes.text()
      let resultJson: any = {}
      try { resultJson = JSON.parse(resultText) } catch {}

      if (smsRes.ok && resultJson.status !== "error" && resultJson.code !== "error") {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: `Test sent to ${phoneNumber}` }) }
      } else {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: false, message: resultJson.message || "Zoho API Error sending test" }) }
      }
    }

    // Mock for non-SMS
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: `Test sent to ${phoneNumber} (mock)` }) }
  } catch (error: any) {
    console.error("campaign-job-test-send error:", error)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, message: error.message || "Internal server error" }) }
  }
}
