export const INTRO_OFFER = {
  code: 'PATRIOT-BOGO-99',
  sku: 'IF30PV1412E-PP',
  productName: 'The Patriot Pro',
  headline: 'Buy one. Get one free.',
  bladeSize: '14-inch',
  unitsPerPack: 2,
  pricePerPack: 99.99,
  shippingLabel: 'Free freight',
  phoneDisplay: '(480) 470-2577',
  phoneHref: 'tel:+14804702577',
  email: 'sales@titandiamondusa.com',
} as const

export const INTRO_OFFER_MAX_QUANTITY = 5

export function introOfferTotal(quantity: number) {
  return Number((INTRO_OFFER.pricePerPack * quantity).toFixed(2))
}
