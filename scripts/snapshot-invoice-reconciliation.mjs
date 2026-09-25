import fs from 'node:fs'
import { PrismaClient } from '@prisma/client'
for (const line of fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2')
}
const p = new PrismaClient({ log: [] })
try {
  const snapshot = await p.$transaction(async t => {
    await t.$executeRawUnsafe('SET TRANSACTION READ ONLY')
    return { at: new Date().toISOString(), invoices: await t.invoice.findMany(), payments: await t.payment.findMany(), users: await t.user.findMany({ select: { id: true, name: true, constantVigEnabled: true, constantVigValue: true } }), settings: await t.systemSetting.findMany({ where: { key: { in: ['vig_settings', 'app_settings'] } } }) }
  }, { timeout: 120000, isolationLevel: 'RepeatableRead' })
  const path = 'artifacts/invoice-completion/before-snapshot.json'
  if (fs.existsSync(path)) throw new Error('SNAPSHOT_ALREADY_EXISTS')
  fs.writeFileSync(path, JSON.stringify(snapshot))
  const modes = {}
  for (const p of snapshot.payments) modes[p.mode || '(missing)'] = (modes[p.mode || '(missing)'] || 0) + 1
  const samples = [2018,2022,2025,2026].map(year => {
    const row = snapshot.invoices.find(i => new Date(i.issueDate).getUTCFullYear() === year && i.status.toLowerCase() === 'paid')
    return { year, itemKeys: Object.keys(row?.items || {}), rawKeys: Object.keys(row?.rawData || {}), lineKeys: Object.keys(row?.items?.line_items?.[0] || {}), customFieldNames: (row?.items?.custom_fields || []).map(f=>({ label:f.label, api_name:f.api_name })) }
  })
  console.log(JSON.stringify({ invoices: snapshot.invoices.length, payments: snapshot.payments.length, modes, samples }))
} catch (e) { console.error(JSON.stringify({ error: e.code || e.name })); process.exitCode = 1 }
finally { await p.$disconnect() }
