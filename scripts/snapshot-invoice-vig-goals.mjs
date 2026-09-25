import fs from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { loadEnvironment } from './invoice-provider-client.mjs'
loadEnvironment(process.argv[2])
const p=new PrismaClient({log:[]})
try {
  const rows=await p.monthlyVigGoal.findMany({select:{repId:true,monthKey:true,manualVigRate:true,lastSyncedVigRate:true,lastSyncedAt:true}})
  fs.writeFileSync('artifacts/invoice-completion/vig-goals.json',JSON.stringify(rows))
  console.log(JSON.stringify({rows:rows.length,manualOverrides:rows.filter(r=>r.manualVigRate!=null).length,recordedRates:rows.filter(r=>r.lastSyncedVigRate!=null).length}))
} finally {await p.$disconnect()}
