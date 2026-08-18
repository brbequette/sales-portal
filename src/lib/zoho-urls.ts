/**
 * Centralized Zoho Books URL Builder
 * Uses the correct Titan Diamond USA Organization ID: 664670946
 */
export const ZOHO_ORGANIZATION_ID = process.env.NEXT_PUBLIC_ZOHO_ORGANIZATION_ID || "664670946"

export function getZohoBooksUrl(
  docType: string,
  zohoId: string
): string {
  const typeMap: Record<string, string> = {
    Quote: "estimates",
    quote: "estimates",
    estimates: "estimates",
    SalesOrder: "salesorders",
    salesorder: "salesorders",
    salesorders: "salesorders",
    Invoice: "invoices",
    invoice: "invoices",
    invoices: "invoices",
    payment: "customerpayments",
    customerpayments: "customerpayments",
    package: "packages",
    packages: "packages",
    purchaseorder: "purchaseorders",
    purchaseorders: "purchaseorders",
  }

  const path = typeMap[docType] || docType || "invoices"
  return `https://books.zoho.com/app/${ZOHO_ORGANIZATION_ID}#/${path}/${zohoId}`
}
