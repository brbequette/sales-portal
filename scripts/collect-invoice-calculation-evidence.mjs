import fs from 'node:fs'
import { loadEnvironment, invoiceProviderClient } from './invoice-provider-client.mjs'
loadEnvironment(process.argv[2])
const root = 'artifacts/invoice-completion'
const snapshot = JSON.parse(fs.readFileSync(`${root}/before-snapshot.json`))
const manifest = JSON.parse(fs.readFileSync(`${root}/provider-coverage.json`))
const upstream = new Map(manifest.records.map(r=>[String(r.invoice_id),r]))
const numeric = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
const tasks=[]
for (const row of snapshot.invoices) {
  if (/^(void|voided|orphaned)$/i.test(row.status)) continue
  const id = String(row.items?.booksInvoiceId || row.zohoId), source=upstream.get(id)
  if (!source) continue
  const i=row.items || {}
  const importedAt = Date.parse(i.csvImportedAt || row.lastSyncedAt || '')
  const changed = !Number.isFinite(importedAt) || Date.parse(source.last_modified_time) > importedAt
  if (changed || !numeric(i.deadCostSubjectToVig) || !numeric(i.deadCostNoVig)) tasks.push({ id, type:'details', path:`invoices/${id}` })
  const payments = snapshot.payments.filter(p=>p.invoiceId===id || p.invoiceDbId===row.id)
  const sum=payments.reduce((a,p)=>a+Number(p.amount||0),0)
  if (Math.abs(sum - (Number(source.total)-Number(source.balance)-Number(source.write_off_amount||0))) > 0.011 || payments.some(p=>!p.mode)) tasks.push({id,type:'payments',path:`invoices/${id}/payments`})
}
fs.writeFileSync(`${root}/evidence-tasks.json`, JSON.stringify(tasks))
console.log(JSON.stringify({tasks:tasks.length,details:tasks.filter(t=>t.type==='details').length,payments:tasks.filter(t=>t.type==='payments').length}))
if (!process.argv.includes('--collect')) process.exit(0)
const client=invoiceProviderClient()
let done=0, cached=0
let cursor=0, stopped=false
try {
  const worker=async()=>{ while(!stopped && cursor<tasks.length) {
    const task=tasks[cursor++]
    fs.mkdirSync(`${root}/${task.type}`,{recursive:true})
    const path=`${root}/${task.type}/${task.id}.json`
    if (fs.existsSync(path)) { cached++; continue }
    let data
    try { data=await client.get(task.path) } catch(e) { stopped=true; throw e }
    const value=task.type==='details'?data.invoice:data.payments
    if (!value || (task.type==='payments' && !Array.isArray(value))) throw new Error('INVALID_PROVIDER_EVIDENCE')
    fs.writeFileSync(path,JSON.stringify(value))
    done++
    if(done%25===0) console.log(JSON.stringify({fetched:done,cached,remaining:tasks.length-done-cached}))
  } }
  const outcomes=await Promise.allSettled([worker(),worker(),worker()])
  const failed=outcomes.find(o=>o.status==='rejected')
  if(failed)throw failed.reason
  console.log(JSON.stringify({complete:true,fetched:done,cached}))
} catch(e) { console.error(JSON.stringify({complete:false,fetched:done,cached,error:e.message.startsWith('PROVIDER_')?e.message:e.name}));process.exitCode=1 }
