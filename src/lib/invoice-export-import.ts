import { Prisma } from "@prisma/client"

export type ExportRow = Record<string, string>

export const normalizeAccountName = (value: unknown): string =>
  String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase()

const numeric = (value: unknown): number | null => {
  const cleaned = String(value ?? "").replace(/[$,%]/g, "").trim()
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

const date = (value: unknown): Date | null => {
  const text = String(value ?? "").trim()
  if (!text) return null
  const parsed = new Date(`${text}T12:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function normalizeInvoiceStatus(value: unknown): string {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "closed":
    case "paid": return "Paid"
    case "void":
    case "voided": return "Void"
    case "open":
    case "sent": return "Sent"
    case "overdue": return "Overdue"
    case "draft": return "Draft"
    default: return String(value ?? "Unknown").trim() || "Unknown"
  }
}

function customFields(row: ExportRow) {
  return Object.entries(row)
    .filter(([key, value]) => key.startsWith("CF.") && String(value ?? "").trim() !== "")
    .map(([key, value]) => ({ label: key.slice(3), api_name: key.slice(3).toLowerCase().replace(/[^a-z0-9]+/g, "_"), value }))
}

function lineItem(row: ExportRow) {
  return {
    item_id: row["Product ID"] || null,
    name: row["Item Name"] || null,
    description: row["Item Desc"] || null,
    sku: row.SKU || null,
    quantity: numeric(row.Quantity) ?? 0,
    rate: numeric(row["Item Price"]) ?? 0,
    discount: numeric(row.Discount) ?? 0,
    discount_amount: numeric(row["Discount Amount"]) ?? 0,
    item_total: numeric(row["Item Total"]) ?? 0,
    tax_percentage: numeric(row["Item Tax %"]) ?? 0,
    tax_amount: numeric(row["Item Tax Amount"]) ?? 0,
    unit: row["Usage unit"] || null,
  }
}

export function invoiceExportRecord(rows: ExportRow[]) {
  if (!rows.length) throw new Error("EMPTY_INVOICE")
  const row = rows[0]
  const zohoId = String(row["Invoice ID"] || "").trim()
  const invoiceNumber = String(row["Invoice Number"] || "").trim()
  const issueDate = date(row["Invoice Date"])
  if (!zohoId || !invoiceNumber || !issueDate) throw new Error("INVALID_INVOICE_IDENTITY")

  const profit = numeric(row["CF.PROFIT"])
  const deadProfit = numeric(row["CF.DEAD PROFIT (ACTUAL)"])
  const deadCost = numeric(row["CF.DEAD COST TOTAL"])
  const vigRate = numeric(row["CF.SALESPERSON VIG"])
  const commissionPercent = numeric(row["CF.COMMISSION FROM PROFIT %"])
  const commission = numeric(row["CF.SALES COMMISSION"])
  const total = numeric(row.Total) ?? 0
  const balance = numeric(row.Balance)
  const lineItems = rows.filter(item => item["Item Name"] || item["Product ID"]).map(lineItem)

  const items = {
    invoiceNumber,
    booksInvoiceId: zohoId,
    customer_name: row["Customer Name"] || null,
    customer_id: row["Customer ID"] || null,
    salesperson: String(row["Sales person"] || "").trim().toUpperCase() || null,
    status: row["Invoice Status"] || null,
    date: row["Invoice Date"] || null,
    due_date: row["Due Date"] || null,
    sub_total: numeric(row.SubTotal) ?? 0,
    total,
    balance,
    adjustment: numeric(row.Adjustment) ?? 0,
    shippingCharge: numeric(row["Shipping Charge"]) ?? 0,
    purchaseOrder: row.PurchaseOrder || null,
    salesOrderNumber: row["Sales Order Number"] || null,
    estimateNumber: row["Estimate Number"] || null,
    profit,
    deadProfitActual: deadProfit,
    deadCostTotal: deadCost,
    deadCostSubjectToVig: numeric(row["CF.DEAD COST SUBJECT TO VIG"]),
    deadCostNoVig: numeric(row["CF.DEAD COST NO VIG"]),
    deadCostPlusVig: numeric(row["CF.DEAD COST PLUS VIG"]),
    vigRate,
    vig: vigRate,
    commissionPercent,
    commission,
    ccFees: numeric(row["CF.CREDIT CARD PROCESSING FEES"]),
    additionalCosts: numeric(row["CF.ADDITIONAL COSTS SEE NOTES"]),
    insurance: numeric(row["CF.Insurance"]),
    actualShippingCost: numeric(row["CF.Actual Shipping Cost"]),
    shippingCostBreakdown: row["CF.Shipping Cost Breakdown"] || null,
    custom_fields: customFields(row),
    line_items: lineItems,
    importedFromCsv: true,
    csvImportSource: "Zoho Books invoice export",
    csvImportedAt: new Date().toISOString(),
  }

  return {
    zohoId,
    invoiceNumber,
    accountZohoId: String(row["Customer ID"] || "").trim(),
    accountName: String(row["Customer Name"] || "").trim(),
    salesperson: String(row["Sales person"] || "").trim(),
    update: {
      amount: total,
      status: normalizeInvoiceStatus(row["Invoice Status"]),
      issueDate,
      dueDate: date(row["Due Date"]),
      balance,
      lastPaymentDate: date(row["Last Payment Date"]),
      items: items as Prisma.InputJsonValue,
      actualShippingCost: numeric(row["CF.Actual Shipping Cost"]),
      shippingCostBreakdown: row["CF.Shipping Cost Breakdown"] || null,
      isWrittenOff: /^(true|yes|1)$/i.test(String(row["CF.Written Off?"] || "")),
      computedProfit: profit,
      computedDeadProfit: deadProfit,
      computedDeadCost: deadCost,
      computedVigRate: vigRate,
      computedSalesperson: String(row["Sales person"] || "").trim() || null,
      computedInvoiceNumber: invoiceNumber,
      invoiceNumber,
      salesorderNumber: row["Sales Order Number"] || null,
      pendingCostSync: false,
      pendingZohoFetch: false,
    },
  }
}
