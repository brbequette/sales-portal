import fs from 'node:fs'
const root='artifacts/invoice-completion'
const report=JSON.parse(fs.readFileSync(`${root}/verification.json`))
const descriptions={
  UNVERIFIED_PAYMENT_MODE:'Confirm the actual payment method; Offline does not establish whether a card was used.',
  UNVERIFIED_LINE_COST:'Supply authoritative historical cost for the invoice lines; current catalog estimates are not accepted.',
  MISSING_SALESPERSON:'Confirm the invoice salesperson so the historical VIG can be verified.',
  MISSING_PAYMENT_EVIDENCE:'Reconcile payment or applied-credit evidence for the paid amount.',
  PAYMENT_TOTAL_MISMATCH:'Reconcile invoice payments, credits, write-offs, and balance.',
  CONCURRENT_CHANGE_OR_NOT_APPLIED:'Re-read the changed source inputs before recalculating.',
  VERIFICATION_MISMATCH:'Investigate persisted values before certifying the calculation.',
  WAITING_FOR_EVIDENCE:'Finish the pending source read.',
  SOURCE_CHANGED_DURING_RUN:'Refresh the changed provider invoice before recalculating.',
  SOURCE_NOT_IN_INITIAL_SCOPE:'Include this newly observed invoice in the next guarded calculation pass.',
}
const excluded=new Set(['CALCULATED_AND_VERIFIED','EXCLUDED_STATUS','NO_PROVIDER_INVOICE'])
const exceptions=report.documents.filter(row=>!excluded.has(row.result))
const escape=value=>String(value??'').replace(/[|\r\n]/g,' ')
let text=`# Invoices needing completion evidence\n\nObserved: ${report.observedAt}\n\n${exceptions.length} invoices remain unresolved. Existing calculation dates do not certify completion of this verification pass. No costs, payment methods, or salesperson assignments have been guessed.\n`
for(const reason of [...new Set(exceptions.map(row=>row.result))]){
  const rows=exceptions.filter(row=>row.result===reason)
  text+=`\n## ${reason} (${rows.length})\n\n${descriptions[reason]||'Review the source evidence.'}\n\n| Invoice | Invoice date | Local record |\n|---|---|---|\n`
  text+=rows.map(row=>`| ${escape(row.invoiceNumber||'(no number)')} | ${escape(row.date?.slice(0,10))} | ${escape(row.invoiceId)} |`).join('\n')+'\n'
}
fs.writeFileSync(`${root}/exceptions.md`,text)
console.log(JSON.stringify({exceptions:exceptions.length,report:`${root}/exceptions.md`}))
