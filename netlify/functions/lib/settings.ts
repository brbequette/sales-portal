import { PrismaClient } from "@prisma/client"

export interface AppSettings {
  default_vig_rate: number
  commission_rate_pct: number
  shipping_multiplier: number
  cc_fee_rate: number
  default_shipping_weight: number
  sms_daily_account_limit: number
  ai_reply_prompt: string
  pause_mass_zoho_updates: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  default_vig_rate: 1.3,
  commission_rate_pct: 50,
  shipping_multiplier: 1.5,
  cc_fee_rate: 4.5, // 4.5%
  default_shipping_weight: 0.5,
  sms_daily_account_limit: 1,
  ai_reply_prompt: "You are a professional sales assistant for a diamond wholesaler. Provide a concise, friendly response to the customer's text message.",
  pause_mass_zoho_updates: false
}

export async function getSystemSettings(prisma: PrismaClient): Promise<AppSettings> {
  try {
    const records = await prisma.systemSetting.findMany().catch(() => [])
    const map: Record<string, string> = {}
    if (Array.isArray(records)) {
      records.forEach((r: any) => { map[r.key] = r.value })
    }

    return {
      default_vig_rate: map.default_vig_rate ? parseFloat(map.default_vig_rate) : DEFAULT_SETTINGS.default_vig_rate,
      commission_rate_pct: map.commission_rate_pct ? parseFloat(map.commission_rate_pct) : DEFAULT_SETTINGS.commission_rate_pct,
      shipping_multiplier: map.shipping_multiplier ? parseFloat(map.shipping_multiplier) : DEFAULT_SETTINGS.shipping_multiplier,
      cc_fee_rate: map.cc_fee_rate ? parseFloat(map.cc_fee_rate) : DEFAULT_SETTINGS.cc_fee_rate,
      default_shipping_weight: map.default_shipping_weight ? parseFloat(map.default_shipping_weight) : DEFAULT_SETTINGS.default_shipping_weight,
      sms_daily_account_limit: map.sms_daily_account_limit ? parseInt(map.sms_daily_account_limit) : DEFAULT_SETTINGS.sms_daily_account_limit,
      ai_reply_prompt: map.ai_reply_prompt || DEFAULT_SETTINGS.ai_reply_prompt,
      pause_mass_zoho_updates: map.pause_mass_zoho_updates === 'true' || map.pause_mass_zoho_updates === '1'
    }
  } catch (err) {
    return DEFAULT_SETTINGS
  }
}
