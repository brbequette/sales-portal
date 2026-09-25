import fs from 'node:fs'
import { loadEnvironment, invoiceProviderClient } from './invoice-provider-client.mjs'
loadEnvironment(process.argv[2])
const root='artifacts/invoice-completion'
const before=JSON.parse(fs.readFileSync(`${root}/provider-coverage.json`))
const previous=new Map(before.records.map(row=>[String(row.invoice_id),row]))
const client=invoiceProviderClient(),records=[]
for(let page=1;page<=100;page++){
  const result=await client.get('invoices',{page:String(page),per_page:'200'})
  if(!Array.isArray(result.invoices))throw new Error('INVALID_PROVIDER_LIST')
  records.push(...result.invoices)
  if(!result.page_context?.has_more_page)break
  if(page===100)throw new Error('PROVIDER_LIST_PAGE_CAP')
}
const current=new Set(records.map(row=>String(row.invoice_id)))
const added=records.filter(row=>!previous.has(String(row.invoice_id))).map(row=>String(row.invoice_id))
const changed=records.filter(row=>{
  const old=previous.get(String(row.invoice_id))
  return old&&['last_modified_time','total','balance','status','salesperson_name','write_off_amount'].some(key=>String(old[key]??'')!==String(row[key]??''))
}).map(row=>String(row.invoice_id))
const removed=[...previous.keys()].filter(id=>!current.has(id))
const result={observedAt:new Date().toISOString(),records,added,changed,removed}
fs.writeFileSync(`${root}/provider-freshness.json`,JSON.stringify(result,null,2))
console.log(JSON.stringify({count:records.length,added:added.length,changed:changed.length,removed:removed.length}))
