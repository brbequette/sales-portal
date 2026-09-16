export const DEFAULT_WRITE_OFF_RESPONSIBILITY_PERCENTAGE = "50.00"
export const DEFAULT_WRITE_OFF_RESPONSIBILITY_RATE_BPS = 5000

export function writeOffPercentageToBps(value: string) {
  const text = value.trim()
  if (!/^\d{1,3}\.\d{2}$/.test(text)) {
    throw new Error("Write-off responsibility percentage must use two-decimal format such as 50.00")
  }
  const normalized = Number(text)
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 100) {
    throw new Error("Write-off responsibility percentage must be from 0.00 to 100.00")
  }
  return Math.round(normalized * 100)
}

export function writeOffBpsToPercentage(rateBps: number) {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10_000) {
    throw new Error("Write-off responsibility rate must be integer basis points from 0 to 10000")
  }
  return (rateBps / 100).toFixed(2)
}

export function formatRecoveryMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)
}
