import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const strong = value => typeof value === 'string' && value.length >= 14 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value)

async function readPipedLines() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)
}

function readLine(prompt, lineReader, pipedLines) {
  if (pipedLines) { output.write(prompt); return Promise.resolve(pipedLines.shift() || '') }
  return lineReader.question(prompt)
}

function readHidden(prompt, lineReader, pipedLines) {
  if (pipedLines) return readLine(prompt, lineReader, pipedLines)
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    // Piped input has no terminal echo; readline consumes it without writing
    // the secret to stdout/stderr. This also makes validation safely testable.
    return lineReader.question(prompt)
  }
  return new Promise((resolve, reject) => {
    const stream = process.stdin
    let value = ''
    output.write(prompt)
    stream.setRawMode(true)
    stream.resume()
    const onData = chunk => {
      for (const char of String(chunk)) {
        if (char === '\u0003') { cleanup(); reject(new Error('INPUT_CANCELLED')); return }
        if (char === '\r' || char === '\n') { cleanup(); output.write('\n'); resolve(value); return }
        if (char === '\u007f' || char === '\b') { if (value) { value = value.slice(0, -1); output.write('\b \b') }; continue }
        if (char >= ' ') { value += char; output.write('*') }
      }
    }
    const cleanup = () => { stream.off('data', onData); stream.setRawMode(false); stream.pause() }
    stream.on('data', onData)
  })
}

let prisma
let rl
try {
  console.log('Credential policy: at least 14 characters, with upper-case, lower-case, number, and symbol.')
  const pipedLines = process.stdin.isTTY ? null : await readPipedLines()
  rl = process.stdin.isTTY ? createInterface({ input, output }) : null
  const email = (await readLine('Master administrator email: ', rl, pipedLines)).trim().toLowerCase()
  const password = await readHidden('Master administrator password: ', rl, pipedLines)
  const confirmation = await readHidden('Confirm password: ', rl, pipedLines)
  if (!email) throw new Error('INVALID_PROVISIONING_INPUT')
  if (!strong(password)) throw new Error(password.length < 14 ? 'PASSWORD_TOO_SHORT' : 'PASSWORD_POLICY_FAILED')
  if (password !== confirmation) throw new Error('PASSWORD_MISMATCH')
  if (process.env.NODE_ENV === 'test' && process.env.MASTER_ADMIN_DRY_RUN === '1') {
    rl?.close(); console.log('MASTER_ADMIN_VALIDATION=PASS'); process.exit(0)
  }
  prisma = new PrismaClient()
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } })
  if (!existing) throw new Error('UNDERLYING_ADMINISTRATOR_NOT_FOUND')
  if (!['admin', 'administrator'].includes(existing.role.trim().toLowerCase())) throw new Error('UNDERLYING_USER_NOT_ADMINISTRATOR')
  const existingCredential = await prisma.localMasterCredential.findUnique({ where: { userId: existing.id }, select: { id: true } })
  if (existingCredential) throw new Error('MASTER_CREDENTIAL_ALREADY_EXISTS_USE_ROTATE_COMMAND')
  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.$transaction(async tx => {
    await tx.localMasterCredential.create({ data: {
      userId: existing.id, loginIdentifier: email, passwordHash, mustRotatePassword: true,
    } })
    await tx.authAuditEvent.create({ data: {
      eventType: 'LOCAL_MASTER_CREDENTIAL_PROVISIONED', actorUserId: existing.id,
      reasonCode: 'EXPLICIT_OPERATOR_COMMAND', entityType: 'LOCAL_MASTER_CREDENTIAL',
      changedFields: { mustRotatePassword: true, active: true },
    } })
  })
  console.log('MASTER_ADMIN_PROVISIONED=PASS')
} catch (error) {
  const category = error instanceof Error ? error.message : 'PROVISIONING_FAILED'
  const safe = new Set(['PASSWORD_INPUT_UNAVAILABLE', 'INPUT_CANCELLED', 'INVALID_PROVISIONING_INPUT', 'PASSWORD_TOO_SHORT', 'PASSWORD_POLICY_FAILED', 'PASSWORD_MISMATCH', 'UNDERLYING_ADMINISTRATOR_NOT_FOUND', 'UNDERLYING_USER_NOT_ADMINISTRATOR', 'MASTER_CREDENTIAL_ALREADY_EXISTS_USE_ROTATE_COMMAND'])
  console.error(safe.has(category) ? category : 'PROVISIONING_FAILED')
  process.exitCode = 1
} finally {
  rl?.close()
  if (prisma) await prisma.$disconnect().catch(() => undefined)
}
