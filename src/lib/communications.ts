import { prisma } from "@/lib/prisma"

type PhoneContact = {
  isPrimary?: boolean | null
  phone?: string | null
  mobilePhone?: string | null
}

type AccountWithContacts = {
  contacts?: PhoneContact[]
} | null | undefined

type StoredVoiceNumber = {
  number?: string
  isDefault?: boolean
}

type ZohoVoiceCallResult = {
  success: boolean
  zohoCallId?: string
  fromNumber?: string
  toNumber?: string
  error?: string
  status?: number
  raw?: unknown
}

export function normalizePhoneNumber(rawPhoneNumber: string | null | undefined) {
  if (!rawPhoneNumber) return ""

  let phoneNumber = rawPhoneNumber.replace(/[^\d+]/g, "")
  if (phoneNumber.length === 10 && !phoneNumber.startsWith("+")) {
    phoneNumber = `+1${phoneNumber}`
  } else if (!phoneNumber.startsWith("+") && phoneNumber.length > 10) {
    phoneNumber = `+${phoneNumber}`
  }

  return phoneNumber
}

export async function resolveAccount(accountId: string | null | undefined) {
  if (!accountId || accountId === "unknown") return null

  return prisma.account.findFirst({
    where: {
      OR: [
        { id: accountId },
        { zohoId: accountId },
      ],
    },
    include: { contacts: true },
  })
}

export async function resolveOutboundVoiceNumber(requestedNumber?: string | null) {
  if (requestedNumber && requestedNumber !== "System") {
    return normalizePhoneNumber(requestedNumber)
  }

  if (process.env.ZOHO_VOICE_FROM_NUMBER) {
    return normalizePhoneNumber(process.env.ZOHO_VOICE_FROM_NUMBER)
  }

  const setting = await prisma.systemSetting.findUnique({ where: { key: "zoho_phone_numbers" } })
  if (setting?.value) {
    try {
      const numbers = JSON.parse(setting.value)
      if (Array.isArray(numbers)) {
        const defaultNumber = (numbers as StoredVoiceNumber[]).find((n) => n?.isDefault) || numbers[0]
        if (defaultNumber?.number) return normalizePhoneNumber(defaultNumber.number)
      }
    } catch {
      return ""
    }
  }

  return ""
}

export function getPrimaryAccountPhone(account: AccountWithContacts) {
  const contact = account?.contacts?.find((c) => c.isPrimary) || account?.contacts?.[0]
  return normalizePhoneNumber(contact?.mobilePhone || contact?.phone)
}

function parseZohoCallId(result: Record<string, unknown>) {
  const data = result.data
  const firstDataItem = Array.isArray(data) ? data[0] : data

  if (firstDataItem && typeof firstDataItem === "object") {
    const item = firstDataItem as Record<string, unknown>
    return String(item.call_id || item.callId || item.id || item.call_uuid || "")
  }

  return String(result.call_id || result.callId || result.id || result.call_uuid || "")
}

function isZohoVoiceCallSuccess(result: Record<string, unknown>) {
  const status = String(result.status || result.code || "").toLowerCase()
  const message = String(result.message || "").toLowerCase()
  const data = result.data
  const firstDataItem = Array.isArray(data) ? data[0] : data
  const itemCode = firstDataItem && typeof firstDataItem === "object"
    ? String((firstDataItem as Record<string, unknown>).code || "").toLowerCase()
    : ""

  if (status === "error" || status === "failure" || result.error) return false
  if (itemCode === "error" || itemCode === "failure") return false
  if (status === "success" || status === "ok" || itemCode === "success") return true
  if (parseZohoCallId(result)) return true
  if (message.includes("initiated") || message.includes("success")) return true

  return false
}

export async function initiateZohoVoiceCall(params: {
  accessToken: string
  fromNumber?: string | null
  toNumber?: string | null
}): Promise<ZohoVoiceCallResult> {
  const callerId = await resolveOutboundVoiceNumber(params.fromNumber)
  const destinationNumber = normalizePhoneNumber(params.toNumber)

  if (!destinationNumber) {
    return { success: false, error: "Missing destination number", status: 400 }
  }

  if (!callerId) {
    return {
      success: false,
      error: "No outbound Zoho Voice number is configured. Configure one in Admin > Communications.",
      status: 400,
    }
  }

  const zohoDc = process.env.ZOHO_DC || "com"
  const callUrl = process.env.ZOHO_VOICE_CALL_URL || `https://voice.zoho.${zohoDc}/api/v1/call`
  const response = await fetch(callUrl, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from_number: callerId,
      to_number: destinationNumber,
    }),
  })

  const resultText = await response.text()
  let resultJson: Record<string, unknown> = {}
  try {
    resultJson = JSON.parse(resultText)
  } catch {
    resultJson = {}
  }

  if (!response.ok || !isZohoVoiceCallSuccess(resultJson)) {
    const error = String(resultJson.message || resultJson.error || resultText || "Zoho Voice rejected the call request")
    return {
      success: false,
      error,
      status: response.ok ? 502 : response.status,
      raw: resultJson,
    }
  }

  return {
    success: true,
    zohoCallId: parseZohoCallId(resultJson) || `zv_call_${Date.now()}`,
    fromNumber: callerId,
    toNumber: destinationNumber,
    status: response.status,
    raw: resultJson,
  }
}
