export function formatPhoneNumber(phoneNumberString: string | null | undefined): string {
  if (!phoneNumberString) return ""
  const str = String(phoneNumberString).trim()
  if (!str) return ""

  // Extract extension if present (e.g. ext, x, extension)
  let ext = ""
  const extMatch = str.match(/(?:ext|x|extension|ext\.)\s*(\d+)/i)
  if (extMatch) {
    ext = ` ext. ${extMatch[1]}`
  }

  // Remove all non-digits
  const cleaned = str.replace(/\D/g, '')

  // 10 digits US phone number (e.g. 8183628300 -> (818) 362-8300)
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}${ext}`
  }

  // 11 digits US phone number starting with 1 (e.g. 18183628300 -> (818) 362-8300)
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}${ext}`
  }

  // 10+ digits with extension appended (e.g. 18183628300123)
  if (cleaned.length > 10) {
    if (cleaned.startsWith('1') && cleaned.length >= 11) {
      const main = cleaned.slice(1, 11)
      const extra = cleaned.slice(11)
      return `(${main.slice(0, 3)}) ${main.slice(3, 6)}-${main.slice(6)}${extra ? ` ext. ${extra}` : ''}`
    } else {
      const main = cleaned.slice(0, 10)
      const extra = cleaned.slice(10)
      return `(${main.slice(0, 3)}) ${main.slice(3, 6)}-${main.slice(6)}${extra ? ` ext. ${extra}` : ''}`
    }
  }

  return str
}
