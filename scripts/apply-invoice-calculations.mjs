import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { loadEnvironment } from './invoice-provider-client.mjs'
import { unchangedInvoiceInputs } from './invoice-calculation-version.mjs'
loadEnvironment(process.argv[2])
if (!process.argv.includes('--apply')) throw new Error('APPLY_FLAG_REQUIRED')
const root='artifacts/invoice-completion'
const backup=JSON.parse(fs.readFileSync(`${root}/backup-receipt.json`))
if (!fs.existsSync(backup.path) || fs.statSync(backup.path).size!==backup.bytes || !backup.restoreListEntries) throw new Error('VERIFIED_BACKUP_REQUIRED')
const plan=JSON.parse(fs.readFileSync(`${root}/calculation-plan.json`))
const snapshot=JSON.parse(fs.readFileSync(`${root}/before-snapshot.json`))
const originals=new Map(snapshot.invoices.map(r=>[r.id,r]))
const ready=plan.plans.filter(p=>p.ready)
const prisma=new PrismaClient({log:[]})
const stamp=new Date().toISOString(), run='invoice-reconciliation-20260925-v1'
let updated=0, alreadyApplied=0, concurrentChanges=0, verified=0
try {
  for(let start=0;start<ready.length;start+=100){
    const batch=ready.slice(start,start+100)
    const current=await prisma.invoice.findMany({where:{id:{in:batch.map(p=>p.id)}}})
    const applied=new Set(current.filter(r=>{
      const p=batch.find(p=>p.id===r.id)
      return r.items?.calculationReconciliation?.run===run && Object.entries(p.values).every(([k,v])=>r.items[k]===v) && r.computedProfit===p.values.profit && r.computedVigRate===p.values.vigRate && r.computedDeadProfit===p.values.deadProfitActual && r.computedDeadCost===p.values.deadCostTotal && r.computedUpfront===p.values.commission/2 && r.computedFinal===(p.isPaid?p.values.commission/2:0) && r.costsCalculatedAt?.toISOString()===r.items.costsCalculatedAt
    }).map(r=>r.id))
    alreadyApplied+=applied.size
    const pending=batch.filter(p=>!applied.has(p.id))
    if(!pending.length)continue
    const updates=pending.map(p=>{
      const row=originals.get(p.id),v=p.values
      const isPaid=p.isPaid===true
      const latest=current.find(r=>r.id===p.id)
      const ownUnchanged=latest?.items?.calculationReconciliation?.run===run && latest.updatedAt.toISOString()===latest.items.calculationReconciliation.at
      const refreshedVersion=ownUnchanged||unchangedInvoiceInputs(row,latest)
      return {id:p.id,expectedUpdatedAt:refreshedVersion?latest.updatedAt.toISOString():p.updatedAt,profit:v.profit,deadProfit:v.deadProfitActual,deadCost:v.deadCostTotal,vig:v.vigRate,upfront:v.commission/2,final:isPaid?v.commission/2:0,items:{...v,costsCalculatedAt:stamp,calculationReconciliation:{run,at:stamp,costSource:p.costSource,cardFeeRule:'4.5_PERCENT_GRAND_TOTAL_IF_CARD',providerWriteBack:false}}}
    })
    const batchKey=createHash('sha256').update(JSON.stringify({stamp,updates})).digest('hex')
    const changed=await prisma.$transaction(async tx=>{
      const rows=await tx.$queryRawUnsafe(`UPDATE "Invoice" AS i SET
        "computedProfit"=u.profit,"computedDeadProfit"=u."deadProfit","computedDeadCost"=u."deadCost",
        "computedVigRate"=u.vig,"computedUpfront"=u.upfront,"computedFinal"=u.final,
        items=COALESCE(i.items,'{}'::jsonb)||u.items,"costsCalculatedAt"=$2::timestamptz,
        "appModifiedAt"=$2::timestamptz,"updatedAt"=$2::timestamptz
        FROM jsonb_to_recordset($1::jsonb) AS u(id text,"expectedUpdatedAt" timestamptz,profit double precision,"deadProfit" double precision,"deadCost" double precision,vig double precision,upfront double precision,final double precision,items jsonb)
        WHERE i.id=u.id AND i."updatedAt"=u."expectedUpdatedAt" AND i."syncConflict"=false
        RETURNING i.id`,JSON.stringify(updates),stamp)
      if(rows.length) await tx.operationalAction.create({data:{idempotencyKey:`${run}:${batchKey}`,actionType:'INVOICE_CALCULATION_RECONCILIATION',entityType:'InvoiceBatch',entityId:batchKey,status:'SUCCEEDED',startedAt:new Date(stamp),completedAt:new Date(),attemptCount:1,payload:{rule:'4.5% grand total when card used',backupSha256:backup.sha256,requested:updates.length},result:{invoiceIds:rows.map(r=>r.id),updated:rows.length,concurrentChanges:updates.length-rows.length,providerCalls:0}}})
      return rows
    },{timeout:60000})
    updated+=changed.length;concurrentChanges+=updates.length-changed.length
    const saved=await prisma.invoice.findMany({where:{id:{in:changed.map(r=>r.id)}},select:{id:true,computedProfit:true,computedDeadProfit:true,computedDeadCost:true,computedVigRate:true,computedUpfront:true,computedFinal:true,costsCalculatedAt:true,items:true}})
    for(const row of saved){
      const expected=updates.find(p=>p.id===row.id)
      if(row.computedProfit!==expected.profit||row.computedDeadProfit!==expected.deadProfit||row.computedDeadCost!==expected.deadCost||row.computedVigRate!==expected.vig||row.computedUpfront!==expected.upfront||row.computedFinal!==expected.final||row.items.ccFees!==expected.items.ccFees||row.costsCalculatedAt?.toISOString()!==stamp)throw new Error('READBACK_VERIFICATION_FAILED')
      verified++
    }
    console.log(JSON.stringify({updated,verified,alreadyApplied,concurrentChanges}))
  }
  const confirmed=await prisma.invoice.findMany({where:{id:{in:ready.filter(p=>p.requiresReview).map(p=>p.id)}},select:{id:true,items:true}})
  const reviews=confirmed.filter(r=>r.items?.calculationReconciliation?.run===run).map(r=>{
    const p=ready.find(p=>p.id===r.id)
    return {invoiceId:r.id,documentType:'INVOICE',documentRef:String(p.invoiceNumber||p.zohoId),reasonCode:'NON_GIFT_NONPOSITIVE_PROFIT',sourceType:run,sourceRecord:p.zohoId,metadata:{profit:p.values.profit},status:'OPEN'}
  })
  const reviewResult=reviews.length?await prisma.financialReview.createMany({data:reviews,skipDuplicates:true}):{count:0}
  const receipt={run,stamp,updated,verified,alreadyApplied,concurrentChanges,ready:ready.length,financialReviewsCreated:reviewResult.count,providerWrites:0}
  fs.writeFileSync(`${root}/apply-${stamp.replace(/[:.]/g,'-')}.json`,JSON.stringify(receipt,null,2))
  console.log(JSON.stringify(receipt))
}catch(e){console.error(JSON.stringify({error:e.code||e.name,updated,verified}));process.exitCode=1}
finally{await prisma.$disconnect()}
