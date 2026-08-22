export const PURCHASE_GIFT_THRESHOLDS = [100, 250, 500, 750, 1000, 2500, 5000, 10000] as const;

export type ProductOfferTier = {
  threshold: number;
  active: boolean;
  discountPercent: number | null;
  packagePrice: number | null;
  giftSku: string;
  giftName: string;
  giftImageUrl: string;
  giftValue: number | null;
  note: string;
};

export type ProductOffer = {
  enabled: boolean;
  headline: string;
  subheadline: string;
  applicationMatchedGift: boolean;
  tiers: ProductOfferTier[];
};

const text = (value: unknown, max = 180) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const amount = (value: unknown, max = 1_000_000) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : null;
};

export function normalizeProductOffer(value: unknown): ProductOffer {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawTiers = Array.isArray(raw.tiers) ? raw.tiers : [];
  return {
    enabled: raw.enabled === true,
    headline: text(raw.headline) || 'Build your crew package',
    subheadline: text(raw.subheadline, 320) || 'Larger qualifying orders can unlock volume pricing and application-matched jobsite tools.',
    applicationMatchedGift: raw.applicationMatchedGift !== false,
    tiers: PURCHASE_GIFT_THRESHOLDS.map((threshold) => {
      const source = rawTiers.find((tier) => tier && typeof tier === 'object' && Number((tier as Record<string, unknown>).threshold) === threshold) as Record<string, unknown> | undefined;
      return {
        threshold,
        active: source?.active === true,
        discountPercent: amount(source?.discountPercent, 100),
        packagePrice: amount(source?.packagePrice),
        giftSku: text(source?.giftSku, 80).toUpperCase(),
        giftName: text(source?.giftName),
        giftImageUrl: text(source?.giftImageUrl, 2000),
        giftValue: amount(source?.giftValue),
        note: text(source?.note, 300),
      };
    }),
  };
}
