import { buildCollectionsScript, type ScriptInvoice } from '@/lib/collections-script'

export function CollectionsScript({ invoices, callerName }: { invoices: ScriptInvoice[]; callerName: string }) {
  const script = buildCollectionsScript(invoices, callerName)
  return <section aria-label="Collections script" className="shrink-0 rounded-2xl border border-red-500/20 bg-neutral-950 p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-sm font-bold text-red-400">Collections Script</h4>
      {script && <span className="text-xs font-semibold text-amber-300">{script.stage}</span>}
    </div>
    {!script ? <p className="text-sm text-neutral-300">Select at least one invoice to prepare the call script.</p> : <>
      <p className="text-xs text-neutral-400">Confirm you are speaking to the authorized billing contact before discussing balances. Based only on the selected invoices.</p>
      <div className="space-y-3 text-sm leading-7 text-neutral-100 break-words">
        {script.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
      <ul className="space-y-1 text-xs text-neutral-300" aria-label="Script invoice details">
        {invoices.map(invoice => <li key={invoice.id}>#{invoice.invoice_number} · Due {invoice.due_date || 'not recorded'} · {invoice.days_overdue} days overdue · {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.balance)} remaining</li>)}
      </ul>
      <details className="text-sm text-neutral-300"><summary className="cursor-pointer font-semibold">Voicemail / no answer</summary><p className="pt-2 leading-6">{script.voicemail}</p></details>
      {script.legalReview && <details className="text-xs text-amber-200"><summary className="cursor-pointer font-semibold">Internal legal review guidance</summary><p className="pt-2 leading-6">{script.legalReview}</p></details>}
    </>}
  </section>
}
