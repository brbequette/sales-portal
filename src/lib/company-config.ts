// Company configuration - ALL business data comes from env vars
// No hardcoded fallbacks allowed
// Uses lazy evaluation to avoid crashing at module load time during build

// At build time (Netlify prerender), env vars may not be available.
// Return empty strings so prerender succeeds; real values are used at runtime.
const isBuildPhase = process.env.NODE_ENV === 'production' && !process.env.COMPANY_NAME

function env(name: string): string {
  const val = process.env[name]
  if (!val) {
    if (isBuildPhase) return ''
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return val
}

export function getCompanyConfig() {
  return {
    name: env('COMPANY_NAME'),
    domain: env('COMPANY_DOMAIN'),
    phone: env('COMPANY_PHONE'),
    email: env('COMPANY_FROM_EMAIL'),
    shippingEmail: env('COMPANY_SHIPPING_EMAIL'),

    address: {
      line1: env('COMPANY_ADDRESS_LINE1'),
      city: env('COMPANY_ADDRESS_CITY'),
      state: env('COMPANY_ADDRESS_STATE'),
      zip: env('COMPANY_ADDRESS_ZIP'),
      country: process.env.COMPANY_ADDRESS_COUNTRY || 'US',
    },

    zoho: {
      mailAccountId: env('ZOHO_MAIL_ACCOUNT_ID'),
      voiceFromNumber: env('ZOHO_VOICE_FROM_NUMBER'),
    },
  }
}

// For backward compat with existing `COMPANY_CONFIG.xxx` references,
// use a Proxy that lazily calls getCompanyConfig() on first property access
export const COMPANY_CONFIG = new Proxy({} as ReturnType<typeof getCompanyConfig>, {
  get(_target, prop: string) {
    return getCompanyConfig()[prop as keyof ReturnType<typeof getCompanyConfig>]
  },
})
