export function formatPhoneNumber(phoneNumberString: string | null | undefined): string {
  if (!phoneNumberString) return ""
  
  // Remove all non-digits
  const cleaned = ('' + phoneNumberString).replace(/\D/g, '')
  
  // Check if it has the standard 10 digits
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/)
  if (match) {
    return '(' + match[1] + ') ' + match[2] + '-' + match[3]
  }
  
  // Check if it has an 11 digit US country code
  const matchWith1 = cleaned.match(/^1(\d{3})(\d{3})(\d{4})$/)
  if (matchWith1) {
    return '(' + matchWith1[1] + ') ' + matchWith1[2] + '-' + matchWith1[3]
  }
  
  return phoneNumberString
}
