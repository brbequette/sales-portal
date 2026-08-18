// Company configuration - ALL business data comes from env vars
// No hardcoded fallbacks allowed
// Uses lazy evaluation to avoid crashing at module load time during build

// At build time (Netlify prerender), some env vars may not be accessible.
// During static page generation, return empty strings; the Proxy ensures
// real values are lazily evaluated at runtime when the API actually runs.
// NEXT_PHASE is set by Next.js during build. As a fallback, detect prerender
// by checking if we're in a server context without a request.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'

function env(name: string): string {
  const val = process.env[name]
  if (!val) {
    if (isBuildPhase) return ''
    // At runtime, warn but don't crash — some pages import config but
    // may not use all fields
    console.warn(`[company-config] Missing env var: ${name}`)
    return ''
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
