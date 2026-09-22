import { withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"
import { getZohoVoiceAccessToken } from "./lib/zoho-voice-auth"
import { evaluateZohoSmsResponse } from "./lib/zoho-sms-response"
import { buildZohoSmsFormData, loadZohoMmsMedia } from "./lib/zoho-mms-media"

import { prisma } from "./lib/prisma"

const authenticatedHandler: Handler = async (event) => {
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

      const accessToken = await getZohoVoiceAccessToken()
      if (!accessToken) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Failed to authenticate with Zoho Voice API." }) }

      const isMms = !!imageUrl
      const mmsMedia = isMms && imageUrl ? await loadZohoMmsMedia(imageUrl) : null

      const zohoVoiceUrl = `https://voice.zoho.${process.env.ZOHO_DC || "com"}/rest/json/v2/sms/send`
      const formData = buildZohoSmsFormData({ customerNumber: phoneNumber, message: text || "Titan Diamond — Test Message", senderId: resolvedFrom, media: mmsMedia })
      const smsRes = await fetch(zohoVoiceUrl, { signal: AbortSignal.timeout(30000), method: "POST", headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: "application/json" }, body: formData })
      const resultText = await smsRes.text()
      let resultJson: any = {}
      try { resultJson = JSON.parse(resultText) } catch {}

      const providerResult = evaluateZohoSmsResponse(smsRes, resultText)
      if (providerResult.accepted) {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: `Test sent to ${phoneNumber}` }) }
      } else {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: false, message: providerResult.errorMessage }) }
      }
    }

    return { statusCode: 501, headers: corsHeaders, body: JSON.stringify({ success: false, message: `${channel || "Requested"} test provider is not configured` }) }
  } catch (error: any) {
    console.error("campaign-job-test-send error:", error)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, message: error.message || "Internal server error" }) }
  }
}

export const handler = withFunctionAuth(authenticatedHandler, { requireAdmin: true })
