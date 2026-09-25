import fs from 'node:fs'
import { invoiceCalculationPlan } from './invoice-calculation-plan'
const root='artifacts/invoice-completion'
const snapshot=JSON.parse(fs.readFileSync(`${root}/before-snapshot.json`,'utf8'))
const manifest=JSON.parse(fs.readFileSync(`${root}/provider-coverage.json`,'utf8'))
const upstream=new Map(manifest.records.map((r:any)=>[String(r.invoice_id),r]))
const tasks=JSON.parse(fs.readFileSync(`${root}/evidence-tasks.json`,'utf8'))
const freshness=fs.existsSync(`${root}/provider-freshness.json`)?JSON.parse(fs.readFileSync(`${root}/provider-freshness.json`,'utf8')):null
const changedSources=new Set([...(freshness?.changed||[]),...(freshness?.removed||[])])
const vigSettings=JSON.parse(snapshot.settings.find((s:any)=>s.key==='vig_settings')?.value || '{}')
if(fs.existsSync(`${root}/vig-goals.json`)) {
  for(const goal of JSON.parse(fs.readFileSync(`${root}/vig-goals.json`,'utf8'))) {
    if(goal.manualVigRate==null)continue
    vigSettings[goal.repId] ||= {monthlyVigGoals:[]}
    vigSettings[goal.repId].monthlyVigGoals ||= []
    const existing=vigSettings[goal.repId].monthlyVigGoals.find((g:any)=>g.monthKey===goal.monthKey)
    if(existing)existing.manualVigRate=goal.manualVigRate
    else vigSettings[goal.repId].monthlyVigGoals.push(goal)
  }
}
const plans=[],counts:Record<string,number>={}
for(const row of snapshot.invoices){
  const id=String(row.items?.booksInvoiceId||row.zohoId)
  const path=`${root}/details/${id}.json`, paymentPath=`${root}/payments/${id}.json`
  const detail=fs.existsSync(path)?JSON.parse(fs.readFileSync(path,'utf8')):null
  const payments=fs.existsSync(paymentPath)?JSON.parse(fs.readFileSync(paymentPath,'utf8')):snapshot.payments.filter((p:any)=>p.invoiceId===id||p.invoiceDbId===row.id)
  const waiting=tasks.some((t:any)=>t.id===id&&!fs.existsSync(`${root}/${t.type}/${id}.json`))
  const plan=changedSources.has(id) ? {ready:false,reason:'SOURCE_CHANGED_DURING_RUN'} : waiting ? {ready:false,reason:'WAITING_FOR_EVIDENCE'} : invoiceCalculationPlan(row,upstream.get(id),detail,payments,snapshot.users,vigSettings)
  const state=plan.ready?'READY':plan.reason!
  counts[state]=(counts[state]||0)+1
  plans.push({id:row.id,zohoId:id,invoiceNumber:row.invoiceNumber,updatedAt:row.updatedAt,...plan})
}
fs.writeFileSync(`${root}/calculation-plan.json`,JSON.stringify({at:new Date().toISOString(),counts,plans},null,2))
console.log(JSON.stringify(counts))
