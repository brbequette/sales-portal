import { withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"
import { getZohoVoiceAccessToken } from "./lib/zoho-voice-auth"
import { evaluateZohoSmsResponse } from "./lib/zoho-sms-response"
import { buildZohoSmsFormData, loadZohoMmsMedia } from "./lib/zoho-mms-media"
import { normalizeSingleRecipient } from "../../src/lib/mms-canary"
import { guardSmsSend } from "../../src/lib/sms-suppression"

import { prisma } from "./lib/prisma"

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "Internal server error"
}

const authenticatedHandler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ success: false }) }

  try {
    const { testPhone, channel, text, imageUrl, fromNumber } = asRecord(JSON.parse(event.body || "{}"))
    const testPhoneValue = String(testPhone || "")
    const channelValue = String(channel || "")
    const textValue = String(text || "")
    const imageUrlValue = String(imageUrl || "")
    const fromNumberValue = String(fromNumber || "")

    if (!testPhoneValue) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Missing testPhone" }) }
    if (!textValue && !imageUrlValue) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: "No message content to send" }) }

    let phoneNumber = ""
    try {
      phoneNumber = normalizeSingleRecipient(testPhoneValue)
    } catch (validationError: unknown) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: messageFrom(validationError) }) }
    }

    if (channelValue === "SMS" || !channelValue) {
      const guard = await guardSmsSend({ phone: phoneNumber, traffic: "TEST" })
      if (!guard.allowed) return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ success: false, message: guard.reason || "Recipient is suppressed", suppression: guard }) }
      // Resolve fromNumber
      let resolvedFrom = fromNumberValue || process.env.ZOHO_VOICE_FROM_NUMBER || ""
      if (!resolvedFrom) {
        const setting = await prisma.systemSetting.findUnique({ where: { key: "zoho_phone_numbers" } })
        if (setting?.value) {
          try {
            const parsed = JSON.parse(setting.value) as unknown
            const numbers = Array.isArray(parsed) ? parsed.map(asRecord) : []
            const defaultNum = numbers.find((number) => number.isDefault) || numbers[0]
            if (defaultNum?.number) resolvedFrom = String(defaultNum.number)
          } catch {}
        }
      }
      try {
        resolvedFrom = normalizeSingleRecipient(String(resolvedFrom))
      } catch (validationError: unknown) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: messageFrom(validationError) }) }
      }

      const accessToken = await getZohoVoiceAccessToken()
      if (!accessToken) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Failed to authenticate with Zoho Voice API." }) }

      const isMms = !!imageUrlValue
      const mmsMedia = isMms ? await loadZohoMmsMedia(imageUrlValue) : null

      const zohoVoiceUrl = `https://voice.zoho.${process.env.ZOHO_DC || "com"}/rest/json/v2/sms/send`
      const formData = buildZohoSmsFormData({ customerNumber: phoneNumber, message: textValue || "Titan Diamond — Test Message", senderId: resolvedFrom, media: mmsMedia })
      const smsRes = await fetch(zohoVoiceUrl, { signal: AbortSignal.timeout(30000), method: "POST", headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: "application/json" }, body: formData })
      const resultText = await smsRes.text()
      let resultJson: Record<string, unknown> = {}
      try { resultJson = asRecord(JSON.parse(resultText)) } catch { resultJson = { raw: resultText } }

      const providerResult = evaluateZohoSmsResponse(smsRes, resultText)
      const providerError = asRecord(resultJson.error)
      const providerData = asRecord(resultJson.data)
      const providerNestedResult = asRecord(resultJson.result)
      const providerCode = resultJson.code || providerError.code || null
      const providerStatus = resultJson.status || providerData.status || providerNestedResult.status || null
      const providerMessage = resultJson.message || providerError.message || null
      const provider = {
        httpStatus: smsRes.status,
        accepted: providerResult.accepted,
        code: providerCode,
        status: providerStatus,
        message: providerMessage,
        id: providerResult.providerId,
        response: resultJson,
      }
      if (providerResult.accepted) {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: `Test sent to ${phoneNumber}`, recipient: phoneNumber, sender: resolvedFrom, provider }) }
      } else {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: false, message: providerResult.errorMessage, recipient: phoneNumber, sender: resolvedFrom, provider }) }
      }
    }

    return { statusCode: 501, headers: corsHeaders, body: JSON.stringify({ success: false, message: `${channelValue || "Requested"} test provider is not configured` }) }
  } catch (error: unknown) {
    console.error("campaign-job-test-send error:", error)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, message: messageFrom(error) }) }
  }
}

export const handler = withFunctionAuth(authenticatedHandler, { requireAdmin: true })
