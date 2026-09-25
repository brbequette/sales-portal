import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { telegramOriginAllowed } from '../src/lib/telegram-origin.ts'

const origin = 'https://portal.example.com'
test('accepts the configured public browser origin independently of proxy request URL', () => {
  assert.equal(telegramOriginAllowed(origin, origin), true)
  assert.equal(telegramOriginAllowed(origin, origin + '/'), true)
})
test('rejects absent, opaque, lookalike, downgraded and alternate-port origins', () => {
  for (const actual of [null, '', 'null', 'https://evil.example', 'https://portal.example.com.evil.test',
    'http://portal.example.com', origin + ':444', origin + '/', origin + ', https://evil.example']) {
    assert.equal(telegramOriginAllowed(actual, origin), false, String(actual))
  }
})
test('fails closed for invalid or unset trusted origin configuration', () => {
  for (const configured of [undefined, '', 'null', 'http://portal.example.com', origin + '/path',
    origin + '?x=1', origin + '#fragment', 'https://user:pass@portal.example.com']) {
    assert.equal(telegramOriginAllowed(origin, configured), false, String(configured))
  }
})
test('pairing and disconnect both retain origin checks before session or data access', () => {
  const route = readFileSync(new URL('../src/app/api/telegram/link/route.ts', import.meta.url), 'utf8')
  for (const method of ['POST', 'DELETE']) {
    const handler = route.split(`export async function ${method}`)[1].split('export async function')[0]
    assert.ok(handler.indexOf('telegramOriginAllowed(') < handler.indexOf('await currentUser()'))
    assert.match(handler, /process\.env\.TELEGRAM_PUBLIC_ORIGIN/)
    assert.match(handler, /status: 403/)
  }
  assert.doesNotMatch(route, /req\.nextUrl\.origin|x-forwarded-host/)
})
