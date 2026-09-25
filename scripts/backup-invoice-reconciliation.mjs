import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { loadEnvironment } from './invoice-provider-client.mjs'
loadEnvironment(process.argv[2])
const url=new URL(process.env.DATABASE_URL)
const values={PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:url.searchParams.get('sslmode')||'require'}
const env={...process.env,...values,WSLENV:[process.env.WSLENV,...Object.keys(values).map(k=>`${k}/u`)].filter(Boolean).join(':')}
const folder='artifacts/invoice-completion'
const path=`${folder}/pre-calculation-${new Date().toISOString().replace(/[:.]/g,'-')}.dump`
const fd=fs.openSync(path,'wx')
const result=spawnSync('wsl.exe',['-d','Ubuntu-24.04','--','docker','run','--rm',...Object.keys(values).flatMap(k=>['-e',k]),'postgres:17-alpine','pg_dump','--format=custom','--compress=6','--no-owner','--no-privileges'],{env,stdio:['ignore',fd,'pipe'],windowsHide:true})
fs.closeSync(fd)
if(result.status!==0) { console.error('BACKUP_FAILED');process.exit(1) }
const input=fs.openSync(path,'r')
const verify=spawnSync('wsl.exe',['-d','Ubuntu-24.04','--','docker','run','--rm','-i','postgres:17-alpine','pg_restore','--list'],{stdio:[input,'pipe','pipe'],windowsHide:true,maxBuffer:5*1024*1024})
fs.closeSync(input)
if(verify.status!==0) { console.error('RESTORE_LIST_FAILED');process.exit(1) }
const receipt={path,bytes:fs.statSync(path).size,sha256:createHash('sha256').update(fs.readFileSync(path)).digest('hex'),restoreListEntries:verify.stdout.toString().split('\n').filter(l=>l&&!l.startsWith(';')).length,verifiedAt:new Date().toISOString()}
fs.writeFileSync(`${folder}/backup-receipt.json`,JSON.stringify(receipt,null,2))
console.log(JSON.stringify(receipt))
