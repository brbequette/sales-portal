import fs from 'node:fs'
import { loadEnvironment, invoiceProviderClient } from './invoice-provider-client.mjs'
loadEnvironment(process.argv[2])
const root='artifacts/invoice-completion'
const plan=JSON.parse(fs.readFileSync(`${root}/calculation-plan.json`))
const pending=plan.plans.filter(row=>['MISSING_PAYMENT_EVIDENCE','PAYMENT_TOTAL_MISMATCH'].includes(row.reason)&&!fs.existsSync(`${root}/details/${row.zohoId}.json`))
// Run only after the primary collector exits; the call ledger has one owner.
const client=invoiceProviderClient()
let fetched=0
for(const row of pending){
  const result=await client.get(`invoices/${row.zohoId}`)
  if(!result.invoice)throw new Error('INVALID_PROVIDER_EVIDENCE')
  fs.writeFileSync(`${root}/details/${row.zohoId}.json`,JSON.stringify(result.invoice))
  fetched++
}
console.log(JSON.stringify({fetched}))
