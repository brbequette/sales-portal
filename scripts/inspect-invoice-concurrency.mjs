import fs from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { PrismaClient } from '@prisma/client'
import { loadEnvironment } from './invoice-provider-client.mjs'
loadEnvironment(process.argv[2])
const root='artifacts/invoice-completion'
const report=JSON.parse(fs.readFileSync(`${root}/verification.json`)),before=JSON.parse(fs.readFileSync(`${root}/before-snapshot.json`))
const ids=report.documents.filter(r=>r.result==='CONCURRENT_CHANGE_OR_NOT_APPLIED').map(r=>r.invoiceId)
const p=new PrismaClient({log:[]})
try {
  const expected=before.invoices.filter(r=>ids.includes(r.id)).map(r=>({id:r.id,updatedAt:r.updatedAt,items:r.items,status:r.status,amount:r.amount}))
  const result=await p.$queryRawUnsafe(`SELECT i.id,i."invoiceNumber",i."updatedAt",to_char(i."updatedAt",'YYYY-MM-DD HH24:MI:SS.US') AS precise,
    date_trunc('milliseconds',i."updatedAt")=e."updatedAt" AS "sameMillisecond",
    i.items IS NOT DISTINCT FROM e.items AS "sameItems",i.status=e.status AS "sameStatus",i.amount=e.amount AS "sameAmount"
    FROM "Invoice" i JOIN jsonb_to_recordset($1::jsonb) AS e(id text,"updatedAt" timestamptz,items jsonb,status text,amount double precision) ON i.id=e.id`,JSON.stringify(expected))
  fs.writeFileSync(`${root}/concurrency-audit.json`,JSON.stringify(result,null,2))
  console.log(JSON.stringify(result))
  const current=await p.invoice.findMany({where:{id:{in:ids}}})
  console.log(JSON.stringify(current.map(row=>({id:row.id,changedFields:Object.keys(row).filter(key=>!isDeepStrictEqual(JSON.parse(JSON.stringify(row[key])),before.invoices.find(r=>r.id===row.id)[key]))}))))
}finally{await p.$disconnect()}
