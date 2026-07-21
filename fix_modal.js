const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'src', 'components', 'InvoiceDetailsModal.tsx')
let content = fs.readFileSync(file, 'utf8')

// Change prop alias
content = content.replace(
  `export function InvoiceDetailsModal({ invoice, type = "Invoice", onClose, invoiceList, currentIndex, onNavigate }: InvoiceDetailsModalProps) {`,
  `export function InvoiceDetailsModal({ invoice, type: initialType = "Invoice", onClose, invoiceList, currentIndex, onNavigate }: InvoiceDetailsModalProps) {
  const [overrideDoc, setOverrideDoc] = useState<{ id: string, type: 'Quote' | 'SalesOrder' | 'Invoice' } | null>(null)
  const type = overrideDoc ? overrideDoc.type : initialType;`
)

content = content.replace(
  `  const isString = typeof invoice === "string"
  const zohoId = isString ? invoice : (invoice?.zohoId || invoice?.id)
  const initialData = isString ? { id: zohoId, zohoId } : invoice`,
  `  const isString = typeof invoice === "string"
  const baseZohoId = isString ? invoice : (invoice?.zohoId || invoice?.id)
  const zohoId = overrideDoc ? overrideDoc.id : baseZohoId
  const initialData = overrideDoc ? { id: overrideDoc.id, zohoId: overrideDoc.id } : (isString ? { id: zohoId, zohoId } : invoice)`
)

content = content.replace(
  `<DocumentLifecycle zohoId={zohoId} type={type} />`,
  `<DocumentLifecycle zohoId={zohoId} type={type} onNavigateDoc={(t, id) => setOverrideDoc({ id, type: t })} />`
)

fs.writeFileSync(file, content, 'utf8')
console.log('Fixed InvoiceDetailsModal.tsx')
