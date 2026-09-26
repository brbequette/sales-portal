import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
const fixture = fs.readFileSync(new URL('../prisma/tests/durable-po-order-links.sql', import.meta.url), 'utf8')
const migration = fs.readFileSync(new URL('../prisma/migrations/20260926001000_durable_po_order_links/migration.sql', import.meta.url), 'utf8')
const sql = fixture.replace('-- INSERT_MIGRATION_HERE', () => migration)
const dockerArgs = ['run', '--rm', '-i', '--network', 'none', '--user', 'postgres', 'postgres:17-alpine', 'sh', '-c', 'initdb -D /tmp/po-link-test -A trust >/dev/null && pg_ctl -D /tmp/po-link-test -o "-k /tmp -c listen_addresses=" -w start >/dev/null && psql -h /tmp -d postgres -v ON_ERROR_STOP=1']
const result = process.platform === 'win32'
  ? spawnSync('wsl.exe', ['-d', 'Ubuntu-24.04', '--', 'docker', ...dockerArgs], { input: sql, encoding: 'utf8', windowsHide: true })
  : spawnSync('docker', dockerArgs, { input: sql, encoding: 'utf8' })
process.stdout.write(result.stdout || '')
process.stderr.write(result.stderr || '')
if (result.error) console.error(result.error.message)
process.exitCode = result.status ?? 1
