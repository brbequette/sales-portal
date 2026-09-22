const ALLOWED_MMS_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
])

// Zoho documents a 1,000 KB attachment ceiling. Keep margin for provider-side
// normalization and multipart metadata instead of accepting files at the edge.
export const MAX_MMS_MEDIA_BYTES = 900_000

export type ZohoMmsMedia = {
  bytes: Uint8Array
  contentType: string
  filename: string
}

function normalizeContentType(value: string): string {
  const normalized = value.split(";", 1)[0].trim().toLowerCase()
  return normalized === "image/jpg" ? "image/jpeg" : normalized
}

function validateMedia(bytes: Uint8Array, contentType: string): ZohoMmsMedia {
  const extension = ALLOWED_MMS_TYPES.get(contentType)
  if (!extension) {
    throw new Error(`Unsupported MMS image type: ${contentType || "unknown"}. Use JPEG, PNG, or GIF.`)
  }
  if (bytes.byteLength === 0) throw new Error("MMS image is empty.")
  if (bytes.byteLength > MAX_MMS_MEDIA_BYTES) {
    throw new Error(`MMS image is ${bytes.byteLength} bytes; maximum allowed by Titan is ${MAX_MMS_MEDIA_BYTES} bytes.`)
  }
  return { bytes, contentType, filename: `attachment.${extension}` }
}

export async function loadZohoMmsMedia(imageUrl: string): Promise<ZohoMmsMedia> {
  if (!imageUrl) throw new Error("MMS image is missing.")

  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/)
    if (!match) throw new Error("MMS image data is malformed.")
    const contentType = normalizeContentType(match[1])
    const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64")
    return validateMedia(Uint8Array.from(buffer), contentType)
  }

  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Unable to download MMS image: HTTP ${response.status}`)
  const contentType = normalizeContentType(response.headers.get("content-type") || "")
  return validateMedia(new Uint8Array(await response.arrayBuffer()), contentType)
}

export function buildZohoSmsFormData(params: {
  customerNumber: string
  message: string
  senderId: string
  media?: ZohoMmsMedia | null
}): FormData {
  const formData = new FormData()
  formData.append("sms_data", JSON.stringify({
    customerNumber: params.customerNumber,
    message: params.message,
    senderId: params.senderId,
    mms: Boolean(params.media),
  }))

  if (params.media) {
    const blobBytes = new Uint8Array(params.media.bytes.byteLength)
    blobBytes.set(params.media.bytes)
    const blob = new Blob([blobBytes.buffer], { type: params.media.contentType })
    formData.append("mms_media", blob, params.media.filename)
  }
  return formData
}
