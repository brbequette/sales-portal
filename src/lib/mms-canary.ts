export const MMS_CANARY_ENDPOINT = "/api/campaign-job/test-send"
export const MMS_MAX_BYTES = 900_000
export const MMS_MAX_WIDTH = 1024
export const MMS_MAX_HEIGHT = 1536

type DecodedImage = {
  width: number
  height: number
  close?: () => void
}

export type ImageOptimizerAdapter = {
  decode: (file: File) => Promise<DecodedImage>
  encode: (image: DecodedImage, width: number, height: number, quality: number) => Promise<Blob>
}

export type OptimizedMmsImage = {
  blob: Blob
  filename: string
  width: number
  height: number
  mimeType: "image/jpeg"
  byteSize: number
}

function optimizedFilename(originalName: string) {
  const base = originalName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "mms-image"
  return `${base}-mms.jpg`
}

const browserImageAdapter: ImageOptimizerAdapter = {
  async decode(file) {
    return createImageBitmap(file)
  },
  async encode(image, width, height, quality) {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d", { alpha: false })
    if (!context) throw new Error("Image optimization is unavailable in this browser.")
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, width, height)
    context.drawImage(image as CanvasImageSource, 0, 0, width, height)
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Unable to encode the MMS image.")), "image/jpeg", quality)
    })
  },
}

export function normalizeSingleRecipient(input: string): string {
  const value = input.trim()
  if (!value) throw new Error("Recipient phone number is required.")
  if (/[;,\n\r]/.test(value)) throw new Error("Enter exactly one recipient phone number.")
  if ((value.match(/\+/g) || []).length > 1 || (value.includes("+") && !value.startsWith("+"))) {
    throw new Error("Enter one valid phone number in E.164 format.")
  }

  const digits = value.replace(/\D/g, "")
  const normalized = digits.length === 10
    ? `+1${digits}`
    : digits.length === 11 && digits.startsWith("1")
      ? `+${digits}`
      : value.startsWith("+") && digits.length >= 8 && digits.length <= 15
        ? `+${digits}`
        : ""

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("Enter one valid phone number in E.164 format.")
  return normalized
}

export async function optimizeMmsImage(file: File, adapter: ImageOptimizerAdapter = browserImageAdapter): Promise<OptimizedMmsImage> {
  if (!new Set(["image/jpeg", "image/png"]).has(file.type.toLowerCase())) {
    throw new Error("Choose a JPEG or PNG image.")
  }
  if (file.size <= 0) throw new Error("The selected image is empty.")
  if (file.size > 20_000_000) throw new Error("The source image exceeds the 20 MB optimization limit.")

  const image = await adapter.decode(file)
  try {
    if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width <= 0 || image.height <= 0) {
      throw new Error("The selected image has invalid dimensions.")
    }

    const scale = Math.min(1, MMS_MAX_WIDTH / image.width, MMS_MAX_HEIGHT / image.height)
    let width = Math.max(1, Math.round(image.width * scale))
    let height = Math.max(1, Math.round(image.height * scale))
    let quality = 0.9

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const blob = await adapter.encode(image, width, height, quality)
      if (blob.type !== "image/jpeg") throw new Error("The browser did not produce a JPEG image.")
      if (blob.size <= MMS_MAX_BYTES) {
        return { blob, filename: optimizedFilename(file.name), width, height, mimeType: "image/jpeg", byteSize: blob.size }
      }

      if (quality > 0.5) {
        quality = Math.max(0.5, quality - 0.08)
      } else {
        width = Math.max(1, Math.floor(width * 0.88))
        height = Math.max(1, Math.floor(height * 0.88))
      }
    }
    throw new Error(`Unable to optimize this image below ${MMS_MAX_BYTES.toLocaleString()} bytes.`)
  } finally {
    image.close?.()
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Unable to read the optimized image."))
    reader.onload = () => resolve(String(reader.result || ""))
    reader.readAsDataURL(blob)
  })
}

export type MmsCanarySubmission = {
  recipient: string
  sender: string
  message: string
  imageDataUrl: string
}

export type MmsCanaryResult = {
  httpStatus: number
  response: unknown
}

export async function submitMmsCanary(
  submission: MmsCanarySubmission,
  fetchImpl: typeof fetch = fetch,
): Promise<MmsCanaryResult> {
  const recipient = normalizeSingleRecipient(submission.recipient)
  const sender = normalizeSingleRecipient(submission.sender)
  if (!submission.message.trim()) throw new Error("Message is required.")
  if (!submission.imageDataUrl.startsWith("data:image/jpeg;base64,")) throw new Error("An optimized JPEG image is required.")

  const response = await fetchImpl(MMS_CANARY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      testPhone: recipient,
      fromNumber: sender,
      channel: "SMS",
      text: submission.message.trim(),
      imageUrl: submission.imageDataUrl,
    }),
  })
  const responseText = await response.text()
  let parsed: unknown = responseText
  try { parsed = JSON.parse(responseText) } catch {}
  return { httpStatus: response.status, response: parsed }
}
