import fs from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { loadEnvironment } from './invoice-provider-client.mjs'
loadEnvironment(process.argv[2])
const root='artifacts/invoice-completion',run='invoice-reconciliation-20260925-v1'
const plan=JSON.parse(fs.readFileSync(`${root}/calculation-plan.json`))
const expected=new Map(plan.plans.map(r=>[r.id,r]))
const freshness=fs.existsSync(`${root}/provider-freshness.json`)?JSON.parse(fs.readFileSync(`${root}/provider-freshness.json`)):null
const changedSources=new Set([...(freshness?.changed||[]),...(freshness?.removed||[])])
const p=new PrismaClient({log:[]})
const money=v=>Math.sign(v)*Math.round((Math.abs(v)+Number.EPSILON)*100)/100
try {
  const rows=await p.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
    return tx.invoice.findMany({select:{id:true,invoiceNumber:true,issueDate:true,status:true,items:true,costsCalculatedAt:true,computedProfit:true,computedDeadProfit:true,computedDeadCost:true,computedVigRate:true,computedUpfront:true,computedFinal:true}})
  },{timeout:60000,isolationLevel:'RepeatableRead'})
  const counts={},documents=[]
  for(const row of rows){
    const exp=expected.get(row.id),items=row.items||{}
    let state=exp?.reason||'NOT_IN_INITIAL_SCOPE'
    if(exp?.ready){
      if(items.calculationReconciliation?.run!==run)state='CONCURRENT_CHANGE_OR_NOT_APPLIED'
      else {
        const v=exp.values
        const matches=Object.entries(v).every(([k,value])=>items[k]===value) && row.computedProfit===v.profit && row.computedDeadProfit===v.deadProfitActual && row.computedDeadCost===v.deadCostTotal && row.computedVigRate===v.vigRate && row.computedUpfront===v.commission/2 && row.computedFinal===(exp.isPaid?v.commission/2:0) && row.costsCalculatedAt?.toISOString()===items.costsCalculatedAt
        const arithmetic=Math.abs(row.computedProfit-money(items.sub_total-money(items.deadCostSubjectToVig*items.vigRate+items.deadCostNoVig)-items.ccFees-items.additionalCosts))<0.001
          && Math.abs(items.commission-money(row.computedProfit*(row.computedProfit<0?0.5:items.commissionPercent/100)))<0.001
          && Math.abs(row.computedDeadProfit-money(items.sub_total-items.deadCostTotal-items.ccFees))<0.001
        state=matches&&arithmetic?'CALCULATED_AND_VERIFIED':'VERIFICATION_MISMATCH'
      }
    }
    if(exp&&changedSources.has(exp.zohoId))state='SOURCE_CHANGED_DURING_RUN'
    counts[state]=(counts[state]||0)+1
    documents.push({invoiceNumber:row.invoiceNumber,invoiceId:row.id,date:row.issueDate,status:row.status,result:state,lastCalculated:row.costsCalculatedAt})
  }
  for(const id of freshness?.added||[]){
    counts.SOURCE_NOT_IN_INITIAL_SCOPE=(counts.SOURCE_NOT_IN_INITIAL_SCOPE||0)+1
    const source=freshness.records.find(row=>String(row.invoice_id)===id)
    documents.push({invoiceNumber:source?.invoice_number,invoiceId:id,date:source?.date,status:source?.status,result:'SOURCE_NOT_IN_INITIAL_SCOPE',lastCalculated:null})
  }
  const calls=JSON.parse(fs.readFileSync(`${root}/provider-call-ledger.json`)).calls
  const complete=Object.keys(counts).every(k=>['CALCULATED_AND_VERIFIED','EXCLUDED_STATUS','NO_PROVIDER_INVOICE'].includes(k))
  const result={observedAt:new Date().toISOString(),sourceFreshnessCheckedAt:freshness?.observedAt||null,complete,providerCalls:calls,providerWrites:0,counts,documents}
  fs.writeFileSync(`${root}/verification.json`,JSON.stringify(result,null,2))
  const markdown=`# Invoice calculation verification\n\nObserved: ${result.observedAt}\n\nCompletion: ${complete?'complete':'incomplete — unresolved invoices remain'}\n\nProvider calls: ${calls} / 14,999. Provider writes: 0.\n\nRule: 4.5% of invoice grand total when a positive card payment exists. Historical VIG rates are preserved unless an authoritative override applies.\n\n| Result | Invoices |\n|---|---:|\n${Object.entries(counts).map(([k,v])=>`| ${k} | ${v} |`).join('\n')}\n\nCalculated timestamps record successful database persistence. They do not imply that a financial-review exception has been approved. Void invoices are excluded; the sole known orphan is preserved. See verification.json for invoice-level results.\n`
  fs.writeFileSync(`${root}/verification.md`,markdown)
  console.log(JSON.stringify({complete,providerCalls:calls,counts}))
}catch(e){console.error(JSON.stringify({error:e.code||e.name}));process.exitCode=1}finally{await p.$disconnect()}
