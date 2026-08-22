export type PromotionCostInput = {
  sellingPrice: number
  bladeLines: Array<{ quantity: number; unitCost: number; unitRetail: number }>
  giveawayCost: number
  giveawayRetail: number
  packagingCost: number
  handlingCost: number
  shippingEstimate: number
  freeShipping: boolean
  paymentFeePercent?: number
  tariffCost?: number
  vigCost?: number
  commissionCost?: number
  otherCost?: number
}

const money = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100

export function calculatePromotionFinancials(input: PromotionCostInput) {
  const bladeCost = money(input.bladeLines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0))
  const bladeRetail = money(input.bladeLines.reduce((sum, line) => sum + line.quantity * line.unitRetail, 0))
  const giveawayCost = money(input.giveawayCost)
  const giveawayRetail = money(input.giveawayRetail)
  const shippingCost = input.freeShipping ? money(input.shippingEstimate) : 0
  const paymentFee = money(input.sellingPrice * ((input.paymentFeePercent || 0) / 100))
  const tariffCost = money(input.tariffCost || 0)
  const vigCost = money(input.vigCost || 0)
  const commissionCost = money(input.commissionCost || 0)
  const otherCost = money(input.otherCost || 0)
  const totalCost = money(bladeCost + giveawayCost + input.packagingCost + input.handlingCost + shippingCost + paymentFee + tariffCost + vigCost + commissionCost + otherCost)
  const grossProfit = money(input.sellingPrice - totalCost)
  const grossMarginPercent = input.sellingPrice > 0 ? money((grossProfit / input.sellingPrice) * 100) : 0
  const customerValue = money(bladeRetail + giveawayRetail + (input.freeShipping ? input.shippingEstimate : 0))
  const customerSavings = money(Math.max(0, customerValue - input.sellingPrice))
  return { bladeCost, bladeRetail, giveawayCost, giveawayRetail, shippingCost, paymentFee, tariffCost, vigCost, commissionCost, otherCost, packagingCost: money(input.packagingCost), handlingCost: money(input.handlingCost), totalCost, grossProfit, grossMarginPercent, customerValue, customerSavings }
}
