import { prisma } from '@/lib/prisma'

export interface BusinessDefaults {
  defaultShippingWeight: number
  defaultShippingLength: number
  defaultShippingWidth: number  
  defaultShippingHeight: number
  defaultDeclaredValue: number
  defaultVigRate: number
  defaultCommissionPct: number
  ccFeeRate: number
  shippingMultiplier: number
  onlineOrderDiscount: number
  giftKeywords: string[]
  carriers: string[]
}

const DEFAULTS: BusinessDefaults = {
  // These are ONLY used to seed the DB on first run
  // After that, all values come from DB
  defaultShippingWeight: 5,
  defaultShippingLength: 15,
  defaultShippingWidth: 15,
  defaultShippingHeight: 4,
  defaultDeclaredValue: 100,
  defaultVigRate: 1.3,
  defaultCommissionPct: 50,
  ccFeeRate: 4.5,
  shippingMultiplier: 1.5,
  onlineOrderDiscount: 10,
  giftKeywords: ['gift', 'hat', 'swag', 'mug', 'shirt', 'promo'],
  carriers: ['FedEx', 'UPS', 'USPS', 'DHL', 'Amazon', 'OnTrac', 'LTL Freight', 'Customer Pickup', 'Other'],
}

let cache: { data: BusinessDefaults; expiresAt: number } | null = null

export async function getBusinessDefaults(): Promise<BusinessDefaults> {
  if (cache && Date.now() < cache.expiresAt) return cache.data
  
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'business_defaults_config' } })
    const raw = setting?.businessDefaults
    if (raw && typeof raw === 'object') {
      const merged = { ...DEFAULTS, ...raw }
      cache = { data: merged, expiresAt: Date.now() + 5 * 60 * 1000 }
      return merged
    }
  } catch (e) {
    console.error('Failed to load business defaults:', e)
  }
  
  cache = { data: DEFAULTS, expiresAt: Date.now() + 5 * 60 * 1000 }
  return DEFAULTS
}

export function clearBusinessDefaultsCache() {
  cache = null
}
