// Preserve real customer contact data; never substitute the shipper's number.
export function recipientPhone(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export const RECIPIENT_PHONE_REQUIRED = 'Enter the recipient phone number in Ship Now before buying a label.'

export class ShippingRecipientError extends Error {
  constructor() { super(RECIPIENT_PHONE_REQUIRED); this.name = 'ShippingRecipientError' }
}
