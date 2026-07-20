import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const cors = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function parseCSV(text: string): { headers: string[], rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/)
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = parseCSVLine(lines[0])
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCSVLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h.trim()] = (values[idx] || '').trim() })
    rows.push(row)
  }
  return { headers, rows }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) { result.push(current); current = '' }
    else current += char
  }
  result.push(current)
  return result
}

function mapColumnValue(columnName: string, value: string): { field: string, parsed: any } | null {
  const upper = columnName.toUpperCase().trim()
  const numVal = parseFloat(value.replace(/[,$]/g, '')) || 0

  if (upper === 'INVOICE NUMBER' || upper === 'INVOICE#') return { field: 'invoiceNumber', parsed: value }
  if (upper === 'SALES ORDER NUMBER' || upper === 'SALESORDER NUMBER' || upper === 'SALES ORDER#') return { field: 'salesOrderNumber', parsed: value }
  if (upper === 'ESTIMATE NUMBER' || upper === 'ESTIMATE#') return { field: 'estimateNumber', parsed: value }
  if (upper === 'CUSTOMER NAME') return { field: 'customer_name', parsed: value }
  if (upper === 'SALESPERSON' || upper === 'SALESPERSON NAME' || upper === 'SALES PERSON') return { field: 'salesperson', parsed: value.toUpperCase().trim() }
  if (upper === 'STATUS') return { field: '_status', parsed: value }
  if (upper === 'SUBTOTAL' || upper === 'SUB TOTAL') return { field: 'sub_total', parsed: numVal }
  if (upper === 'TOTAL') return { field: 'total', parsed: numVal }
  if (upper === 'BALANCE' || upper === 'BALANCE DUE') return { field: 'balance', parsed: numVal }
  if (upper === 'DATE' || upper === 'INVOICE DATE') return { field: 'date', parsed: value }
  if (upper === 'DUE DATE') return { field: 'due_date', parsed: value }
  if (upper === 'SHIPPING CHARGE' || upper === 'SHIPPING CHARGES') return { field: 'shippingCharge', parsed: numVal }
  if (upper === 'REFERENCE NUMBER' || upper === 'REFERENCE#') return { field: 'reference_number', parsed: value }

  if (upper === 'DEAD COST TOTAL' || upper === 'CF.DEAD COST TOTAL') return { field: 'deadCostTotal', parsed: numVal }
  if (upper === 'DEAD COST SUBJECT TO VIG' || upper === 'CF.DEAD COST SUBJECT TO VIG') return { field: 'deadCostSubjectToVig', parsed: numVal }
  if (upper === 'DEAD COST NO VIG' || upper === 'CF.DEAD COST NO VIG') return { field: 'deadCostNoVig', parsed: numVal }
  if (upper === 'SALESPERSON VIG' || upper === 'CF.SALESPERSON VIG') return { field: 'vig', parsed: numVal || 1.3 }
  if (upper === 'DEAD COST PLUS VIG' || upper === 'CF.DEAD COST PLUS VIG') return { field: 'deadCostPlusVig', parsed: numVal }
  if (upper === 'PROFIT' || upper === 'CF.PROFIT' || upper === 'ESTIMATED PROFIT') return { field: 'profit', parsed: numVal }
  if (upper === 'COMMISSION FROM PROFIT %' || upper === 'CF.COMMISSION FROM PROFIT %') return { field: 'commissionPercent', parsed: numVal }
  if (upper === 'SALES COMMISSION' || upper === 'CF.SALES COMMISSION') return { field: 'commission', parsed: numVal }
  if (upper === 'CREDIT CARD PROCESSING FEES' || upper === 'CF.CREDIT CARD PROCESSING FEES' || upper === 'CREDIT CARD PROCESSING') return { field: 'ccFees', parsed: numVal }
  if (upper === 'ADDITIONAL COSTS SEE NOTES' || upper === 'CF.ADDITIONAL COSTS SEE NOTES') return { field: 'additionalCosts', parsed: numVal }
  if (upper === 'INSURANCE' || upper === 'CF.INSURANCE') return { field: 'insurance', parsed: numVal }
  if (upper === 'ITEMS DC BREAKDOWN' || upper === 'CF.ITEMS DC BREAKDOWN') return { field: 'itemsDcBreakdown', parsed: value ? [value] : null }
  if (upper === 'CF.ESTIMATE NUMBER') return { field: 'estimateNumberRef', parsed: value || null }
  if (upper === 'CF.ESTIMATE DATE' || upper === 'ESTIMATE DATE') return { field: 'estimateDate', parsed: value || null }
  if (upper === 'PAID IN FULL DATE' || upper === 'CF.PAID IN FULL DATE') return { field: 'paidInFullDate', parsed: value || null }
  if (upper === 'COMMISSION STATUS' || upper === 'CF.COMMISSION STATUS') return { field: 'commissionStatus', parsed: value || null }
  if (upper.includes('WRITTEN OFF')) return { field: 'writtenOff', parsed: value.toLowerCase() === 'true' || value.toLowerCase() === 'yes' }
  if (upper.includes('REMOVE TARIFF')) return { field: 'removeTariffSurcharge', parsed: value.toLowerCase() === 'true' || value.toLowerCase() === 'yes' }
  if (upper === 'ADDITIONAL COSTS NOTES' || upper === 'CF.ADDITIONAL COSTS NOTES' || upper.includes('ADDITIONAL COST EXPLANATION')) return { field: 'additionalCostNotes', parsed: value || null }
  if (upper.includes('CC CHARGE') && upper.includes('BREAKDOWN')) return { field: 'ccBreakdown', parsed: value || null }
  if (upper.includes('PURCHASE ORDER NUMBER')) return { field: 'purchaseOrderNumbers', parsed: value || null }
  if (upper === 'DEAD PROFIT ACTUAL' || upper === 'CF.DEAD PROFIT ACTUAL') return { field: 'deadProfitActual', parsed: numVal }

  return null
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "POST only" }) }

  try {
    const body = JSON.parse(event.body || "{}")
    const { type = "Invoice", csvData } = body

    if (!csvData) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing csvData" }) }
    }

    const { headers, rows } = parseCSV(csvData)
    if (rows.length === 0) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "No data rows found" }) }
    }

    const numberCol = headers.find(h => {
      const u = h.toUpperCase().trim()
      return u === 'INVOICE NUMBER' || u === 'INVOICE#'
        || u === 'SALES ORDER NUMBER' || u === 'SALESORDER NUMBER' || u === 'SALES ORDER#'
        || u === 'ESTIMATE NUMBER' || u === 'ESTIMATE#'
    })

    if (!numberCol) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({
        error: "Could not find document number column",
        foundHeaders: headers.slice(0, 20),
      }) }
    }

    let updated = 0, notFound = 0, skipped = 0, errors = 0
    const notFoundNumbers: string[] = []

    for (const row of rows) {
      try {
        const docNumber = row[numberCol]?.trim()
        if (!docNumber) { skipped++; continue }

        const fieldsToUpdate: Record<string, any> = {}
        let statusVal: string | null = null

        for (const [col, val] of Object.entries(row)) {
          if (!val || val.trim() === '') continue
          const mapped = mapColumnValue(col, val)
          if (mapped) {
            if (mapped.field === '_status') statusVal = mapped.parsed
            else fieldsToUpdate[mapped.field] = mapped.parsed
          }
        }

        if (Object.keys(fieldsToUpdate).length === 0) { skipped++; continue }

        let dbRecord: any = null
        if (type === 'Invoice') {
          dbRecord = await prisma.invoice.findFirst({
            where: { OR: [
              { items: { path: ['invoiceNumber'], equals: docNumber } },
              { items: { path: ['invoiceNumber'], equals: docNumber.replace(/^INV-/, '') } },
            ] }
          })
        } else if (type === 'SalesOrder') {
          dbRecord = await prisma.salesOrder.findFirst({
            where: { OR: [
              { items: { path: ['salesOrderNumber'], equals: docNumber } },
              { items: { path: ['salesOrderNumber'], equals: docNumber.replace(/^SO-/, '') } },
            ] }
          })
        } else {
          dbRecord = await prisma.quote.findFirst({
            where: { OR: [
              { items: { path: ['estimateNumber'], equals: docNumber } },
              { items: { path: ['estimateNumber'], equals: docNumber.replace(/^EST-/, '') } },
            ] }
          })
        }

        if (!dbRecord) {
          notFound++
          if (notFoundNumbers.length < 20) notFoundNumbers.push(docNumber)
          continue
        }

        const currentItems = (dbRecord.items as any) || {}
        const updatedItems = { ...currentItems, ...fieldsToUpdate, lastSyncedAt: new Date().toISOString(), importedFromCsv: true }

        const updateData: any = { items: updatedItems }
        if (statusVal) {
          const s = statusVal.toLowerCase()
          if (s === 'paid' || s === 'closed') updateData.status = 'Paid'
          else if (s === 'void' || s === 'voided') updateData.status = 'Void'
          else if (s === 'draft') updateData.status = 'Draft'
          else if (s === 'overdue') updateData.status = 'Overdue'
          else if (s === 'sent' || s === 'open') updateData.status = 'Sent'
          else updateData.status = statusVal
        }

        if (type === 'Invoice') await prisma.invoice.update({ where: { id: dbRecord.id }, data: updateData })
        else if (type === 'SalesOrder') await prisma.salesOrder.update({ where: { id: dbRecord.id }, data: updateData })
        else await prisma.quote.update({ where: { id: dbRecord.id }, data: updateData })

        updated++
      } catch (e: any) { errors++ }
    }

    return {
      statusCode: 200, headers: cors,
      body: JSON.stringify({
        success: true, type, totalRows: rows.length,
        updated, notFound, skipped, errors,
        columnsMatched: headers.filter(h => mapColumnValue(h, 'test') !== null).length,
        columnsTotal: headers.length,
        notFoundSample: notFoundNumbers,
        message: `Imported ${updated} ${type}s. ${notFound} not found, ${skipped} skipped, ${errors} errors.`
      })
    }
  } catch (err: any) {
    console.error("import-books-csv error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) }
  }
}
