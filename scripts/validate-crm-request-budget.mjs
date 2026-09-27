import { build } from 'esbuild'
import fs from 'node:fs'
const entries = fs.readdirSync('netlify/functions').filter(n => n.endsWith('.ts') && !n.endsWith('.test.ts')).map(n => `netlify/functions/${n}`)
await build({ entryPoints: entries, outdir: '.codex-tmp/crm-function-bundles', bundle: true, platform: 'node', target: 'node20', format: 'esm', packages: 'external', write: false, logLevel: 'warning' })
console.log(`FUNCTION_BUNDLES_PASS=${entries.length}`)
