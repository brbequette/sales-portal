/** Omitted provider status must not erase a previously verified payment state. */
export function booksPaymentStatusFields(payment: { payment_status?: unknown; status?: unknown }): { status?: string } {
  for (const value of [payment.payment_status, payment.status]) {
    if (typeof value === 'string' && value.trim()) return { status: value.trim().toLowerCase() }
  }
  return {}
}
