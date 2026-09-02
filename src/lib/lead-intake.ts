export type LeadIntake = {
  company: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  mobile?: string
  title?: string
  industry?: string
  street?: string
  city?: string
  state?: string
  zip?: string
  timeZone?: string
}

export function normalizeLeadPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "")
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits
}

export function normalizeLeadInput(input: LeadIntake): LeadIntake {
  const clean = (value?: string) => value?.trim() || undefined
  return {
    company: String(input.company || "").trim(), firstName: clean(input.firstName), lastName: clean(input.lastName),
    email: clean(input.email)?.toLowerCase(), phone: normalizeLeadPhone(input.phone) || undefined,
    mobile: normalizeLeadPhone(input.mobile) || undefined, title: clean(input.title), industry: clean(input.industry),
    street: clean(input.street), city: clean(input.city), state: clean(input.state)?.toUpperCase(), zip: clean(input.zip),
    timeZone: clean(input.timeZone),
  }
}

export function validateLeadInput(input: LeadIntake) {
  const errors: Record<string, string> = {}
  if (!input.company || input.company.length < 2) errors.company = "Company name is required."
  if (!input.firstName && !input.lastName) errors.contact = "Enter the contact's first or last name."
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) errors.email = "Enter a valid email address."
  for (const field of ["phone", "mobile"] as const) {
    if (input[field] && normalizeLeadPhone(input[field]).length !== 10) errors[field] = "Enter a 10-digit US phone number."
  }
  if (input.zip && !/^\d{5}(?:-\d{4})?$/.test(input.zip)) errors.zip = "Enter a valid ZIP code."
  return errors
}
