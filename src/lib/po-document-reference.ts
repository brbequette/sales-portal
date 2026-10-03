// Document numbers are identifiers, not arbitrary collections of digits.
// Keep type and leading zeroes; never concatenate numbers or use substring matches.
type RecordData = Record<string, any>
export type DocumentKind = 'invoice' | 'salesorder' | 'estimate' | 'po' | 'unknown'
export type DocumentReference = { kind: DocumentKind; number: string }
const labels = /^(invoice|inv|sales[\s_-]*order|so|estimate|est|quote|purchase[\s_-]*order|po)\s*[#:_-]?\s*/i
export function parseDocumentReference(value: unknown, defaultKind: DocumentKind = 'unknown'): DocumentReference | null {
  let text = String(value ?? '').normalize('NFKC').trim()
  const prefix = text.match(labels)
  let kind = defaultKind
  if (prefix) {
    const label = prefix[1].toLowerCase().replace(/[\s_-]/g, '')
    kind = label === 'inv' || label === 'invoice' ? 'invoice' : label === 'so' || label === 'salesorder' ? 'salesorder' : label === 'po' || label === 'purchaseorder' ? 'po' : 'estimate'
    text = text.slice(prefix[0].length)
  }
  text = text.replace(/^#\s*/, '')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(text) || !/\d/.test(text)) return null
  return { kind, number: text.toUpperCase() }
}
export function purchaseOrderReferences(po: RecordData) {
  const raw = po.items || {}
  const values: Array<[unknown, DocumentKind]> = [
    [po.referenceNumber, 'unknown'], [raw.reference_number, 'unknown'],
    [po.salesOrderNumber, 'salesorder'], [raw.salesorder_number, 'salesorder'],
    [raw.custom_field_hash?.cf_invoice_number_formatted || raw.custom_field_hash?.cf_invoice_number, 'invoice'],
  ]
  for (const so of Array.isArray(raw.salesorders) ? raw.salesorders : []) values.push([so.salesorder_number, 'salesorder'])
  for (const cf of Array.isArray(raw.custom_fields) ? raw.custom_fields : []) {
    if (cf.api_name === 'cf_invoice_number') values.push([cf.value_formatted || cf.value, 'invoice'])
  }
  const refs: DocumentReference[] = []
  let malformed = false
  for (const [value, kind] of values) {
    if (!String(value ?? '').trim()) continue
    const ref = parseDocumentReference(value, kind)
    if (ref) refs.push(ref)
    else if (/\d/.test(String(value)) || labels.test(String(value))) malformed = true
  }
  // Attachments are secondary evidence only; packing-slip/PO filenames are not invoices.
  if (!refs.length && !malformed) {
    const names = [raw.attachment_name, ...(Array.isArray(raw.documents) ? raw.documents.map((d: RecordData) => d.file_name) : [])]
    for (const name of names) {
      for (const match of String(name || '').matchAll(/\b(?:invoice|inv|so|estimate|est)[_\s#-]+\d+\b/gi)) {
        const ref = parseDocumentReference(match[0].replace(/_/g, ' '))
        if (ref) refs.push(ref)
      }
    }
  }
  return { refs: refs.filter((r, i) => refs.findIndex(other => other.kind === r.kind && other.number === r.number) === i), malformed }
}
export function documentReferences(doc: RecordData): DocumentReference[] {
  const raw = doc.items || {}
  const values: Array<[unknown, DocumentKind]> = [
    [doc.invoiceNumber, 'invoice'], [doc.computedInvoiceNumber, 'invoice'], [raw.invoice_number, 'invoice'], [raw.invoiceNumber, 'invoice'],
    [doc.salesorderNumber, 'salesorder'], [doc.salesOrderNumber, 'salesorder'], [raw.salesorder_number, 'salesorder'], [raw.salesOrderNumber, 'salesorder'], [raw.so_number, 'salesorder'],
    [raw.estimate_number, 'estimate'], [raw.estimateNumber, 'estimate'], [raw.quote_number, 'estimate'],
    [raw.customer_po, 'po'], [doc.referenceNumber, 'unknown'], [raw.reference_number, 'unknown'],
  ]
  return values.map(([value, kind]) => parseDocumentReference(value, kind)).filter((r): r is DocumentReference => !!r)
}
export function evaluatePOReference(po: RecordData, doc: RecordData) {
  const { refs, malformed } = purchaseOrderReferences(po)
  const targets = documentReferences(doc)
  const compatible = (a: DocumentReference, b: DocumentReference) => a.number === b.number && (a.kind === 'unknown' || a.kind === b.kind)
  const explicit = malformed || refs.length > 0
  const contradictory = refs.some(ref => refs.some(other => other.kind === ref.kind && other.number !== ref.number))
  const exact = !malformed && !contradictory && refs.length > 0 && refs.every(ref => targets.some(target => compatible(ref, target)))
  // A reverse customer-PO reference is valid only as a complete typed identifier.
  const ownNumber = parseDocumentReference(po.poNumber, 'po')
  const reverse = !explicit && !!ownNumber && targets.some(target => target.kind === 'po' && target.number === ownNumber.number)
  return { explicit, exact: exact || reverse, conflict: explicit && !exact, refs }
}
